import { useEffect, useMemo, useState } from "react";
import { addDays, endOfWeek, format, isSameDay, startOfDay, startOfWeek } from "date-fns";
import { hms } from "@/lib/format";
import { Skeleton } from "@/components/Skeleton";
import type { DailySummary, Holiday } from "@shared/types";

export function WeeklyStats() {
  const [days, setDays] = useState<DailySummary[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date();
    const from = startOfWeek(today, { weekStartsOn: 1 });
    const to = endOfWeek(today, { weekStartsOn: 1 });
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

  const { totalActive, maxScale, bars } = useMemo(() => {
    const today = new Date();
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const summaryByIso = new Map(days.map((d) => [d.date, d]));
    const holidayByIso = new Map(holidays.map((h) => [h.date, h]));

    const todayStart = startOfDay(today).getTime();
    const bars = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      const iso = format(d, "yyyy-MM-dd");
      const summary = summaryByIso.get(iso);
      const holiday = holidayByIso.get(iso);
      const dow = d.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const isOff = holiday?.kind === "holiday" || (isWeekend && holiday?.kind !== "working");
      return {
        date: d,
        iso,
        label: format(d, "EEEEE"),
        dayNum: format(d, "d"),
        active: summary?.total_active_seconds ?? 0,
        isToday: isSameDay(d, today),
        isFuture: startOfDay(d).getTime() > todayStart,
        isOff,
        holidayName: holiday?.name,
      };
    });

    const totalActive = bars.reduce((a, b) => a + b.active, 0);
    const max = bars.reduce((m, b) => Math.max(m, b.active), 0);
    // Round up to the nearest hour, minimum 1h, so axis labels stay clean.
    const maxScale = Math.max(3600, Math.ceil(max / 3600) * 3600);
    return { totalActive, maxScale, bars };
  }, [days, holidays]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const maxHours = Math.round(maxScale / 3600);
  const gridLines = [1, 0.5, 0]; // top, mid, bottom

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500 dark:text-slate-400">
        total active <span className="text-active font-semibold tabular-nums">{hms(totalActive)}</span>
      </div>

      {/* Chart */}
      <div className="flex gap-2">
        {/* Y-axis */}
        <div className="flex flex-col justify-between text-[10px] text-slate-400 dark:text-slate-600 tabular-nums h-40 py-0.5 select-none">
          <span>{maxHours}h</span>
          <span>{(maxHours / 2).toFixed(maxHours % 2 === 0 ? 0 : 1)}h</span>
          <span>0h</span>
        </div>

        {/* Plot */}
        <div className="relative flex-1 h-40">
          {/* Gridlines */}
          {gridLines.map((g) => (
            <div
              key={g}
              className="absolute left-0 right-0 border-t border-dashed border-slate-200 dark:border-slate-800"
              style={{ top: `${(1 - g) * 100}%` }}
            />
          ))}
          {/* Bars */}
          <div className="absolute inset-0 flex items-end gap-2 px-1">
            {bars.map((b) => {
              const heightPct = Math.min(100, (b.active / maxScale) * 100);
              const barCls = b.isOff
                ? "bg-slate-300/70 dark:bg-slate-700"
                : b.isToday
                  ? "bg-active"
                  : "bg-active/70 hover:bg-active";
              return (
                <div key={b.iso} className="flex-1 flex flex-col items-center justify-end h-full min-w-0 group">
                  {b.isFuture ? (
                    <div className="w-full max-w-[44px] h-1 rounded border border-dashed border-slate-300 dark:border-slate-700" />
                  ) : (
                    <>
                      {/* Value label above the bar */}
                      {b.active > 0 && (
                        <div
                          className={`text-[10px] tabular-nums mb-1 ${
                            b.isToday
                              ? "text-active font-semibold"
                              : b.isOff
                                ? "text-slate-400"
                                : "text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          {(b.active / 3600).toFixed(1)}h
                        </div>
                      )}
                      <div
                        className={`w-full max-w-[44px] rounded-t-md transition-colors ${barCls} ${
                          b.isToday ? "ring-2 ring-active/40" : ""
                        }`}
                        style={{ height: `${heightPct}%`, minHeight: b.active > 0 ? 4 : 0 }}
                        title={b.holidayName ? `${b.holidayName} · ${hms(b.active)}` : hms(b.active)}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex gap-2 pl-7">
        <div className="flex-1 flex gap-2 px-1">
          {bars.map((b) => (
            <div
              key={b.iso}
              className={`flex-1 text-center text-[10px] tabular-nums ${
                b.isToday
                  ? "text-active font-semibold"
                  : b.isOff
                    ? "text-slate-400 dark:text-slate-600"
                    : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {b.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
