import { ipcMain, dialog, shell, app } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { IpcChannels } from "@shared/ipc";
import type { AppStatus, LoginResult, TodaySessionEntry } from "@shared/types";
import { api, ApiError } from "./api";
import { auth, prefs } from "./auth";
import { config } from "./config";
import { autoStart } from "./autoStart";
import { localDb } from "./localDb";
import { syncWorker } from "./syncWorker";
import { meetingWatcher } from "./meetingWatcher";
import { isAccessibilityGranted, maybePromptAccessibility } from "./macAccessibility";
import { idleMonitor } from "./idleMonitor";
import { getMainWindow, showMainWindow } from "./windows";
import { getWidgetWindow, hideWidget, toggleWidget, isWidgetVisible, setWidgetSize, type WidgetSize } from "./widget";
import { rebuild as rebuildTray } from "./tray";
import { notify } from "./notifications";
import { isHttpUrl, rejectUnsafe } from "./urlSafety";
import { log } from "./logger";

let sessionActive = false;
let currentSessionId: string | null = null;
let currentSessionStartedAt: string | null = null;
let currentBreakId: string | null = null;
let currentBreakStartedAt: string | null = null;
let connectionOnline = true;

// Today's session/break list. Refreshed from the server by
// `refreshTodayTotals()` every 30s for the timeline view. The numeric
// totals (active / idle / break seconds) are NOT cached here — they are
// derived live from the local SQLite buffer + the in-progress bucket
// accumulator + this entries list (see computeTodayTotals below) so that
// the dashboard never lags the wall-clock timer.
let todayEntries: TodaySessionEntry[] = [];
let todayRefreshBusy = false;

// Idle-nudge + EOD reminder state
let lastNudgeAt = 0;
let nudgeSnoozedUntil = 0;
let lastEodNudgeLocalDate = "";

// Auto-break state: id of a break the app started automatically on prolonged
// idle. Cleared when the break ends (auto or manual) so we can tell whether
// the currently-open break was user-initiated or machine-initiated.
let autoBreakId: string | null = null;

function liveState(): AppStatus["live_state"] {
  if (!sessionActive) return "offline";
  if (currentBreakId) return "on_break";
  return "active";
}

/**
 * Compute today's totals from the most authoritative sources available:
 *   - active / idle: sum of all locally-stored buckets for today (synced
 *     + pending) + the in-progress bucket accumulator.
 *   - break: sum of break entries (closing an open break with `now`).
 *
 * This guarantees that
 *   today_active_seconds + today_idle_seconds + today_break_seconds
 * always tracks the live wall-clock since session start, with at most one
 * sample-interval (~10s) of lag. Previously these were pulled from the
 * server, which made them lag by up to (60s bucket close + 60s sync push
 * + 30s poll = 2.5 min) in the best case, and minutes longer when the
 * sync worker was backing off.
 */
function computeTodayTotals(): { active: number; idle: number; brk: number } {
  const a = auth.get();
  if (!a.profile) return { active: 0, idle: 0, brk: 0 };
  const tz = a.profile.timezone;
  let active = 0;
  let idle = 0;
  try {
    const localDate = formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
    const dayStart = fromZonedTime(`${localDate} 00:00:00`, tz).toISOString();
    const dayEnd = fromZonedTime(`${localDate} 23:59:59.999`, tz).toISOString();
    const flushed = localDb.todayBucketTotals(dayStart, dayEnd);
    const live = syncWorker.currentBucketAccum();
    active = flushed.active_seconds + Math.floor(live.active);
    idle = flushed.idle_seconds + Math.floor(live.idle);
  } catch {
    // localDb / tz issue — fall through with zeros so the UI doesn't crash.
  }
  // Break time = sum over today's break entries; an open break uses `now`.
  const now = Date.now();
  let brk = 0;
  for (const e of todayEntries) {
    if (e.kind !== "break") continue;
    const start = Date.parse(e.started_at);
    if (Number.isNaN(start)) continue;
    const end = e.ended_at ? Date.parse(e.ended_at) : now;
    if (Number.isNaN(end) || end <= start) continue;
    brk += Math.floor((end - start) / 1000);
  }
  return { active, idle, brk };
}

