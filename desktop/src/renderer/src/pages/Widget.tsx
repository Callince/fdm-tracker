import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, GripHorizontal, X } from "lucide-react";
import type { AppStatus } from "@shared/types";
import { LiveTimer } from "@/components/LiveTimer";
import { hms } from "@/lib/format";
import { useAppStatus } from "@/lib/status";

const EXPANDED_KEY = "fdm.widget.expanded";

/**
 * Compact floating panel rendered inside the always-on-top widget window.
 * Mirrors the Dashboard action state machine in a small footprint, with a
 * collapsible "today totals" section. The window itself is transparent —
 * the Shell's translucent background lets the desktop bleed through.
 */
export function Widget() {
  const status = useAppStatus();
  if (!status) return <Shell><div className="text-[11px] text-slate-300">Loading…</div></Shell>;

  if (!status.signed_in) {
    return (
      <Shell>
        <div className="text-[11px] text-slate-300">
          Sign in on the main window to track time.
        </div>
      </Shell>
    );
  }

  return <WidgetBody status={status} />;
}

function WidgetBody({ status }: { status: AppStatus }) {
  const [busy, setBusy] = useState<"start" | "end" | "break" | "resume" | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const initial = localStorage.getItem(EXPANDED_KEY) === "1";
    setExpanded(initial);
    void window.fdm.setWidgetHeight(initial);
  }, []);

  function toggleExpanded() {
    setExpanded((prev) => {
      const next = !prev;
      localStorage.setItem(EXPANDED_KEY, next ? "1" : "0");
      void window.fdm.setWidgetHeight(next);
      return next;
    });
  }

  async function act(kind: "start" | "end" | "break" | "resume") {
    setBusy(kind);
    try {
      if (kind === "start") await window.fdm.startWork();
      else if (kind === "end") await window.fdm.endWork();
      else if (kind === "break") await window.fdm.startBreak();
      else await window.fdm.endBreak();
    } finally {
      setBusy(null);
    }
  }

  const timerStart = status.session_active
    ? status.on_break && status.break_started_at
      ? status.break_started_at
      : status.session_started_at
    : null;

  const stateLabel = !status.session_active
    ? "Not tracking"
    : status.on_break
      ? "On break"
      : "Working";
  const stateColor = !status.session_active
    ? "text-slate-300"
    : status.on_break
      ? "text-brk"
      : "text-active";
  const timerColor = status.on_break ? "text-brk" : "text-active";

  return (
    <Shell>
      <div className="flex items-baseline justify-between">
        <div className={`text-[10px] uppercase tracking-widest font-semibold ${stateColor}`}>
          {stateLabel}
        </div>
        {timerStart ? (
          <LiveTimer
            startedAt={timerStart}
            pausedSince={null}
            className={`text-xl font-semibold tabular-nums ${timerColor}`}
          />
        ) : (
          <span className="text-xl font-semibold tabular-nums text-slate-400">0:00:00</span>
        )}
      </div>

      <div className="mt-3 flex gap-2 no-drag">
        {!status.session_active && (
          <Action
            label={busy === "start" ? "Starting…" : "▶ Start"}
            tone="active"
            fullWidth
            disabled={busy !== null}
            onClick={() => act("start")}
          />
        )}
        {status.session_active && !status.on_break && (
          <>
            <Action
              label={busy === "break" ? "…" : "⏸ Break"}
              tone="brk"
              disabled={busy !== null}
              onClick={() => act("break")}
            />
            <Action
              label={busy === "end" ? "…" : "■ End work"}
              tone="danger"
              disabled={busy !== null}
              onClick={() => act("end")}
            />
          </>
        )}
        {status.session_active && status.on_break && (
          <>
            <Action
              label={busy === "resume" ? "…" : "▶ Resume"}
              tone="active"
              disabled={busy !== null}
              onClick={() => act("resume")}
            />
            <Action
              label={busy === "end" ? "…" : "■ End"}
              tone="danger"
              disabled={busy !== null}
              onClick={() => act("end")}
            />
          </>
        )}
      </div>

      {/* Expand/collapse toggle for today totals */}
      <button
        type="button"
        onClick={toggleExpanded}
        className="no-drag mt-3 w-full inline-flex items-center justify-center gap-1 rounded text-[10px] uppercase tracking-wider text-slate-300 hover:text-white hover:bg-white/5 py-1"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        title={expanded ? "Hide today's totals" : "Show today's totals"}
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {expanded ? "Hide totals" : "Today totals"}
      </button>

      {expanded && (
        <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
          <Stat label="Active" value={hms(status.today_active_seconds)} colorClass="text-active" />
          <Stat label="Idle" value={hms(status.today_idle_seconds)} colorClass="text-idle" />
          <Stat label="Break" value={hms(status.today_break_seconds)} colorClass="text-brk" />
        </div>
      )}
    </Shell>
  );
}

function Stat({ label, value, colorClass }: { label: string; value: string; colorClass: string }) {
  return (
    <div className="rounded bg-white/5 px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`tabular-nums font-medium ${colorClass}`}>{value}</div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="h-full w-full p-3 rounded-xl bg-slate-900/35 hover:bg-slate-900/35 text-slate-100 shadow-lg border border-white/10 backdrop-blur-md select-none"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="flex items-center justify-between mb-1">
        <GripHorizontal size={14} className="text-slate-400/70" />
        <button
          type="button"
          onClick={() => { void window.fdm.hideWidget(); }}
          className="no-drag rounded p-0.5 text-slate-300 hover:text-white hover:bg-white/10"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          title="Hide widget"
          aria-label="Hide widget"
        >
          <X size={14} />
        </button>
      </div>
      <div
        className="no-drag"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}

function Action({
  label,
  tone,
  onClick,
  disabled,
  fullWidth,
}: {
  label: string;
  tone: "active" | "brk" | "danger";
  onClick: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  const cls =
    tone === "active"
      ? "bg-active text-white hover:brightness-110"
      : tone === "brk"
        ? "bg-brk text-white hover:brightness-110"
        : "bg-red-600 text-white hover:brightness-110";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      className={`${fullWidth ? "flex-1" : "flex-1"} h-8 rounded text-xs font-medium ${cls} disabled:opacity-60`}
    >
      {label}
    </button>
  );
}
