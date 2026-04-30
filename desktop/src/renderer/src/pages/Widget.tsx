import { useEffect, useState } from "react";
import { Maximize2, Minimize2, Pause, Play, Square, X } from "lucide-react";
import type { AppStatus } from "@shared/types";
import { LiveTimer } from "@/components/LiveTimer";
import { hms } from "@/lib/format";
import { useAppStatus } from "@/lib/status";

const SIZE_KEY = "fdm.widget.size";
type WidgetSize = "mini" | "normal" | "max";
type Tone = "active" | "break" | "idle";

export function Widget() {
  const status = useAppStatus();
  if (!status) return <Shell tone="idle"><div className="text-[11px] text-slate-300 px-2">Loading…</div></Shell>;
  if (!status.signed_in) {
    return (
      <Shell tone="idle">
        <div className="text-[11px] text-slate-300 px-2 leading-tight">
          Sign in on the main window to track time.
        </div>
      </Shell>
    );
  }
  return <WidgetBody status={status} />;
}

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

  const t = tone(status);
  const timerStart = status.session_active
    ? status.on_break && status.break_started_at
      ? status.break_started_at
      : status.session_started_at
    : null;
  const stateLabel = !status.session_active ? "Off" : status.on_break ? "Break" : "Working";

  const target = status.profile?.target_hours_per_day ?? 8;
  const targetSec = target * 3600;
  const loggedSec =
    status.today_active_seconds + status.today_idle_seconds + status.today_break_seconds;
  const pct = targetSec > 0 ? Math.min(100, Math.round((loggedSec / targetSec) * 100)) : 0;

  if (size === "mini") {
    return (
      <Shell tone={t} size={size} onSize={changeSize}>
        <div className="flex items-center gap-2 h-full">
          <StateDot tone={t} />
          {timerStart ? (
            <LiveTimer
              startedAt={timerStart}
              pausedSince={null}
              className={`text-[15px] font-semibold tabular-nums ${timerColor(t)}`}
            />
          ) : (
            <span className="text-[15px] font-semibold tabular-nums text-slate-400">0:00:00</span>
          )}
          <span className="ml-auto text-[9px] uppercase tracking-widest text-slate-400">
            {stateLabel}
          </span>
        </div>
      </Shell>
    );
  }

  return (
    <Shell tone={t} size={size} onSize={changeSize}>
      <div className="flex items-center gap-2 mb-1.5">
        <StateDot tone={t} />
        <span className="text-[10px] uppercase tracking-widest font-semibold text-slate-200">
          {stateLabel}
        </span>
        {timerStart && (
          <span className="ml-auto text-[10px] text-slate-500 tabular-nums">
            since {formatStartTime(timerStart)}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        {timerStart ? (
          <LiveTimer
            startedAt={timerStart}
            pausedSince={null}
            className={`text-[28px] font-semibold tabular-nums leading-none ${timerColor(t)}`}
          />
        ) : (
          <span className="text-[28px] font-semibold tabular-nums leading-none text-slate-400">
            0:00:00
          </span>
        )}
      </div>

      <div className="mt-2 flex gap-1.5 no-drag" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        {!status.session_active && (
          <Btn tone="active" icon={<Play size={12} />} label="Start" disabled={busy !== null} fullWidth onClick={() => act("start")} />
        )}
        {status.session_active && !status.on_break && (
          <>
            <Btn tone="break" icon={<Pause size={12} />} label="Break" disabled={busy !== null} onClick={() => act("break")} />
            <Btn tone="end" icon={<Square size={10} />} label="End" disabled={busy !== null} onClick={() => act("end")} />
          </>
        )}
        {status.session_active && status.on_break && (
          <>
            <Btn tone="active" icon={<Play size={12} />} label="Resume" disabled={busy !== null} onClick={() => act("resume")} />
            <Btn tone="end" icon={<Square size={10} />} label="End" disabled={busy !== null} onClick={() => act("end")} />
          </>
        )}
      </div>

      <div className="mt-2">
        <div className="h-[3px] rounded-full bg-white/10 overflow-hidden flex">
          {targetSec > 0 && (
            <>
              <div className="h-full bg-active" style={{ width: `${(status.today_active_seconds / targetSec) * 100}%` }} />
              <div className="h-full bg-idle" style={{ width: `${(status.today_idle_seconds / targetSec) * 100}%` }} />
              <div className="h-full bg-brk" style={{ width: `${(status.today_break_seconds / targetSec) * 100}%` }} />
            </>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between text-[9px] tabular-nums">
          <span className="text-slate-500">Today</span>
          <span className="text-slate-300">{hms(loggedSec)} / {target}h · {pct}%</span>
        </div>
      </div>

      {size === "max" && (
        <div className="mt-2 grid grid-cols-3 gap-1 text-[9px]">
          <Chip label="Active" value={hms(status.today_active_seconds)} colorClass="text-active" />
          <Chip label="Idle"   value={hms(status.today_idle_seconds)}   colorClass="text-idle" />
          <Chip label="Break"  value={hms(status.today_break_seconds)}  colorClass="text-brk" />
        </div>
      )}
    </Shell>
  );
}

function timerColor(t: Tone): string {
  if (t === "active") return "text-active";
  if (t === "break") return "text-brk";
  return "text-slate-300";
}

function StateDot({ tone }: { tone: Tone }) {
  const cls =
    tone === "active" ? "bg-active" :
    tone === "break" ? "bg-brk" :
    "bg-slate-500";
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {tone !== "idle" && (
        <span className={`absolute inset-0 rounded-full ${cls} opacity-50 animate-ping`} />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${cls}`} />
    </span>
  );
}

function formatStartTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function Chip({ label, value, colorClass }: { label: string; value: string; colorClass: string }) {
  return (
    <div className="rounded bg-white/[0.04] border border-white/5 px-1.5 py-1">
      <div className="text-[8px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`tabular-nums font-medium leading-tight ${colorClass}`}>{value}</div>
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
  const edgeColor = tone === "active" ? "bg-active" : tone === "break" ? "bg-brk" : "bg-slate-500";
  const padding = size === "mini" ? "px-3 py-2 pl-3.5" : "px-3 py-2.5 pl-3.5";
  return (
    <div
      className="group relative h-full w-full rounded-lg bg-slate-900/35 hover:bg-slate-950/95 text-slate-100 shadow-md border border-white/10 backdrop-blur-md select-none transition-colors overflow-hidden"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <span className={`absolute left-0 top-0 h-full w-[3px] ${edgeColor}`} />
      {onSize && (
        <div
          className="absolute top-1 right-1 flex items-center gap-0.5 no-drag opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {size === "max" ? (
            <button type="button" onClick={() => onSize("normal")} className="rounded p-0.5 text-slate-300 hover:text-white hover:bg-white/10" title="Restore" aria-label="Restore">
              <Minimize2 size={11} />
            </button>
          ) : (
            <button type="button" onClick={() => onSize(size === "mini" ? "normal" : "max")} className="rounded p-0.5 text-slate-300 hover:text-white hover:bg-white/10" title="Maximize" aria-label="Maximize">
              <Maximize2 size={11} />
            </button>
          )}
          {size !== "mini" && (
            <button type="button" onClick={() => onSize("mini")} className="rounded p-0.5 text-slate-300 hover:text-white hover:bg-white/10" title="Minimize" aria-label="Minimize">
              <Minimize2 size={11} />
            </button>
          )}
          <button type="button" onClick={() => { void window.fdm.hideWidget(); }} className="rounded p-0.5 text-slate-300 hover:text-white hover:bg-white/10" title="Hide" aria-label="Hide widget">
            <X size={11} />
          </button>
        </div>
      )}
      <div className={`relative h-full ${padding}`}>{children}</div>
    </div>
  );
}

function Btn({
  tone, icon, label, onClick, disabled, fullWidth,
}: {
  tone: "active" | "break" | "end";
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  const cls =
    tone === "active" ? "bg-active hover:brightness-110 text-white" :
    tone === "break"  ? "bg-brk hover:brightness-110 text-white" :
                        "bg-red-600 hover:brightness-110 text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      className={`${fullWidth ? "flex-1" : "flex-1"} h-7 rounded text-[11px] font-semibold inline-flex items-center justify-center gap-1 ${cls} disabled:opacity-60 transition`}
    >
      {icon}<span>{label}</span>
    </button>
  );
}
