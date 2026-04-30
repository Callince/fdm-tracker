import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  Pause,
  Play,
  Square,
  X,
} from "lucide-react";
import type { AppStatus } from "@shared/types";
import { LiveTimer } from "@/components/LiveTimer";
import { hms } from "@/lib/format";
import { useAppStatus } from "@/lib/status";

const SIZE_KEY = "fdm.widget.size";
type WidgetSize = "mini" | "normal" | "max";

/**
 * Floating widget. Three sizes; brand-tinted state-aware look.
 *
 * Resting bg is translucent (slate-900/30). On hover the entire shell
 * goes solid dark + slightly tinted toward the current state so the
 * controls are crisp while interacting and immediately readable.
 */
export function Widget() {
  const status = useAppStatus();
  if (!status) {
    return (
      <Shell tone="idle">
        <div className="text-[11px] text-slate-300">Loading…</div>
      </Shell>
    );
  }

  if (!status.signed_in) {
    return (
      <Shell tone="idle">
        <div className="text-[11px] text-slate-300">
          Sign in on the main window to track time.
        </div>
      </Shell>
    );
  }

  return <WidgetBody status={status} />;
}

type Tone = "active" | "break" | "idle";

function tone(status: AppStatus): Tone {
  if (!status.session_active) return "idle";
  if (status.on_break) return "break";
  return "active";
}