function status(): AppStatus {
  const a = auth.get();
  const p = prefs.get();
  const totals = computeTodayTotals();
  return {
    signed_in: !!a.accessToken && !!a.profile,
    profile: a.profile ?? undefined,
    session_active: sessionActive,
    on_break: !!currentBreakId,
    session_started_at: currentSessionStartedAt,
    break_started_at: currentBreakStartedAt,
    today_active_seconds: totals.active,
    today_idle_seconds: totals.idle,
    today_break_seconds: totals.brk,
    today_entries: todayEntries,
    pending_sync_count: syncWorker.pending(),
    last_sync_ok_at: syncWorker.lastOk(),
    last_sync_error: syncWorker.lastErr(),
    connection: connectionOnline ? "online" : "offline",
    live_state: liveState(),
    privacy_acknowledged: p.privacyAcknowledged,
    auto_start: autoStart.isEnabled(),
    end_of_day_reminder_hour: p.endOfDayReminderHour,
    dark_mode: p.darkMode,
    auto_break_on_idle: p.autoBreakOnIdle,
    meeting_notifications_enabled: p.meetingNotificationsEnabled,
    meeting_alarm_enabled: p.meetingAlarmEnabled,
    meeting_reminder_minutes: p.meetingReminderMinutes,
    auto_lock_minutes: p.autoLockMinutes,
    accessibility_granted: isAccessibilityGranted(),
    widget_visible: isWidgetVisible(),
  };
}

export function pushStatus() {
  const snapshot = status();
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(IpcChannels.statusUpdate, snapshot);
  }
  const widget = getWidgetWindow();
  if (widget && !widget.isDestroyed()) {
    widget.webContents.send(IpcChannels.statusUpdate, snapshot);
  }
}

async function refreshTodayTotals() {
  const s = auth.get();
  if (!s.profile || todayRefreshBusy) return;
  todayRefreshBusy = true;
  try {
    const tz = s.profile.timezone;
    const localDate = formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
    // We still pull the server's day-detail for the timeline (sessions +
    // breaks list shown on the dashboard), but we no longer trust its
    // numeric totals — those are computed live in computeTodayTotals().
    const d = await api.dayDetail(localDate);
    const sessionEndedAt = new Map<string, string | null>();
    for (const s of d.sessions) sessionEndedAt.set(s.id, s.ended_at);

    todayEntries = [
      ...d.sessions.map((x): TodaySessionEntry => ({
        kind: "session", id: x.id, started_at: x.started_at, ended_at: x.ended_at,
      })),
      ...d.breaks.map((x): TodaySessionEntry => {
        // Reconcile: a break can never outlive its session.
        let endedAt = x.ended_at;
        if (endedAt === null) {
          const parentEnded = sessionEndedAt.get(x.session_id);
          if (parentEnded) endedAt = parentEnded;
        }
        return {
          kind: "break", id: x.id, session_id: x.session_id,
          started_at: x.started_at, ended_at: endedAt, reason: x.reason,
        };
      }),
    ].sort((a, b) => a.started_at.localeCompare(b.started_at));
    pushStatus();
  } catch {
    // non-fatal; dashboard keeps the last known timeline + the locally-
    // computed totals continue to update from idle samples.
  } finally {
    todayRefreshBusy = false;
  }
}

let todayTimer: NodeJS.Timeout | null = null;
function startTodayPoller() {
  if (todayTimer) return;
  void refreshTodayTotals();
  void refreshProfile();
  todayTimer = setInterval(() => {
    void refreshTodayTotals();
    void refreshProfile();
  }, 30_000);
}
function stopTodayPoller() {
  if (todayTimer) clearInterval(todayTimer);
  todayTimer = null;
  todayEntries = [];
}

