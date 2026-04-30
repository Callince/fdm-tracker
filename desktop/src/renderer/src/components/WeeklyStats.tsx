import { useEffect, useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { hms } from "@/lib/format";
import { Skeleton } from "@/components/Skeleton";
import type { DailySummary } from "@shared/types";

export function WeeklyStats() {
  const [days, setDays] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const to = new Date();
    const from = addDays(to, -6);
    setLoading(true);
    window.fdm
      .dailySummary(format(from, "yyyy-MM-dd"), format(to, "yyyy-MM-dd"))
      .then((r) => setDays(r.days))
      .catch(() => setDays([]))
      .finally(() => setLoading(false));
  }, []);

  const { totalActive, maxActive, bars } = useMemo(() => {
    const bars = days.map((d) => ({
      label: format(parseISO(d.date), "EEEEE"),  // single-letter day
      active: d.total_active_seconds,
    }));
    const totalActive = bars.reduce((a, b) => a + b.active, 0);
    const maxActive = bars.reduce((m, b) => Math.max(m, b.active), 1);
    return { totalActive, maxActive, bars };
  }, [days]);

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex items-end gap-2 h-16">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <Skeleton className="w-full" style={{ height: `${20 + Math.random() * 60}%` } as React.CSSProperties} />
              <Skeleton className="h-2 w-2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold">This week</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          total active <span className="text-active font-medium">{hms(totalActive)}</span>
        </div>
      </div>
      <div className="flex items-end gap-2 h-16">
        {bars.map((b, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div
              className="w-full rounded bg-active/80 hover:bg-active transition-colors"
              style={{ height: `${(b.active / maxActive) * 100}%`, minHeight: b.active > 0 ? 2 : 0 }}
              title={`${hms(b.active)}`}
            />
            <span className="text-[10px] text-slate-500 dark:text-slate-400">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
