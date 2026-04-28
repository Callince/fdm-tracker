"use client";

import Link from "next/link";
import { useMemo } from "react";
import dynamic from "next/dynamic";
import { addDays, format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Activity, Coffee, Users } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { TeamCard, buildTeamSummaries } from "@/components/TeamCard";
import { ActivityHighlights } from "@/components/ActivityHighlights";
import { hms, relativeFromNow, statusColor, statusLabel } from "@/lib/format";

const TeamTrendChart = dynamic(
  () => import("@/components/TeamTrendChart").then((m) => m.TeamTrendChart),
  {
    ssr: false,
    loading: () => <div className="h-72 w-full rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />,
  },
);

export default function DashboardPage() {
  const overviewQ = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => api.overview(),
    refetchInterval: 30_000,
  });

  const liveQ = useQuery({
    queryKey: ["admin", "live"],
    queryFn: () => api.liveSnapshot(),
    refetchInterval: 30_000,
  });

  const range = useMemo(() => {
    const to = new Date();
    const from = addDays(to, -6);
    return { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
  }, []);

  const trendQ = useQuery({
    queryKey: ["admin", "team-trend", range.from, range.to],
    queryFn: () => api.teamTrend(range.from, range.to),
    refetchInterval: 60_000,
  });

  const teamSummaries = useMemo(
    () => (liveQ.data ? buildTeamSummaries(liveQ.data.users) : []),
    [liveQ.data],
  );

  // Top-5 recently seen (excluding never-seen users).
  const recent = useMemo(() => {
    const users = liveQ.data?.users ?? [];
    return [...users]
      .filter((u) => u.last_seen_at)
      .sort((a, b) => (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? ""))
      .slice(0, 5);
  }, [liveQ.data]);

  const o = overviewQ.data;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Live overview"
        title="Teams at a glance"
        subtitle="Auto-refreshes every 30 seconds. Click a team to drill in."
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Team size"
          value={o ? `${o.total_users}` : "—"}
          hint={`${teamSummaries.length} team${teamSummaries.length === 1 ? "" : "s"}`}
          icon={<Users size={28} />}
        />
        <StatCard
          label="Working now"
          value={o ? `${o.active_now}` : "—"}
          hint={o ? `${o.on_break_now} on break` : undefined}
          accent="active"
          icon={<Activity size={28} />}
        />
        <StatCard
          label="Team active today"
          value={o ? hms(o.team_active_seconds_today) : "—"}
          accent="active"
        />
        <StatCard
          label="Team break today"
          value={o ? hms(o.team_break_seconds_today) : "—"}
          accent="brk"
          icon={<Coffee size={28} />}
        />
      </div>

      {/* Teams grid — promoted above the chart so "what's happening now" wins the fold */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold">Teams</h2>
          <Link href="/users" className="text-xs text-slate-600 dark:text-slate-400 hover:text-brand-dark dark:hover:text-brand-light">
            Manage people →
          </Link>
        </div>

        {liveQ.isLoading && <div className="text-sm text-slate-500 dark:text-slate-400">Loading…</div>}
        {!liveQ.isLoading && teamSummaries.length === 0 && (
          <EmptyState
            title="No teams yet"
            description="Create a team and assign users to see grouped activity here."
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {teamSummaries.map((t) => (
            <TeamCard key={t.team_id ?? "_"} summary={t} />
          ))}
        </div>
      </section>

      {/* Activity highlights — top / low performers today */}
      {!liveQ.isLoading && (liveQ.data?.users.length ?? 0) > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-semibold">Activity highlights</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">Based on today's tracked time</span>
          </div>
          <ActivityHighlights users={liveQ.data!.users} />
        </section>
      )}

      {/* Below-fold: trend + recently-active list */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Team activity — last 7 days</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Stacked hours across all users.
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <TeamTrendChart trend={trendQ.data} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="text-sm font-semibold">Recently active</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Users seen most recently.
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {recent.length === 0 ? (
              <EmptyState title="Nothing to show" description="Activity rolls in once a user signs in from the desktop app." />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {recent.map((u) => (
                  <li key={u.id} className="px-4 py-3">
                    <Link href={`/users/${u.id}`} className="flex items-center gap-3 hover:text-brand-dark dark:hover:text-brand-light">
                      <span className={`h-2 w-2 rounded-full ${statusColor(u.status)}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{u.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {u.team_name ?? "No team"} · {statusLabel(u.status)}
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 tabular-nums">
                        {relativeFromNow(u.last_seen_at)}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