async function refreshProfile() {
  if (!auth.get().accessToken) return;
  try {
    const me = await api.getMe();
    const cur = auth.get().profile;
    // Clamp the same way auth.login does — never trust raw server values.
    const idle = Math.min(30, Math.max(1, Math.round(me.idle_threshold_minutes)));
    const targetHours = Math.min(24, Math.max(1, me.target_hours_per_day));
    auth.setProfile({
      user_id: me.user_id,
      name: me.name,
      email: me.email,
      role: me.role,
      position: me.position,
      team_id: me.team_id,
      team_name: me.team_name,
      timezone: me.timezone,
      idle_threshold_minutes: idle,
      target_hours_per_day: targetHours,
    });
    // If the admin updated the org idle threshold, push it to the live
    // monitor — without this the desktop kept using the value from /auth/login
    // until the next sign-in.
    if (cur?.idle_threshold_minutes !== idle) {
      idleMonitor.setThreshold(idle);
    }
    pushStatus();
  } catch {
    // non-fatal; UI keeps the last known profile
  }
}

// ---- Idle nudge + end-of-day reminder ------------------------------------

let nudgeTimer: NodeJS.Timeout | null = null;
let autoBreakTimer: NodeJS.Timeout | null = null;
let autoLockTimer: NodeJS.Timeout | null = null;
function startNudgeMonitor() {
  if (!nudgeTimer) {
    nudgeTimer = setInterval(() => {
      try { evaluateNudges(); } catch (e) { log.warn("[nudge]", (e as Error).message); }
    }, 60_000);
  }
  if (!autoBreakTimer) {
    // Auto-break evaluation runs more often so "welcome back" fires within ~20s
    // of the user returning rather than making them wait a full minute.
    autoBreakTimer = setInterval(() => {
      try { evaluateAutoBreak(); } catch (e) { log.warn("[auto-break]", (e as Error).message); }
    }, 20_000);
  }
  if (!autoLockTimer) {
    autoLockTimer = setInterval(() => {
      try { evaluateAutoLock(); } catch (e) { log.warn("[auto-lock]", (e as Error).message); }
    }, 30_000);
  }
}
function stopNudgeMonitor() {
  if (nudgeTimer) clearInterval(nudgeTimer);
  nudgeTimer = null;
  if (autoBreakTimer) clearInterval(autoBreakTimer);
  autoBreakTimer = null;
  if (autoLockTimer) clearInterval(autoLockTimer);
  autoLockTimer = null;
}

let autoLocking = false;
function evaluateAutoLock() {
  if (autoLocking) return;
  const a = auth.get();
  if (!a.accessToken) return;
  const p = prefs.get();
  if (!p.autoLockMinutes || p.autoLockMinutes <= 0) return;
  const idleSec = idleMonitor.lastIdleSeconds();
  if (idleSec < p.autoLockMinutes * 60) return;
  autoLocking = true;
  void (async () => {
    try {
      log.warn(`[auto-lock] idle ${idleSec}s ≥ ${p.autoLockMinutes}m — locking`);
      // End any active session first so the gap doesn't keep counting as idle.
      if (sessionActive) await doEndWork();
      try { await api.logout(); } catch { /* ignore */ }
      syncWorker.stop();
      stopTodayPoller();
      stopNudgeMonitor();
      meetingWatcher.stop();
      auth.clear();
      pushStatus();
      // Bring the main window forward so the renderer's auth-redirect is
      // visible — otherwise users wouldn't know they were locked out.
      try { showMainWindow(); } catch { /* ignore */ }
    } finally {
      autoLocking = false;
    }
  })();
}

function evaluateAutoBreak() {
  const p = prefs.get();
  const a = auth.get();
  if (!a.profile || !sessionActive || !p.autoBreakOnIdle) return;

  const thresholdSec = (a.profile.idle_threshold_minutes ?? 5) * 60;
  const idleSec = idleMonitor.lastIdleSeconds();

  if (!currentBreakId && idleSec >= thresholdSec * 2) {
    void autoStartBreak();
    return;
  }

  // Only auto-end the break we started ourselves — don't touch manual breaks.
  if (currentBreakId && autoBreakId === currentBreakId && idleSec < 30) {
    void autoEndBreak();
  }
}

