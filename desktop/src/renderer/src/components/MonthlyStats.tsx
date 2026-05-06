import { useEffect, useMemo, useState } from "react";
import { eachDayOfInterval, endOfMonth, format, isSameDay, startOfDay, startOfMonth } from "date-fns";
import { hms } from "@/lib/format";
import { Skeleton } from "@/components/Skeleton";
import type { DailySummary, Holiday } from "@shared/types";

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

  const { bars, totalActive, workingDayCount, totalWorkingDayCount, maxScale } = useMemo(() => {
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
        isFuture: startOfDay(d).getTime() > todayStart,
        isOff,
        holidayName: holiday?.name,
      };
    });

    const totalActive = bars.reduce((a, b) => a + b.active, 0);
    const workingDayCount = bars.filter((b) => !b.isOff && !b.isFuture).length;
    const totalWorkingDayCount = bars.filter((b) => !b.isOff).length;
    const max = bars.reduce((m, b) => Math.max(m, b.active), 0);
    const maxScale = Math.max(3600, Math.ceil(max / 3600) * 3600);
    return { bars, totalActive, workingDayCount, totalWorkingDayCount, maxScale };
  }, [days, holidays]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  const maxHours = Math.round(maxScale / 3600);
  const gridLines = [1, 0.66, 0.33, 0];

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          total active <span className="text-active font-semibold tabular-nums">{hms(totalActive)}</span>
          <span className="ml-2 text-slate-400 dark:text-slate-500">
            · {workingDayCount} / {totalWorkingDayCount} working days so far
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-active inline-block" /> Today
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-active/70 inline-block" /> Working day
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 dark:bg-slate-700 inline-block" /> Off-day
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-[10px] text-slate-400 dark:text-slate-600 tabular-nums h-44 py-0.5 select-none">
          <span>{maxHours}h</span>
          <span>{(maxHours * 0.66).toFixed(maxHours >= 3 ? 0 : 1)}h</span>
          <span>{(maxHours * 0.33).toFixed(maxHours >= 3 ? 0 : 1)}h</span>
          <span>0h</span>
        </div>
        <div className="relative flex-1 h-44">
          {gridLines.map((g) => (
            <div
              key={g}
              className="absolute left-0 right-0 border-t border-dashed border-slate-200 dark:border-slate-800"
              style={{ top: `${(1 - g) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-[3px] px-1">
            {bars.map((b) => {
              const heightPct = Math.min(100, (b.active / maxScale) * 100);
              const barCls = b.isOff
                ? "bg-slate-300/70 dark:bg-slate-700"
                : b.isToday
                  ? "bg-active"
                  : "bg-active/70 hover:bg-active";
              return (
                <div key={b.iso} className="flex-1 flex items-end h-full min-w-0">
                  {b.isFuture ? (
                    <div className="w-full h-1 self-end rounded border border-dashed border-slate-300 dark:border-slate-700" />
                  ) : (
                    <div
                      className={`w-full rounded-t transition-colors ${barCls} ${
                        b.isToday ? "ring-2 ring-active/40" : ""
                      }`}
                      style={{ height: `${heightPct}%`, minHeight: b.active > 0 ? 3 : 0 }}
                      title={
                        b.holidayName
                          ? `${b.holidayName} · ${hms(b.active)}`
                          : `${format(b.date, "EEE d MMM")} · ${hms(b.active)}`
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* X-axis: every 5th day plus 1 + today */}
      <div className="flex gap-2 pl-7">
        <div className="flex-1 flex gap-[3px] px-1">
          {bars.map((b) => {
            const showLabel = b.isToday || b.dayNum === "1" || Number(b.dayNum) % 5 === 0;
            return (
              <div key={b.iso} className="flex-1 text-center min-w-0">
                <span
                  className={`text-[9px] tabular-nums ${
                    b.isToday
                      ? "text-active font-semibold"
                      : b.isOff
                        ? "text-slate-400 dark:text-slate-600"
                        : "text-slate-500 dark:text-slate-400"
                  } ${showLabel ? "" : "invisible"}`}
                >
                  {b.dayNum}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