function WidgetBody({ status }: { status: AppStatus }) {
  const [busy, setBusy] = useState<"start" | "end" | "break" | "resume" | null>(null);
  const [size, setSize] = useState<WidgetSize>("normal");

  useEffect(() => {
    const stored = localStorage.getItem(SIZE_KEY);
    const initial: WidgetSize =
      stored === "mini" || stored === "max" || stored === "normal" ? stored : "normal";
    setSize(initial);
    void window.fdm.setWidgetSize(initial);
  }, []);

  function changeSize(next: WidgetSize) {
    setSize(next);
    localStorage.setItem(SIZE_KEY, next);
    void window.fdm.setWidgetSize(next);
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

  const t: Tone = tone(status);
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

  // Today's % progress for the bottom progress strip.
  const target = status.profile?.target_hours_per_day ?? 8;
  const targetSec = target * 3600;
  const loggedSec =
    status.today_active_seconds + status.today_idle_seconds + status.today_break_seconds;
  const pct = targetSec > 0 ? Math.min(100, Math.round((loggedSec / targetSec) * 100)) : 0;

  // -- MINI view -- single row, ultra compact ------------------------------
  if (size === "mini") {
    return (
      <Shell tone={t} size={size} onSize={changeSize}>
        <div className="flex items-center gap-2 px-1">
          <StateDot tone={t} />
          {timerStart ? (
            <LiveTimer
              startedAt={timerStart}
              pausedSince={null}
              className={`text-base font-semibold tabular-nums ${timerColor(t)}`}
            />
          ) : (
            <span className="text-base font-semibold tabular-nums text-slate-400">0:00:00</span>
          )}
          <span className="ml-auto text-[10px] uppercase tracking-widest text-slate-300/70">
            {stateLabel}
          </span>
        </div>
      </Shell>
    );
  }

  // -- NORMAL + MAX view ---------------------------------------------------
  return (
    <Shell tone={t} size={size} onSize={changeSize}>
      {/* State strip */}
      <div className="flex items-center gap-2 px-1">
        <StateDot tone={t} />
        <span className="text-[10px] uppercase tracking-widest font-semibold text-slate-200">
          {stateLabel}
        </span>
        {timerStart && (
          <span className="ml-auto text-[10px] text-slate-400">
            since {formatStartTime(timerStart)}
          </span>
        )}
      </div>

      {/* Timer */}
      <div className="px-1 mt-2">
        {timerStart ? (
          <LiveTimer
            startedAt={timerStart}
            pausedSince={null}
            className={`text-3xl font-semibold tabular-nums leading-none ${timerColor(t)}`}
          />
        ) : (
          <span className="text-3xl font-semibold tabular-nums leading-none text-slate-400">
            0:00:00
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="mt-3 flex gap-2 no-drag" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        {!status.session_active && (
          <PrimaryAction
            tone="active"
            icon={<Play size={13} />}
            label={busy === "start" ? "Starting…" : "Start work"}
            disabled={busy !== null}
            onClick={() => act("start")}
            fullWidth
          />
        )}
        {status.session_active && !status.on_break && (
          <>
            <PrimaryAction
              tone="break"
              icon={<Pause size={13} />}
              label={busy === "break" ? "…" : "Break"}
              disabled={busy !== null}
              onClick={() => act("break")}
            />
            <PrimaryAction
              tone="end"
              icon={<Square size={11} />}
              label={busy === "end" ? "…" : "End"}
              disabled={busy !== null}
              onClick={() => act("end")}
            />
          </>
        )}
        {status.session_active && status.on_break && (
          <>
            <PrimaryAction
              tone="active"
              icon={<Play size={13} />}
              label={busy === "resume" ? "…" : "Resume"}
              disabled={busy !== null}
              onClick={() => act("resume")}
            />
            <PrimaryAction
              tone="end"
              icon={<Square size={11} />}
              label={busy === "end" ? "…" : "End"}
              disabled={busy !== null}
              onClick={() => act("end")}
            />
          </>
        )}
      </div>

      {/* Today progress bar — always shown in normal + max */}
      <div className="mt-3 px-1">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-slate-400">Today</span>
          <span className="text-slate-300 tabular-nums">
            {hms(loggedSec)} / {target}h · {pct}%
          </span>
        </div>
        <div className="h-1 rounded bg-white/10 overflow-hidden flex">
          {targetSec > 0 && (
            <>
              <div
                className="h-full bg-active transition-all"
                style={{ width: `${Math.min(100, (status.today_active_seconds / targetSec) * 100)}%` }}
              />
              <div
                className="h-full bg-idle transition-all"
                style={{ width: `${Math.min(100, (status.today_idle_seconds / targetSec) * 100)}%` }}
              />
              <div
                className="h-full bg-brk transition-all"
                style={{ width: `${Math.min(100, (status.today_break_seconds / targetSec) * 100)}%` }}
              />
            </>
          )}
        </div>
      </div>

      {/* MAX-only: today totals */}
      {size === "max" && (
        <div className="mt-3 grid grid-cols-3 gap-1.5 text-[10px]">
          <Stat label="Active" value={hms(status.today_active_seconds)} colorClass="text-active" />
          <Stat label="Idle" value={hms(status.today_idle_seconds)} colorClass="text-idle" />
          <Stat label="Break" value={hms(status.today_break_seconds)} colorClass="text-brk" />
        </div>
      )}
    </Shell>
  );
}

// ---- helpers -------------------------------------------------------------

function timerColor(t: Tone): string {
  if (t === "active") return "text-active";
  if (t === "break") return "text-brk";
  return "text-slate-300";
}

function StateDot({ tone }: { tone: Tone }) {
  const cls =
    tone === "active"
      ? "bg-active"
      : tone === "break"
        ? "bg-brk"
        : "bg-slate-500";
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      <span
        className={`absolute inset-0 rounded-full ${cls} ${
          tone !== "idle" ? "animate-ping opacity-50" : ""
        }`}
      />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${cls}`} />
    </span>
  );
}

function formatStartTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function Stat({ label, value, colorClass }: { label: string; value: string; colorClass: string }) {
  return (
    <div className="rounded-md bg-white/5 px-1.5 py-1.5 border border-white/5">
      <div className="text-[9px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`tabular-nums font-medium ${colorClass}`}>{value}</div>
    </div>
  );
}

function Shell({
  children,
  tone,
  size,
  onSize,
}: {
  children: React.ReactNode;
  tone: Tone;
  size?: WidgetSize;
  onSize?: (s: WidgetSize) => void;
}) {
  // Resting: very translucent dark. Hover: solid dark + a faint state tint
  // along the top edge (subtle gradient so the widget identifies its mode
  // at a glance without being noisy).
  const hoverTint =
    tone === "active"
      ? "hover:bg-gradient-to-b hover:from-active/15 hover:via-slate-900 hover:to-slate-900"
      : tone === "break"
        ? "hover:bg-gradient-to-b hover:from-brk/15 hover:via-slate-900 hover:to-slate-900"
        : "hover:bg-slate-900";

  return (
    <div
      className={`group h-full w-full p-3 rounded-xl bg-slate-900/30 ${hoverTint} text-slate-100 shadow-lg border border-white/10 backdrop-blur-md select-none transition-colors`}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Header / chrome */}
      <div className="flex items-center justify-between mb-1">
        <GripHorizontal size={12} className="text-slate-400/60" />
        <div
          className="flex items-center gap-0.5 no-drag"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {onSize && size !== "max" && (
            <button
              type="button"
              onClick={() => onSize(size === "mini" ? "normal" : "max")}
              className="rounded p-0.5 text-slate-300 hover:text-white hover:bg-white/10"
              title={size === "mini" ? "Restore" : "Maximize"}
              aria-label={size === "mini" ? "Restore" : "Maximize"}
            >
              <ChevronUp size={12} />
            </button>
          )}
          {onSize && size !== "mini" && (
            <button
              type="button"
              onClick={() => onSize(size === "max" ? "normal" : "mini")}
              className="rounded p-0.5 text-slate-300 hover:text-white hover:bg-white/10"
              title={size === "max" ? "Restore" : "Minimize"}
              aria-label={size === "max" ? "Restore" : "Minimize"}
            >
              <ChevronDown size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={() => { void window.fdm.hideWidget(); }}
            className="rounded p-0.5 text-slate-300 hover:text-white hover:bg-white/10"
            title="Hide widget"
            aria-label="Hide widget"
          >
            <X size={12} />
          </button>
        </div>
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

function PrimaryAction({
  tone,
  icon,
  label,
  onClick,
  disabled,
  fullWidth,
}: {
  tone: "active" | "break" | "end";
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  const cls =
    tone === "active"
      ? "bg-active hover:brightness-110 text-white"
      : tone === "break"
        ? "bg-brk hover:brightness-110 text-white"
        : "bg-red-600 hover:brightness-110 text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      className={`${fullWidth ? "flex-1" : "flex-1"} h-9 rounded-md text-xs font-semibold inline-flex items-center justify-center gap-1.5 ${cls} disabled:opacity-60 transition`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
