"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { hms, relativeFromNow, statusColor, statusLabel } from "@/lib/format";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { ActivityHighlights } from "@/components/ActivityHighlights";

export default function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();

  const teamsQ = useQuery({ queryKey: ["admin", "teams"], queryFn: () => api.listTeams() });
  const liveQ = useQuery({
    queryKey: ["admin", "live"],
    queryFn: () => api.liveSnapshot(),
    refetchInterval: 30_000,
  });

  const team = useMemo(
    () => teamsQ.data?.teams.find((t) => t.id === id) ?? null,
    [teamsQ.data, id],
  );

  const members = useMemo(
    () => (liveQ.data?.users ?? []).filter((u) => u.team_id === id),
    [liveQ.data, id],
  );

  const totals = useMemo(() => {
    let a = 0, i = 0, b = 0, active_now = 0, on_break = 0;
    for (const u of members) {
      a += u.today_active_seconds;
      i += u.today_idle_seconds;
      b += u.today_break_seconds;
      if (u.status === "active") active_now += 1;
      if (u.status === "on_break") on_break += 1;
    }
    return { a, i, b, active_now, on_break };
  }, [members]);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Team"
        title={team?.name ?? "Team"}
        subtitle={`${members.length} member${members.length === 1 ? "" : "s"} · auto-refreshes every 30s`}
        back={
          <Link href="/users" className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-brand-dark dark:hover:text-brand-light">
            <ArrowLeft size={12} /> Back to People
          </Link>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Working now" value={`${totals.active_now}`} accent="active" />
        <StatCard label="On break" value={`${totals.on_break}`} accent="brk" />
        <StatCard label="Active today" value={hms(totals.a)} accent="active" />
        <StatCard label="Break today" value={hms(totals.b)} accent="brk" />
      </div>

      {members.length > 0 && (
        <ActivityHighlights users={members} showTeam={false} limit={3} />
      )}

      <Card>
        <CardHeader>
          <div className="text-sm font-semibold">Members</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Click a row to open the user's calendar and day-detail view.
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {liveQ.isLoading ? (
            <TableSkeleton cols={7} rows={5} />
          ) : members.length === 0 ? (
            <EmptyState
              title="No members in this team yet"
              description="Assign users to this team from the Users page."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Team members</caption>
                <thead className="bg-slate-50 dark:bg-slate-900/60 border-y border-slate-200 dark:border-slate-800">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Member</th>
                    <th className="px-4 py-2 font-medium">Position</th>
                    <th className="px-4 py-2 font-medium">Active today</th>
                    <th className="px-4 py-2 font-medium">Idle</th>
                    <th className="px-4 py-2 font-medium">Break</th>
                    <th className="px-4 py-2 font-medium">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((u) => (
                    <tr key={u.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-brand-tint/30 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${statusColor(u.status)}`} />
                          <span className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300">
                            {statusLabel(u.status)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/users/${u.id}`} className="block hover:text-brand-dark dark:hover:text-brand-light">
                          <div className="font-medium truncate text-slate-900 dark:text-slate-100">{u.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{u.email}</div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{u.position ?? "—"}</td>
                      <td className="px-4 py-3 tabular-nums text-active font-medium">{hms(u.today_active_seconds)}</td>
                      <td className="px-4 py-3 tabular-nums text-idle">{hms(u.today_idle_seconds)}</td>
                      <td className="px-4 py-3 tabular-nums text-brk">{hms(u.today_break_seconds)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{relativeFromNow(u.last_seen_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
