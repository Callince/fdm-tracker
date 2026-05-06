import { useEffect, useState } from "react";
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { hms } from "@/lib/format";

interface ApiTotals {
  total_active_seconds: number;
  total_idle_seconds: number;
  total_break_seconds: number;
  days_counted: number;
  working_days: number;
  holiday_count: number;
  target_hours_per_day: number;
}

async function fetchRange(from: Date, to: Date): Promise<ApiTotals | null> {
  try {
    return await window.fdm.rangeTotals(format(from, "yyyy-MM-dd"), format(to, "yyyy-MM-dd"));
  } catch {
    return null;
  }
}

export function RangeTotals() {
  const [week, setWeek] = useState<ApiTotals | null>(null);
  const [month, setMonth] = useState<ApiTotals | null>(null);

  useEffect(() => {
    const today = new Date();
    // Fetch through end-of-week / end-of-month (not just today) so the
    // backend's `working_days` count reflects every working day in the
    // period — i.e. the target is "8h × all 5 weekdays" not "8h × elapsed
    // days only". Future days have zero activity so totals are unaffected.
    void fetchRange(
      startOfWeek(today, { weekStartsOn: 1 }),
      endOfWeek(today, { weekStartsOn: 1 }),
    ).then(setWeek);
    void fetchRange(startOfMonth(today), endOfMonth(today)).then(setMonth);
  }, []);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <RangeCard label="This week" data={week} kind="week" />
      <RangeCard label="This month" data={month} kind="month" />
    </div>
  );
}

function RangeCard({ label, data, kind }: { label: string; data: ApiTotals | null; kind: "week" | "month" }) {
  const today = new Date();
  // Fallback when the API call hasn't returned yet: count every weekday in
  // the full week / full month so the displayed target matches what the
  // backend will return.
  const fallbackWorkingDays = kind === "week"
    ? countWeekdaysFrom(startOfWeek(today, { weekStartsOn: 1 }), endOfWeek(today, { weekStartsOn: 1 }))
    : countWeekdaysFrom(startOfMonth(today), endOfMonth(today));
  const workingDays = data?.working_days ?? fallbackWorkingDays;
  const target = data?.target_hours_per_day ?? 8;
  const targetSec = target * 3600 * workingDays;
  const activeSec = data?.total_active_seconds ?? 0;
  const idleSec = data?.total_idle_seconds ?? 0;
  const breakSec = data?.total_break_seconds ?? 0;
  // Target = time at the desk: active + idle + break, not active alone.
  const loggedSec = activeSec + idleSec + breakSec;
  const pct = targetSec > 0 ? Math.min(100, Math.round((loggedSec / targetSec) * 100)) : 0;
  const activePct = targetSec > 0 ? Math.min(100, (activeSec / targetSec) * 100) : 0;
  const idlePct = targetSec > 0 ? Math.min(100, (idleSec / targetSec) * 100) : 0;
  const breakPct = targetSec > 0 ? Math.min(100 - activePct - idlePct, (breakSec / targetSec) * 100) : 0;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          {data ? `${pct}% of target` : "—"}
        </div>
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{hms(loggedSec)}</div>
      <div className="mt-2 h-2 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
        <div className="h-full bg-active transition-all" style={{ width: `${activePct}%` }} />
        <div className="h-full bg-idle transition-all" style={{ width: `${idlePct}%` }} />
        <div className="h-full bg-brk transition-all" style={{ width: `${breakPct}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3 text-[11px] gap-2">
        <Cell label="active" value={hms(activeSec)} color="text-active" />
        <Cell label="idle" value={hms(idleSec)} color="text-idle" />
        <Cell label="break" value={hms(breakSec)} color="text-brk" />
      </div>
      <div className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
        {data
          ? `target ${target}h × ${workingDays} working day${workingDays === 1 ? "" : "s"} = ${hms(targetSec)}${data.holiday_count ? ` (${data.holiday_count} holiday${data.holiday_count === 1 ? "" : "s"} excluded)` : ""}`
          : "loading target…"}
      </div>
    </div>
  );
}

function countWeekdaysFrom(start: Date, end: Date): number {
  let n = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const stop = new Date(end);
  stop.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= stop.getTime()) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) n += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return n;
}

function Cell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`font-medium tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
