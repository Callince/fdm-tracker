import type { ReactNode } from "react";
import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Settings as SettingsIcon,
  Video,
} from "lucide-react";
import type { AppStatus } from "@shared/types";
import { hms } from "@/lib/format";

export type ShellView = "dashboard" | "calendar" | "meetings" | "settings";

interface Props {
  status: AppStatus;
  active: ShellView;
  onNavigate: (view: ShellView) => void;
  onLogout: () => void;
  children: ReactNode;
}

const ITEMS = [
  { key: "dashboard" as const, label: "Today",    icon: LayoutDashboard },
  { key: "meetings"  as const, label: "Meetings", icon: Video },
  { key: "calendar"  as const, label: "Calendar", icon: CalendarDays },
  { key: "settings"  as const, label: "Settings", icon: SettingsIcon },
];

export function AppShell({ status, active, onNavigate, onLogout, children }: Props) {
  const firstName = (status.profile?.name ?? "").split(/\s+/)[0];
  const initials =
    (status.profile?.name ?? "?")
      .split(/\s+/)
      .map((p) => p.charAt(0).toUpperCase())
      .filter(Boolean)
      .slice(0, 2)
      .join("") || "?";

  // Live state → color + label
  const stateMeta = !status.session_active
    ? { dot: "bg-slate-400 dark:bg-slate-500", text: "text-slate-500 dark:text-slate-400", label: "Off the clock" }
    : status.on_break
      ? { dot: "bg-brk", text: "text-brk", label: "On break" }
      : { dot: "bg-active", text: "text-active", label: "Working" };

  // Simple today total — sum of active+idle+break for at-a-glance.
  const totalToday =
    status.today_active_seconds + status.today_idle_seconds + status.today_break_seconds;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <aside className="w-60 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col relative">
        {/* Vertical brand accent on the very left edge */}
        <span className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-brand to-brand-dark" aria-hidden />

        {/* Brand */}
        <div className="shrink-0 px-4 py-4 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pl-5">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center shrink-0 shadow-md ring-1 ring-white/20 text-white">
            <svg viewBox="0 0 32 32" width={20} height={20} aria-hidden>
              <path
                fill="currentColor"
                d="M18 4v14h4v4h-4v6h-4v-6H2v-3L17 4h1Zm-4 6L6 18h8v-8Z"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              FDM Tracker
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest">
              Fourth Dimension
            </div>
          </div>
        </div>

        {/* Live status card */}
        <div className="shrink-0 px-3 py-3 pl-4 border-b border-slate-100 dark:border-slate-800">
          <div className="rounded-xl bg-gradient-to-br from-slate-50 to-white dark:from-slate-800/60 dark:to-slate-900 border border-slate-200 dark:border-slate-700 p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="relative inline-flex h-2 w-2 shrink-0">
                {status.session_active && (
                  <span className={`absolute inset-0 rounded-full ${stateMeta.dot} opacity-50 animate-ping`} />
                )}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${stateMeta.dot}`} />
              </span>
              <span className={`text-[11px] uppercase tracking-widest font-semibold ${stateMeta.text}`}>
                {stateMeta.label}
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Today
              </span>
              <span className="text-[13px] font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                {hms(totalToday)}
              </span>
            </div>
            {status.profile?.team_name && (
              <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                <span className="uppercase tracking-wider">Team</span>
                <span className="text-slate-700 dark:text-slate-200 font-medium truncate">
                  {status.profile.team_name}
                </span>
              </div>
            )}
            {status.connection === "offline" && (
              <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 text-[10px]">
                offline · {status.pending_sync_count} pending
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-3 space-y-0.5 pl-3">
          {ITEMS.map(({ key, label, icon: Icon }) => {
            const isActive = active === key;
            return (
              <button
                key={key}
                onClick={() => onNavigate(key)}
                className={`group w-full relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-brand to-brand-dark text-white shadow-md"
                    : "text-slate-700 dark:text-slate-300 hover:bg-brand-tint dark:hover:bg-slate-800 hover:text-brand-dark dark:hover:text-brand-light"
                }`}
              >
                <Icon size={16} className={isActive ? "" : "opacity-60 group-hover:opacity-100"} />
                <span className="truncate font-medium">{label}</span>
                {isActive && <span className="absolute right-2 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-white/80" aria-hidden />}
              </button>
            );
          })}
        </nav>

        {/* User */}
        <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 p-3 pl-4">
          <div className="flex items-center gap-2.5 mb-2">
            <div
              className="h-9 w-9 rounded-full bg-gradient-to-br from-brand to-brand-dark text-white inline-flex items-center justify-center text-[12px] font-semibold shrink-0 shadow-sm ring-2 ring-white dark:ring-slate-900"
              aria-hidden
            >
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-slate-800 dark:text-slate-100 truncate">
                {firstName || status.profile?.name || "—"}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {status.profile?.email ?? ""}
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-brand hover:text-brand-dark dark:hover:text-brand-light transition-colors"
          >
            <LogOut size={12} />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl w-full mx-auto p-6">{children}</div>
      </main>
    </div>
  );
}
