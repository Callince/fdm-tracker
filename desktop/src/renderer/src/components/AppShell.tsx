import type { ReactNode } from "react";
import { CalendarDays, LayoutDashboard, LogOut, Settings as SettingsIcon, Video } from "lucide-react";
import type { AppStatus } from "@shared/types";
import { StatusPill } from "@/components/StatusPill";
import { OfflineBadge } from "@/components/OfflineBadge";

export type ShellView = "dashboard" | "calendar" | "meetings" | "settings";

interface Props {
  status: AppStatus;
  active: ShellView;
  onNavigate: (view: ShellView) => void;
  onLogout: () => void;
  children: ReactNode;
}

interface Item {
  key: ShellView;
  label: string;
  icon: typeof LayoutDashboard;
}

const ITEMS: Item[] = [
  { key: "dashboard", label: "Today", icon: LayoutDashboard },
  { key: "meetings", label: "Meetings", icon: Video },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

export function AppShell({ status, active, onNavigate, onLogout, children }: Props) {
  const firstName = (status.profile?.name ?? "").split(/\s+/)[0];

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <aside className="w-60 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
        {/* Brand */}
        <div className="shrink-0 px-5 py-4 border-b border-brand-light/40 bg-brand-tint">
          <img
            src="./4d-logo.webp"
            alt="Fourth Dimension"
            className="h-8 w-auto block select-none"
            draggable={false}
          />
          <div className="text-[11px] text-brand-dark/80 mt-2 tracking-wide uppercase">
            FDM Tracker
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-0.5">
          {ITEMS.map(({ key, label, icon: Icon }) => {
            const isActive = active === key;
            return (
              <button
                key={key}
                onClick={() => onNavigate(key)}
                style={isActive ? { backgroundColor: "#b73e13", color: "#ffffff" } : undefined}
                className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "shadow-sm"
                    : "text-slate-700 dark:text-slate-300 hover:bg-brand-tint hover:text-brand-dark dark:hover:bg-slate-800"
                }`}
              >
                <Icon size={16} />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Session status summary */}
        <div className="shrink-0 px-3 pt-2">
          <div className="rounded-md bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <StatusPill status={status.live_state} />
              <OfflineBadge status={status} />
            </div>
            {status.profile?.team_name && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Team · <span className="text-slate-700 dark:text-slate-200 font-medium">{status.profile.team_name}</span>
              </div>
            )}
          </div>
        </div>

        {/* User + logout */}
        <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 px-3 py-3 mt-3">
          <div className="px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
            {firstName || "—"}
          </div>
          <div className="px-2 pb-2 text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {status.profile?.email ?? ""}
          </div>
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-brand-tint hover:text-brand-dark dark:hover:bg-slate-800 transition-colors"
          >
            <LogOut size={16} />
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
