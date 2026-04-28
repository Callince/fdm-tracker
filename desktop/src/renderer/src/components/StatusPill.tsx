import type { LiveStatus } from "@shared/types";

const tone: Record<LiveStatus, string> = {
  active: "bg-active",
  idle: "bg-idle",
  on_break: "bg-brk",
  offline: "bg-offline",
};

const label: Record<LiveStatus, string> = {
  active: "active",
  idle: "idle",
  on_break: "on break",
  offline: "not tracking",
};

export function StatusPill({ status }: { status: LiveStatus }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1 text-xs">
      <span className={`h-2 w-2 rounded-full ${tone[status]}`} />
      <span className="uppercase tracking-wide text-slate-600 dark:text-slate-300">{label[status]}</span>
    </span>
  );
}
