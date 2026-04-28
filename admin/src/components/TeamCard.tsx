"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { AdminUserRow } from "@/lib/types";
import { hms } from "@/lib/format";

export interface TeamSummary {
  team_id: string | null;          // null for "No team"
  team_name: string | null;
  members: AdminUserRow[];
  active_now: number;
  on_break_now: number;
  active_seconds: number;
  idle_seconds: number;
  break_seconds: number;
}

export function buildTeamSummaries(users: AdminUserRow[]): TeamSummary[] {
  const groups = new Map<string, TeamSummary>();
  for (const u of users) {
    const key = u.team_id ?? "_";
    const existing = groups.get(key);
    const base: TeamSummary = existing ?? {
      team_id: u.team_id,
      team_name: u.team_name,
      members: [],
      active_now: 0,
      on_break_now: 0,
      active_seconds: 0,
      idle_seconds: 0,
      break_seconds: 0,
    };
    base.members.push(u);
    base.active_seconds += u.today_active_seconds;
    base.idle_seconds += u.today_idle_seconds;
    base.break_seconds += u.today_break_seconds;
    if (u.status === "active") base.active_now += 1;
    if (u.status === "on_break") base.on_break_now += 1;
    groups.set(key, base);
  }
  return Array.from(groups.values()).sort((a, b) => {
    // Real teams first, "No team" last.
    if (!a.team_id && b.team_id) return 1;
    if (a.team_id && !b.team_id) return -1;
    return (a.team_name ?? "").localeCompare(b.team_name ?? "");
  });
}

export function TeamCard({ summary }: { summary: TeamSummary }) {
  const href = summary.team_id ? `/teams/${summary.team_id}` : "/users?team=none";
  const name = summary.team_name ?? "No team";

  return (
    <Link
      href={href}
      className="group relative block rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 pl-6 overflow-hidden hover:border-brand/60 dark:hover:border-brand/60 hover:shadow-md transition"
    >
      <span className="absolute left-0 top-0 h-full w-1 bg-brand opacity-40 group-hover:opacity-100 transition" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-brand-dark/80 dark:text-brand-light">
            Team
          </div>
          <div className="text-lg font-semibold mt-0.5 truncate text-slate-900 dark:text-slate-100">{name}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {summary.members.length} member{summary.members.length === 1 ? "" : "s"}
          </div>
        </div>
        <ArrowRight
          size={18}
          className="text-slate-300 dark:text-slate-600 group-hover:text-brand dark:group-hover:text-brand-light transition mt-1"
        />
      </div>

      <div className="mt-4 flex items-center gap-4">
        <Pulse count={summary.active_now} label="active" color="bg-active" />
        <Pulse count={summary.on_break_now} label="on break" color="bg-brk" />
        <Pulse
          count={summary.members.length - summary.active_now - summary.on_break_now}
          label="idle/offline"
          color="bg-slate-300 dark:bg-slate-600"
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <Stat label="Active" value={hms(summary.active_seconds)} color="text-active" />
        <Stat label="Idle" value={hms(summary.idle_seconds)} color="text-idle" />
        <Stat label="Break" value={hms(summary.break_seconds)} color="text-brk" />
      </div>
    </Link>
  );
}

function Pulse({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      <span className="text-slate-700 dark:text-slate-200 font-medium tabular-nums">{count}</span>
      <span className="text-slate-500 dark:text-slate-400 text-xs">{label}</span>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`text-sm font-semibold ${color}`}>{value}</div>
    </div>
  );
}
