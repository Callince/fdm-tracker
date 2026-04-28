import { useMemo } from "react";
import { addDays, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import type { DailySummary } from "@shared/types";

interface Props {
  month: Date;
  days: DailySummary[];
  onSelect: (d: Date) => void;
  selected?: Date;
}

function barWidths(d: DailySummary): [number, number, number] {
  const sum = d.total_active_seconds + d.total_idle_seconds + d.total_break_seconds;
  if (sum === 0) return [0, 0, 0];
  return [
    (d.total_active_seconds / sum) * 100,
    (d.total_idle_seconds / sum) * 100,
    (d.total_break_seconds / sum) * 100,
  ];
}

export function CalendarGrid({ month, days, onSelect, selected }: Props) {
  const lookup = useMemo(() => {
    const m = new Map<string, DailySummary>();
    for (const d of days) m.set(d.date, d);
    return m;
  }, [days]);

  const cells = useMemo(() => {
    const first = startOfMonth(month);
    const gridStart = startOfWeek(first, { weekStartsOn: 1 });
    const arr: Date[] = [];
    for (let i = 0; i < 42; i++) arr.push(addDays(gridStart, i));
    return arr;
  }, [month]);

  return (
    <div>
      <div className="grid grid-cols-7 text-xs text-slate-500 dark:text-slate-400 mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-2 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const iso = format(d, "yyyy-MM-dd");
          const s = lookup.get(iso);
          const dimmed = !isSameMonth(d, month);
          const isSel = selected && format(selected, "yyyy-MM-dd") === iso;
          const [a, i, b] = s ? barWidths(s) : [0, 0, 0];
          return (
            <button
              key={iso}
              onClick={() => onSelect(d)}
              className={`h-16 rounded border text-left p-2 transition ${
                isSel
                  ? "border-brand dark:border-brand"
                  : "border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500"
              } ${
                dimmed
                  ? "bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-600"
                  : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
              }`}
            >
              <div className="text-xs font-medium">{format(d, "d")}</div>
              {s && (a + i + b) > 0 && (
                <div className="mt-1 space-y-0.5">
                  <div className="h-1 rounded bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full bg-active" style={{ width: `${a}%` }} />
                  </div>
                  <div className="h-1 rounded bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full bg-idle" style={{ width: `${i}%` }} />
                  </div>
                  <div className="h-1 rounded bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full bg-brk" style={{ width: `${b}%` }} />
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
