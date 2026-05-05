/**
 * Polls /me/meetings every minute and fires a notification (and optional
 * alarm sound) when a meeting is `meetingReminderMinutes` minutes away.
 * Each (meeting_id, scheduled_at) pair fires at most once per session.
 *
 * Also brings the main window forward so the alarm is reliable even if
 * the OS toast system is suppressed (Focus Assist, Do Not Disturb).
 */
import { shell } from "electron";
import { api } from "./api";
import { auth, prefs } from "./auth";
import { log } from "./logger";
import { notify } from "./notifications";
import { showMainWindow } from "./windows";
import { isMeetingUrl, rejectUnsafe } from "./urlSafety";

interface UpcomingMeeting {
  id: string;
  title: string;
  meeting_link: string | null;
  meeting_password: string | null;
  scheduled_at: string;
  duration_minutes: number;
}

let pollTimer: NodeJS.Timeout | null = null;
let checkTimer: NodeJS.Timeout | null = null;
let cache: UpcomingMeeting[] = [];
const fired = new Set<string>();

async function refresh() {
  const a = auth.get();
  if (!a.accessToken) return;
  try {
    const r = await api.listMyMeetings();
    cache = r.meetings as UpcomingMeeting[];
  } catch (e) {
    log.warn("[meetings] refresh failed", (e as Error).message);
  }
}

function check() {
  const p = prefs.get();
  if (!p.meetingNotificationsEnabled) return;
  const now = Date.now();
  const reminderMs = Math.max(0, p.meetingReminderMinutes) * 60_000;
  for (const m of cache) {
    const ts = Date.parse(m.scheduled_at);
    if (isNaN(ts)) continue;
    const lead = ts - now;
    if (lead <= reminderMs + 30_000 && lead > -30_000) {
      const key = `${m.id}@${m.scheduled_at}`;
      if (fired.has(key)) continue;
      fired.add(key);
      const minutes = Math.max(0, Math.round(lead / 60_000));
      const lead_s = minutes === 0 ? "now" : `in ${minutes} min`;
      // Never include the password in the notification body — system
      // notifications are persisted to OS log centers and visible during
      // screen-sharing. Show it only inside the in-app meeting view.
      const hasPwd = !!m.meeting_password;
      const body = m.meeting_link
        ? `Starts ${lead_s} — click to join${hasPwd ? " (password in app)" : ""}`
        : `Starts ${lead_s}${hasPwd ? " (password in app)" : ""}`;
      log.info("[meeting-alarm] firing", { id: m.id, title: m.title, lead, sound: p.meetingAlarmEnabled });
      notify({
        title: m.title,
        body,
        sound: p.meetingAlarmEnabled,
        onClick: () => {
          // Only open links to known meeting hosts — server-supplied URLs
          // are otherwise treated as untrusted (file://, custom protocol
          // handlers etc. would be a remote-code-execution vector).
          if (m.meeting_link && isMeetingUrl(m.meeting_link)) {
            void shell.openExternal(m.meeting_link);
          } else {
            if (m.meeting_link) rejectUnsafe(m.meeting_link, "meeting link not on allowlist");
            showMainWindow();
          }
        },
      });
      try { showMainWindow(); } catch { /* ignore */ }
    }
  }
  if (fired.size > 200) fired.clear();
}

export const meetingWatcher = {
  start() {
    if (pollTimer) return;
    void refresh();
    pollTimer = setInterval(async () => {
      await refresh();
      check();
    }, 60_000);
    checkTimer = setInterval(check, 10_000);
  },
  stop() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    if (checkTimer) clearInterval(checkTimer);
    checkTimer = null;
    cache = [];
    fired.clear();
  },
};