async function autoStartBreak() {
  if (!sessionActive || !currentSessionId || currentBreakId) return;
  const now = new Date().toISOString();
  try {
    const r = await api.startBreak(currentSessionId, now, "auto: idle");
    currentBreakId = r.break_id;
    currentBreakStartedAt = now;
    autoBreakId = r.break_id;
    syncWorker.setBreak(true);
    notify("Work auto-paused", "Idle for a while — FDM started a break. Move your mouse to resume.", showMainWindow);
  } catch (e) {
    log.error("[auto-break:start]", e);
  }
  pushStatus();
  void refreshTodayTotals();
}

async function autoEndBreak() {
  if (!currentBreakId) return;
  const bid = currentBreakId;
  const now = new Date().toISOString();
  try { await api.endBreak(bid, now); } catch (e) { log.error("[auto-break:end]", e); }
  currentBreakId = null;
  currentBreakStartedAt = null;
  autoBreakId = null;
  syncWorker.setBreak(false);
  notify("Welcome back", "Auto-break ended — tracking resumed.", showMainWindow);
  pushStatus();
  void refreshTodayTotals();
}

function evaluateNudges() {
  const p = prefs.get();
  const a = auth.get();
  if (!a.profile) return;

  // Idle nudge: only fire while a session is open, not on break, and user has been
  // inactive ≥ 2× the idle threshold. Cooldown 10 min between nudges.
  if (sessionActive && !currentBreakId) {
    const thresholdSec = (a.profile.idle_threshold_minutes ?? 5) * 60;
    const idleSec = idleMonitor.lastIdleSeconds();
    const now = Date.now();
    if (
      idleSec >= thresholdSec * 2 &&
      now - lastNudgeAt > 10 * 60_000 &&
      now > nudgeSnoozedUntil
    ) {
      lastNudgeAt = now;
      notify(
        "Still working?",
        `No activity for ${Math.round(idleSec / 60)} min. Take a break or keep going — open FDM Tracker to decide.`,
        showMainWindow,
      );
    }
  }

  // End-of-day reminder: fire once per local day at the configured hour, if a
  // session is still open past that hour. Mention the target gap when the
  // user is still short of their daily target.
  if (p.endOfDayReminderHour != null && sessionActive) {
    const tz = a.profile.timezone;
    const now = new Date();
    const h = parseInt(formatInTimeZone(now, tz, "H"), 10);
    const localDate = formatInTimeZone(now, tz, "yyyy-MM-dd");
    if (h >= p.endOfDayReminderHour && lastEodNudgeLocalDate !== localDate) {
      lastEodNudgeLocalDate = localDate;
      const targetSec = (a.profile.target_hours_per_day ?? 8) * 3600;
      const t = computeTodayTotals();
      const loggedSec = t.active + t.idle + t.brk;
      const gapSec = Math.max(0, targetSec - loggedSec);
      const body =
        gapSec > 0
          ? `It's past ${p.endOfDayReminderHour}:00. You're ${Math.round(gapSec / 60)} min short of today's ${a.profile.target_hours_per_day ?? 8}-hour target. Click to open the app.`
          : `It's past ${p.endOfDayReminderHour}:00 and your session is still open. Target reached — click to end it.`;
      notify("End-of-day reminder", body, showMainWindow);
    }
  }
}

// ---- Tray wiring ---------------------------------------------------------

function rebuildTrayWithHandlers(handlers: {
  startWork: () => Promise<void>;
  endWork: () => Promise<void>;
  startBreak: () => Promise<void>;
  endBreak: () => Promise<void>;
}) {
  rebuildTray({
    isSessionActive: () => sessionActive,
    isOnBreak: () => !!currentBreakId,
    startWork: () => { void handlers.startWork(); },
    endWork: () => { void handlers.endWork(); },
    startBreak: () => { void handlers.startBreak(); },
    endBreak: () => { void handlers.endBreak(); },
  });
}

function ensureFingerprint(): string {
  const p = prefs.get();
  if (p.deviceFingerprint) return p.deviceFingerprint;
  const fp = `${os.hostname()}-${randomUUID()}`;
  prefs.set("deviceFingerprint", fp);
  return fp;
}

