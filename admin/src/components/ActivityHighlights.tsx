"use client";

import Link from "next/link";
import { useMemo } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { AdminUserRow } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { hms, statusColor, statusLabel } from "@/lib/format";

interface Props {
  users: AdminUserRow[];
  /** Whether to show the user's team under their name. Hide on team-detail pages. */
  showTeam?: boolean;
  /** How many to show in each list. */
  limit?: number;
}

/**
 * Two side-by-side cards: highest today_active_seconds ("High activity")
 * and lowest non-zero ("Needs attention"). Driven entirely from the
 * live-snapshot payload already fetched by the parent.
 */
export function ActivityHighlights({ users, showTeam = true, limit = 5 }: Props) {
  const { top, bottom } = useMemo(() => {
    const tracked = users.filter((u) => u.last_seen_at && u.today_active_seconds > 0);
    const sorted = [...tracked].sort(
      (a, b) => b.today_active_seconds - a.today_active_seconds,
    );
    const top = sorted.slice(0, limit);
    const bottom = sorted.slice(-limit).reverse();
    // If the lists overlap (small teams), trim the bottom to exclude overlap.
    const topIds = new Set(top.map((u) => u.id));
    const bottomFiltered = bottom.filter((u) => !topIds.has(u.id));
    return { top, bottom: bottomFiltered };
  }, [users, limit]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <HighlightCard
        tone="up"
        title="High activity today"
        subtitle="Most active users by tracked time today."
        users={top}
        showTeam={showTeam}
        emptyTitle="No activity yet today"
        emptyDescription="Top performers will appear once users start tracking."
      />
      <HighlightCard
        tone="down"
        title="Low activity today"
        subtitle="Lowest tracked time (excluding users who haven't signed in)."
        users={bottom}
        showTeam={showTeam}
        emptyTitle="Nothing to flag"
        emptyDescription="Every active user is above the quiet threshold right now."
      />
    </div>
  );
}

function HighlightCard({
  tone,
  title,
  subtitle,
  users,
  showTeam,
  emptyTitle,
  emptyDescription,
}: {
  tone: "up" | "down";
  title: string;
  subtitle: string;
  users: AdminUserRow[];
  showTeam: boolean;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const Icon = tone === "up" ? TrendingUp : TrendingDown;
  const iconColor =
    tone === "up"
      ? "text-active"
      : "text-amber-600 dark:text-amber-400";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon size={16} className={iconColor} />
          <div className="text-sm font-semibold">{title}</div>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</div>
      </CardHeader>
      <CardBody className="p-0">
        {users.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {users.map((u, i) => (
              <li key={u.id} className="px-4 py-3">
                <Link
                  href={`/users/${u.id}`}
                  className="flex items-center gap-3 hover:text-brand-dark dark:hover:text-brand-light"
                >
                  <span className="w-5 text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                    {i + 1}
                  </span>
                  <span className={`h-2 w-2 rounded-full ${statusColor(u.status)}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{u.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {showTeam
                        ? `${u.team_name ?? "No team"} · ${statusLabel(u.status)}`
                        : statusLabel(u.status)}
                    </div>
                  </div>
                  <div className="text-xs font-medium tabular-nums text-active">
                    {hms(u.today_active_seconds)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
