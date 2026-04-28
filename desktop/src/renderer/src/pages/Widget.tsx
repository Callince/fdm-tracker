import { useState } from "react";
import { X, GripHorizontal } from "lucide-react";
import type { AppStatus } from "@shared/types";
import { LiveTimer } from "@/components/LiveTimer";
import { useAppStatus } from "@/lib/status";

/**
 * Compact floating panel rendered inside the always-on-top widget window.
 * Mirrors the Dashboard action state machine but in ~260×148 px.
 */
export function Widget() {
  const status = useAppStatus();
  if (!status) return <Shell><div className="text-[11px] text-slate-400">Loading…</div></Shell>;

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
    ? "text-slate-400"
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
          <span className="text-xl font-semibold tabular-nums text-slate-500">0:00:00</span>
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
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="h-full w-full p-3 rounded-xl bg-slate-900/95 text-slate-100 shadow-lg border border-slate-700/80 backdrop-blur select-none"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="flex items-center justify-between mb-1">
        <GripHorizontal size={14} className="text-slate-500" />
        <button
          type="button"
          onClick={() => { void window.fdm.hideWidget(); }}
          className="no-drag rounded p-0.5 text-slate-400 hover:text-white hover:bg-slate-800"
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
