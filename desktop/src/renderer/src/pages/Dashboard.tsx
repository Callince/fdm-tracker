import * as React from "react";
import { useState } from "react";
import type { AppStatus } from "@shared/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LiveTimer } from "@/components/LiveTimer";
import { SessionLog } from "@/components/SessionLog";
import { WeeklyStats } from "@/components/WeeklyStats";
import { RangeTotals } from "@/components/RangeTotals";
import { UpcomingMeetings } from "@/components/UpcomingMeetings";
import { hms, relativeFromNow } from "@/lib/format";

interface Props {
  status: AppStatus;
}

export function Dashboard({ status }: Props) {
  const [busy, setBusy] = useState<"start" | "end" | "break" | "resume" | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  // Close the End-work confirm on Escape so it matches the rest of the app.
  React.useEffect(() => {
    if (!confirmEnd) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setConfirmEnd(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmEnd]);

  // Tick once a minute while on break so we can flip into the "overdue" pulse
  // state the moment the break crosses 30 minutes — without re-rendering every
  // second like the timer does.
  const [, bumpBreakTick] = useState(0);
  React.useEffect(() => {
    if (!status.on_break) return;
    const id = setInterval(() => bumpBreakTick((n) => (n + 1) & 0x3fffffff), 30_000);
    return () => clearInterval(id);
  }, [status.on_break]);

  async function act(kind: "start" | "end" | "break" | "resume") {
    if (kind === "end") {
      setConfirmEnd(true);
      return;
    }
    setBusy(kind);
    try {
      if (kind === "start") await window.fdm.startWork();
      else if (kind === "break") await window.fdm.startBreak();
      else await window.fdm.endBreak();
    } finally {
      setBusy(null);
    }
  }

  async function doEnd() {
    setConfirmEnd(false);
    setBusy("end");
    try { await window.fdm.endWork(); }
    finally { setBusy(null); }
  }

  const firstName = (status.profile?.name ?? "there").split(/\s+/)[0];
  const tz = status.profile?.timezone ?? "UTC";
  const timerStart = status.session_active
    ? status.on_break && status.break_started_at
      ? status.break_started_at
      : status.session_started_at
    : null;

  // After 30 min on break the timer subtly pulses red — "you've been away a
  // while, want to come back?" without being a popup.
  const breakOverdue =
    status.on_break &&
    status.break_started_at !== null &&
    Date.now() - new Date(status.break_started_at).getTime() > 30 * 60_000;

  return (
    <div className="space-y-5">
      {/* Hero -------------------------------------------------------------- */}
      <section className="relative overflow-hidden rounded-2xl border border-brand-light/40 bg-gradient-to-br from-brand-tint via-white to-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 dark:border-slate-800 p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-brand-dark/80">Today</div>
            <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100 mt-1">
              Hi, {firstName}
            </h1>
            {status.profile?.position && (
              <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {status.profile.position}
                {status.profile.team_name ? ` · ${status.profile.team_name}` : ""}
              </div>
            )}
          </div>

          {timerStart && (
            <div className="text-right">
              <div className={`text-[11px] uppercase tracking-wider ${
                breakOverdue
                  ? "text-red-600 dark:text-red-400 font-medium"
                  : "text-slate-500 dark:text-slate-400"
              }`}>
                {status.on_break ? (breakOverdue ? "Long break" : "On break") : "Working"}
              </div>
              <LiveTimer
                startedAt={timerStart}
                pausedSince={null}
                className={`text-4xl font-semibold tabular-nums ${
                  breakOverdue
                    ? "text-red-500 dark:text-red-400 animate-pulse"
                    : status.on_break
                      ? "text-brk"
                      : "text-active"
                }`}
              />
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="mt-6 flex flex-wrap gap-3">
          {!status.session_active && (
            <Button size="lg" variant="active" onClick={() => act("start")} disabled={busy !== null} className="min-w-40">
              {busy === "start" ? "Starting…" : "▶  Start work"}
            </Button>
          )}
          {status.session_active && !status.on_break && (
            <>
              <Button size="lg" variant="brk" onClick={() => act("break")} disabled={busy !== null} className="min-w-40">
                {busy === "break" ? "Pausing…" : "⏸  Start break"}
              </Button>
              <Button size="lg" variant="danger" onClick={() => act("end")} disabled={busy !== null} className="min-w-40">
                {busy === "end" ? "Ending…" : "■  End work"}
              </Button>
            </>
          )}
          {status.session_active && status.on_break && (
            <>
              <Button size="lg" variant="active" onClick={() => act("resume")} disabled={busy !== null} className="min-w-40">
                {busy === "resume" ? "Resuming…" : "▶  Resume work"}
              </Button>
              <Button size="lg" variant="danger" onClick={() => act("end")} disabled={busy !== null}>
                End work
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            className="self-center"
            onClick={() => { void window.fdm.toggleWidget(); }}
            title="Toggle the always-on-top floating timer"
          >
            {status.widget_visible ? "Hide widget" : "Show widget"}
          </Button>
        </div>
      </section>

      {/* Today's target progress ------------------------------------------ */}
      <TargetProgress status={status} />

      {/* Totals ------------------------------------------------------------ */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Active" value={hms(status.today_active_seconds)} accent="bg-active/10" dot="bg-active" valueClass="text-active" />
        <Stat label="Idle" value={hms(status.today_idle_seconds)} accent="bg-idle/10" dot="bg-idle" valueClass="text-idle" />
        <Stat label="Break" value={hms(status.today_break_seconds)} accent="bg-brk/10" dot="bg-brk" valueClass="text-brk" />
      </div>

      {/* Week + month progress -------------------------------------------- */}
      <RangeTotals />

      {/* Upcoming meetings ------------------------------------------------- */}
      <UpcomingMeetings />

      {/* Two-column below -------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-3 dark:bg-slate-900 dark:border-slate-800">
          <CardHeader className="dark:border-slate-800">
            <div className="text-sm font-semibold">Today's sessions</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Live rows update in real time.
            </div>
          </CardHeader>
          <CardBody>
            <SessionLog entries={status.today_entries} timezone={tz} />
          </CardBody>
        </Card>

        <Card className="lg:col-span-2 dark:bg-slate-900 dark:border-slate-800">
          <CardHeader className="dark:border-slate-800">
            <div className="text-sm font-semibold">This week</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Daily active hours.</div>
          </CardHeader>
          <CardBody>
            <WeeklyStats />
          </CardBody>
        </Card>
      </div>

      <div className="text-xs text-slate-400 dark:text-slate-500 text-center pb-2">
        {status.last_sync_ok_at
          ? <>last sync {relativeFromNow(status.last_sync_ok_at)} · {status.pending_sync_count} pending</>
          : <>not synced yet · {status.pending_sync_count} pending</>}
        {status.last_sync_error && (
          <span className="ml-2 text-red-600" title={status.last_sync_error}>· sync error</span>
        )}
      </div>

      {confirmEnd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
          onClick={() => setConfirmEnd(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="text-base font-semibold">End your work day?</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Closes the current session
                {timerStart && <> ({hms(Math.round((Date.now() - new Date(timerStart).getTime()) / 1000))} so far)</>}.
                You can start again later if you change your mind.
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmEnd(false)}>Cancel</Button>
              <Button variant="danger" onClick={doEnd} disabled={busy === "end"}>
                {busy === "end" ? "Ending…" : "End work"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label, value, accent, dot, valueClass,
}: { label: string; value: string; accent: string; dot: string; valueClass: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 dark:border-slate-800 p-4 ${accent}`}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-400">
        <span className={`h-2 w-2 rounded-full ${dot}`} /> {label}
      </div>
      <div className={`text-3xl font-semibold mt-1 ${valueClass}`}>{value}</div>
    </div>
  );
}

/**
 * Stacked today-vs-target progress bar with a prompt when the user is under
 * their daily target. "Logged" is active + idle + break — total time at the
 * desk, not just active seconds.
 */
function TargetProgress({ status }: { status: AppStatus }) {
  const targetH = status.profile?.target_hours_per_day ?? 8;
  const targetSec = targetH * 3600;
  const activeSec = status.today_active_seconds;
  const idleSec = status.today_idle_seconds;
  const breakSec = status.today_break_seconds;
  const loggedSec = activeSec + idleSec + breakSec;
  const gapSec = Math.max(0, targetSec - loggedSec);
  const pct = targetSec > 0 ? Math.min(100, Math.round((loggedSec / targetSec) * 100)) : 0;

  const activePct = targetSec > 0 ? Math.min(100, (activeSec / targetSec) * 100) : 0;
  const idlePct = targetSec > 0 ? Math.min(Math.max(0, 100 - activePct), (idleSec / targetSec) * 100) : 0;
  const breakPct = targetSec > 0 ? Math.min(Math.max(0, 100 - activePct - idlePct), (breakSec / targetSec) * 100) : 0;

  const met = gapSec === 0;
  const tone = met
    ? "border-active/30 bg-active/5 dark:bg-active/10"
    : "border-brand-light/40 bg-brand-tint/30 dark:bg-[#3a1509]/40 dark:border-slate-800";

  return (
    <section className={`rounded-xl border p-4 ${tone}`}>
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Today's target
          </div>
          <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {hms(loggedSec)}{" "}
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
              / {targetH}h
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{pct}% complete</div>
          {met ? (
            <div className="mt-0.5 text-xs font-medium text-active">Target reached ✓</div>
          ) : (
            <div className="mt-0.5 text-xs font-medium text-brand-dark dark:text-brand-light">
              {hms(gapSec)} to go
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 h-2 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
        <div className="h-full bg-active transition-all duration-700 ease-out" style={{ width: `${activePct}%` }} />
        <div className="h-full bg-idle transition-all duration-700 ease-out" style={{ width: `${idlePct}%` }} />
        <div className="h-full bg-brk transition-all duration-700 ease-out" style={{ width: `${breakPct}%` }} />
      </div>
      {!met && (
        <div className="mt-3 text-xs text-slate-600 dark:text-slate-300">
          You haven't hit today's target of <strong>{targetH} hours</strong> yet.
          Active + idle + break count toward this total.
        </div>
      )}
    </section>
  );
}