// ---- Session + break actions --------------------------------------------

async function doStartWork() {
  const s = auth.get();
  if (!s.profile) return;
  const now = new Date().toISOString();
  try {
    const r = await api.startSession(now);
    currentSessionId = r.session_id;
    currentSessionStartedAt = r.started_at ?? now;
    sessionActive = true;
    syncWorker.setSession(r.session_id);
    // Persist so a crash / shutdown doesn't lose the open session.
    localDb.setState("session", JSON.stringify({
      id: r.session_id,
      started_at: currentSessionStartedAt,
    }));
  } catch (e) {
    log.error("[work:start]", e);
  }
  pushStatus();
  void refreshTodayTotals();
}

/** Restore an open session from local state when the app relaunches.
 * Fills the gap between the last bucket and now as idle so the timeline
 * has continuous coverage across the crash/restart. */
export function restoreOpenSessionIfAny(): void {
  if (sessionActive) return;
  const raw = localDb.getState("session");
  if (!raw) return;
  let saved: { id: string; started_at: string } | null = null;
  try { saved = JSON.parse(raw); } catch { saved = null; }
  if (!saved || !saved.id || !saved.started_at) {
    localDb.setState("session", "");
    return;
  }
  // Drop sessions older than 24h — those are almost certainly stale (user
  // forgot to End Work yesterday). Better to require a fresh Start than to
  // record a 12-hour 'session' that's mostly idle.
  const ageMs = Date.now() - new Date(saved.started_at).getTime();
  if (ageMs > 24 * 60 * 60 * 1000 || ageMs < 0) {
    localDb.setState("session", "");
    return;
  }
  currentSessionId = saved.id;
  currentSessionStartedAt = saved.started_at;
  sessionActive = true;
  syncWorker.setSession(saved.id);
}

async function doEndWork() {
  if (!sessionActive || !currentSessionId) return;
  const sid = currentSessionId;
  const now = new Date().toISOString();
  syncWorker.forceFlushBucket();
  await syncWorker.forceSync();
  // End any open break BEFORE closing the session — otherwise the break's
  // ended_at gets stamped by the server as part of session-end auto-cleanup,
  // which is fine but skips the explicit attempt here. Doing it first means
  // the per-break duration is exactly what the user intended.
  if (currentBreakId) {
    try { await api.endBreak(currentBreakId, now); } catch (e) { log.error("[work:end-break]", e); }
    currentBreakId = null;
    currentBreakStartedAt = null;
    autoBreakId = null;
  }
  try { await api.endSession(sid, now); } catch (e) { log.error("[work:end]", e); }
  sessionActive = false;
  currentSessionId = null;
  currentSessionStartedAt = null;
  syncWorker.setSession(null);
  localDb.setState("session", "");
  pushStatus();
  void refreshTodayTotals();
}

async function doStartBreak() {
  if (!sessionActive || !currentSessionId || currentBreakId) return;
  const now = new Date().toISOString();
  try {
    const r = await api.startBreak(currentSessionId, now);
    currentBreakId = r.break_id;
    currentBreakStartedAt = now;
    syncWorker.setBreak(true);
  } catch (e) { log.error("[break:start]", e); }
  pushStatus();
  void refreshTodayTotals();
}

async function doEndBreak() {
  if (!currentBreakId) return;
  const bid = currentBreakId;
  const now = new Date().toISOString();
  let ok = false;
  try {
    await api.endBreak(bid, now);
    ok = true;
  } catch (e) {
    log.error("[break:end]", e);
  }
  // Only clear local state when the server confirmed the break ended. If
  // the API call failed, keep currentBreakId so the UI still shows
  // 'On break' and the user can retry — instead of going silently out of
  // sync with the server.
  if (ok) {
    currentBreakId = null;
    currentBreakStartedAt = null;
    autoBreakId = null;
    syncWorker.setBreak(false);
  }
  pushStatus();
  void refreshTodayTotals();
}

