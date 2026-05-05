import { useEffect, useMemo, useState } from "react";
import { eachDayOfInterval, endOfMonth, format, isSameDay, startOfDay, startOfMonth } from "date-fns";
import { hms } from "@/lib/format";
import { Skeleton } from "@/components/Skeleton";
import type { DailySummary, Holiday } from "@shared/types";

/**
 * "This month" daily-active bar chart. Shows every day from the 1st of
 * the current month through today. Weekends + admin-marked holidays are
 * dimmed; admin "working" overrides recolor a weekend back into a normal
 * working day. Today is highlighted.
 */
export function MonthlyStats() {
  const [days, setDays] = useState<DailySummary[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date();
    const from = startOfMonth(today);
    const to = endOfMonth(today);
    setLoading(true);
    const fdm = typeof window !== "undefined" ? window.fdm : undefined;
    if (!fdm) {
      setLoading(false);
      return;
    }
    Promise.all([
      fdm.dailySummary(format(from, "yyyy-MM-dd"), format(to, "yyyy-MM-dd")),
      fdm.listHolidays().then((r) => (r.ok && r.data ? r.data.holidays : [])),
    ])
      .then(([summary, hols]) => {
        setDays(summary.days);
        setHolidays(hols);
      })
      .catch(() => {
        setDays([]);
        setHolidays([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const { bars, totalActive, workingDayCount, totalWorkingDayCount } = useMemo(() => {
    const today = new Date();
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    const summaryByIso = new Map(days.map((d) => [d.date, d]));
    const holidayByIso = new Map(holidays.map((h) => [h.date, h]));

    const all = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const todayStart = startOfDay(today).getTime();
    const bars = all.map((d) => {
      const iso = format(d, "yyyy-MM-dd");
      const summary = summaryByIso.get(iso);
      const holiday = holidayByIso.get(iso);
      const dow = d.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const isOff = holiday?.kind === "holiday" || (isWeekend && holiday?.kind !== "working");
      return {
        date: d,
        iso,
        dayNum: format(d, "d"),
        active: summary?.total_active_seconds ?? 0,
        isToday: isSameDay(d, today),
        // Day-start comparison is DST-safe — a clock jump at 02:00 won't
        // suddenly flip a day into "future".
        isFuture: startOfDay(d).getTime() > todayStart,
        isOff,
        holidayName: holiday?.name,
      };
    });

    const totalActive = bars.reduce((a, b) => a + b.active, 0);
    const workingDayCount = bars.filter((b) => !b.isOff && !b.isFuture).length;
    const totalWorkingDayCount = bars.filter((b) => !b.isOff).length;
    return { bars, totalActive, workingDayCount, totalWorkingDayCount };
  }, [days, holidays]);

  // Use a sensible scale: target hours/day if known, else max active in range.
  const maxScale = useMemo(() => {
    const max = bars.reduce((m, b) => Math.max(m, b.active), 0);
    // Round up to the nearest hour for cleaner bars.
    const seconds = Math.max(max, 3600);
    return Math.ceil(seconds / 3600) * 3600;
  }, [bars]);

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="flex items-end gap-1 h-24">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <Skeleton className="w-full" style={{ height: `${30 + ((i * 17) % 60)}%` } as React.CSSProperties} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          total active <span className="text-active font-medium">{hms(totalActive)}</span>
          <span className="ml-2 text-slate-400 dark:text-slate-500">
            · {workingDayCount} / {totalWorkingDayCount} working days so far
          </span>
        </div>
      </div>
      <div className="flex items-end gap-1 h-24">
        {bars.map((b) => {
          const heightPct = (b.active / maxScale) * 100;
          const barCls = b.isOff
            ? "bg-slate-300/70 dark:bg-slate-700"
            : b.isToday
              ? "bg-active"
              : "bg-active/70 hover:bg-active";
          return (
            <div key={b.iso} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="relative w-full h-full flex items-end">
                {b.isFuture ? (
                  <div className="w-full h-1 rounded border border-dashed border-slate-300 dark:border-slate-700" />
                ) : (
                  <div
                    className={`w-full rounded transition-colors ${barCls} ${b.isToday ? "ring-2 ring-active/40" : ""}`}
                    style={{ height: `${heightPct}%`, minHeight: b.active > 0 ? 2 : 0 }}
                    title={
                      b.holidayName
                        ? `${b.holidayName} · ${hms(b.active)}`
                        : `${format(b.date, "EEE d MMM")} · ${hms(b.active)}`
                    }
                  />
                )}
              </div>
              {/* Render the day-of-month every 5th bar so labels don't clutter
                  on long months; today always gets a label. */}
              {(b.isToday || Number(b.dayNum) % 5 === 0 || b.dayNum === "1") ? (
                <span
                  className={`text-[9px] tabular-nums ${
                    b.isToday
                      ? "text-active font-semibold"
                      : b.isOff
                        ? "text-slate-400 dark:text-slate-600"
                        : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {b.dayNum}
                </span>
              ) : (
                <span className="text-[9px] text-transparent">·</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