async function doEndBreakById(breakId: string) {
  if (!breakId) return;
  // If this is the in-memory active break, go through the normal end flow so
  // local state (currentBreakId + autoBreakId) stays consistent.
  if (breakId === currentBreakId) {
    await doEndBreak();
    return;
  }
  // Otherwise it's an orphaned row from a crashed session — close it server-side.
  const now = new Date().toISOString();
  try { await api.endBreak(breakId, now); } catch (e) { log.error("[break:endById]", e); }
  pushStatus();
  void refreshTodayTotals();
}

async function toggleBreak() {
  if (!sessionActive) return;
  if (currentBreakId) await doEndBreak();
  else await doStartBreak();
  rebuildTrayWithHandlers({ startWork: doStartWork, endWork: doEndWork, startBreak: doStartBreak, endBreak: doEndBreak });
}

// ---- IPC handlers --------------------------------------------------------

export function registerIpc() {
  ipcMain.handle(IpcChannels.getStatus, async () => status());
  ipcMain.handle(IpcChannels.apiBase, async () => config.apiBase);

  ipcMain.handle(IpcChannels.login, async (_e, body: { email: string; password: string }): Promise<LoginResult> => {
    try {
      const fp = ensureFingerprint();
      const profile = await api.login(body.email.trim().toLowerCase(), body.password, fp, process.platform, os.hostname());
      syncWorker.start(profile.idle_threshold_minutes, () => { pushStatus(); void refreshTodayTotals(); });
      // Push status on every idle sample (~10s) so the renderer's live
      // active/idle/break totals stay aligned with the wall-clock timer.
      syncWorker.onSampleTick(() => pushStatus());
      idleMonitor.setThreshold(profile.idle_threshold_minutes);
      rebuildTrayWithHandlers({ startWork: doStartWork, endWork: doEndWork, startBreak: doStartBreak, endBreak: doEndBreak });
      startTodayPoller();
      startNudgeMonitor();
      meetingWatcher.start();
      pushStatus();
      // After a successful login on macOS, ensure the user has granted
      // Accessibility permission so uiohook-napi can count keystrokes.
      void maybePromptAccessibility();
      return { ok: true, profile };
    } catch (e) {
      return { ok: false, error: e instanceof ApiError ? e.message : "login failed" };
    }
  });

  ipcMain.handle(IpcChannels.logout, async () => {
    try { await api.logout(); } catch { /* ignore */ }
    if (sessionActive) await doEndWork();
    syncWorker.stop();
    stopTodayPoller();
    stopNudgeMonitor();
    meetingWatcher.stop();
    auth.clear();
    localDb.setState("session", "");
    sessionActive = false;
    currentSessionId = null;
    currentSessionStartedAt = null;
    currentBreakId = null;
    currentBreakStartedAt = null;
    pushStatus();
  });

  ipcMain.handle(IpcChannels.signup, async (_e, body: { name: string; email: string; password: string; position?: string; team_id?: string | null; timezone?: string }) => {
    try { return { ok: true, data: await api.signup(body) }; }
    catch (e) { return { ok: false, error: e instanceof ApiError ? e.message : "signup failed" }; }
  });

  ipcMain.handle(IpcChannels.listPublicTeams, async () => {
    try { return { ok: true as const, data: await api.listPublicTeams() }; }
    catch (e) { return { ok: false as const, error: e instanceof ApiError ? e.message : "list failed" }; }
  });

  ipcMain.handle(IpcChannels.createPublicTeam, async (_e, body: { name: string }) => {
    try { return { ok: true as const, data: await api.createPublicTeam(body.name) }; }
    catch (e) { return { ok: false as const, error: e instanceof ApiError ? e.message : "create team failed" }; }
  });

  ipcMain.handle(IpcChannels.listHolidays, async () => {
    try { return { ok: true as const, data: await api.listHolidays() }; }
    catch (e) { return { ok: false as const, error: e instanceof ApiError ? e.message : "list failed" }; }
  });

  ipcMain.handle(IpcChannels.listMyMeetings, async () => {
    try { return { ok: true as const, data: await api.listMyMeetings() }; }
    catch (e) { return { ok: false as const, error: e instanceof ApiError ? e.message : "list failed" }; }
  });

  ipcMain.handle(IpcChannels.openExternal, async (_e, url: string) => {
    if (typeof url !== "string" || !url) return;
    if (!isHttpUrl(url)) {
      rejectUnsafe(url, "non-http scheme or malformed URL");
      return;
    }
    void shell.openExternal(url);
  });

  ipcMain.handle(IpcChannels.setWidgetHeight, async (_e, size: WidgetSize) => {
    if (size === "mini" || size === "normal" || size === "max") {
      setWidgetSize(size);
    }
  });

  ipcMain.handle(IpcChannels.verifyEmail, async (_e, body: { email: string; code: string }) => {
    try { return { ok: true, data: await api.verifyEmail(body.email, body.code) }; }
    catch (e) { return { ok: false, error: e instanceof ApiError ? e.message : "verify failed" }; }
  });

  ipcMain.handle(IpcChannels.resendVerification, async (_e, body: { email: string }) => {
    try { return { ok: true, data: await api.resendVerification(body.email) }; }
    catch (e) { return { ok: false, error: e instanceof ApiError ? e.message : "resend failed" }; }
  });

  ipcMain.handle(IpcChannels.startWork, async () => {
    await doStartWork();
    rebuildTrayWithHandlers({ startWork: doStartWork, endWork: doEndWork, startBreak: doStartBreak, endBreak: doEndBreak });
  });
  ipcMain.handle(IpcChannels.endWork, async () => {
    await doEndWork();
    rebuildTrayWithHandlers({ startWork: doStartWork, endWork: doEndWork, startBreak: doStartBreak, endBreak: doEndBreak });
  });
  ipcMain.handle(IpcChannels.startBreak, async () => {
    await doStartBreak();
    rebuildTrayWithHandlers({ startWork: doStartWork, endWork: doEndWork, startBreak: doStartBreak, endBreak: doEndBreak });
  });
  ipcMain.handle(IpcChannels.endBreak, async () => {
    await doEndBreak();
    rebuildTrayWithHandlers({ startWork: doStartWork, endWork: doEndWork, startBreak: doStartBreak, endBreak: doEndBreak });
  });

  ipcMain.handle(IpcChannels.acknowledgePrivacy, async () => {
    prefs.set("privacyAcknowledged", true);
    pushStatus();
  });

  ipcMain.handle(IpcChannels.setAutoStart, async (_e, enabled: boolean) => {
    autoStart.set(enabled);
    prefs.set("autoStart", enabled);
    pushStatus();
  });

  ipcMain.handle(IpcChannels.setDarkMode, async (_e, enabled: boolean) => {
    prefs.set("darkMode", enabled);
    pushStatus();
  });

  ipcMain.handle(IpcChannels.setEodReminder, async (_e, hour: number | null) => {
    prefs.set("endOfDayReminderHour", hour);
    pushStatus();
  });

  ipcMain.handle(IpcChannels.setAutoBreakOnIdle, async (_e, enabled: boolean) => {
    prefs.set("autoBreakOnIdle", enabled);
    pushStatus();
  });

  ipcMain.handle(IpcChannels.setMeetingNotifications, async (_e, enabled: boolean) => {
    prefs.set("meetingNotificationsEnabled", enabled);
    pushStatus();
  });

  ipcMain.handle(IpcChannels.setMeetingAlarm, async (_e, enabled: boolean) => {
    prefs.set("meetingAlarmEnabled", enabled);
    pushStatus();
  });

  ipcMain.handle(IpcChannels.setMeetingReminderMinutes, async (_e, minutes: number) => {
    prefs.set("meetingReminderMinutes", Math.max(1, Math.min(60, Math.round(minutes))));
    pushStatus();
  });

  ipcMain.handle(IpcChannels.setAutoLockMinutes, async (_e, minutes: number) => {
    prefs.set("autoLockMinutes", Math.max(0, Math.min(240, Math.round(minutes))));
    pushStatus();
  });

  ipcMain.handle(IpcChannels.snoozeIdleNudge, async (_e, minutes: number) => {
    const ms = Math.max(1, Math.min(120, Math.round(minutes))) * 60_000;
    nudgeSnoozedUntil = Date.now() + ms;
  });

  ipcMain.handle(IpcChannels.endBreakById, async (_e, body: { break_id: string }) => {
    await doEndBreakById(body.break_id);
    rebuildTrayWithHandlers({ startWork: doStartWork, endWork: doEndWork, startBreak: doStartBreak, endBreak: doEndBreak });
  });

  ipcMain.handle(IpcChannels.toggleWidget, async () => {
    toggleWidget();
    pushStatus();
    rebuildTrayWithHandlers({ startWork: doStartWork, endWork: doEndWork, startBreak: doStartBreak, endBreak: doEndBreak });
  });

  ipcMain.handle(IpcChannels.hideWidget, async () => {
    hideWidget();
    pushStatus();
    rebuildTrayWithHandlers({ startWork: doStartWork, endWork: doEndWork, startBreak: doStartBreak, endBreak: doEndBreak });
  });

  ipcMain.handle(IpcChannels.updateProfile, async (_e, body: Partial<{ name: string; position: string | null; team_id: string | null; timezone: string }>) => {
    try {
      const updated = await api.updateMe(body);
      const a = auth.get();
      if (a.profile) {
        auth.setProfile({
          ...a.profile,
          name: updated.name,
          position: updated.position,
          team_id: updated.team_id,
          team_name: updated.team_name,
          timezone: updated.timezone,
        });
      }
      pushStatus();
      return { ok: true as const, data: updated };
    } catch (e) {
      return { ok: false as const, error: e instanceof ApiError ? e.message : "update failed" };
    }
  });

  ipcMain.handle(IpcChannels.changePassword, async (_e, body: { current: string; next: string }) => {
    try {
      await api.changePassword(body.current, body.next);
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: e instanceof ApiError ? e.message : "password change failed" };
    }
  });

  ipcMain.handle(IpcChannels.exportMyData, async (_e, body: { from: string; to: string }) => {
    const a = auth.get();
    if (!a.accessToken) return { ok: false as const, error: "not signed in" };
    try {
      const r = await fetch(api.exportMyDataUrl(body.from, body.to), {
        headers: { Authorization: `Bearer ${a.accessToken}` },
      });
      if (!r.ok) return { ok: false as const, error: `HTTP ${r.status}` };
      const text = await r.text();
      const defaultName = `fdm-my-activity-${body.from}-${body.to}.csv`;
      const savePath = await dialog.showSaveDialog({
        defaultPath: path.join(app.getPath("downloads"), defaultName),
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (savePath.canceled || !savePath.filePath) return { ok: false as const, error: "cancelled" };
      await fs.writeFile(savePath.filePath, text, "utf8");
      shell.showItemInFolder(savePath.filePath);
      return { ok: true as const, path: savePath.filePath };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

  ipcMain.handle(IpcChannels.dailySummary, async (_e, args: { from: string; to: string }) => {
    return api.dailySummary(args.from, args.to);
  });
  ipcMain.handle(IpcChannels.dayDetail, async (_e, args: { date: string }) => {
    return api.dayDetail(args.date);
  });
  ipcMain.handle(IpcChannels.rangeTotals, async (_e, args: { from: string; to: string }) => {
    return api.rangeTotals(args.from, args.to);
  });
}

export const ipcOps = {
  doStartWork, doEndWork, doStartBreak, doEndBreak, toggleBreak,
  rebuildTrayWithHandlers, pushStatus,
  refreshTodayTotals, startTodayPoller, startNudgeMonitor,
  startMeetingWatcher: () => meetingWatcher.start(),
  restoreOpenSession: restoreOpenSessionIfAny,
  promptAccessibility: maybePromptAccessibility,
  setConnectionOnline(online: boolean) { connectionOnline = online; pushStatus(); },
  isSessionActive: () => sessionActive,
  isOnBreak: () => !!currentBreakId,
};
