import { useEffect, useMemo, useRef } from "react";
import { addDays, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import type { DailySummary } from "@shared/types";

interface Holiday {
  id: string;
  date: string;       // YYYY-MM-DD
  name: string;
  kind: "holiday" | "working";
}

interface Props {
  month: Date;
  days: DailySummary[];
  onSelect: (d: Date) => void;
  selected?: Date;
  holidays?: Holiday[];
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

function isWeekend(d: Date): boolean {
  const w = d.getDay();
  return w === 0 || w === 6;
}

export function CalendarGrid({ month, days, onSelect, selected, holidays = [] }: Props) {
  const gridRef = useRef<HTMLDivElement | null>(null);

  // Keyboard nav: focus the selected cell when it changes; ←/→/↑/↓ move
  // by 1/7 days, Enter/Space picks. Only fires when focus is inside the grid.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    function onKey(e: KeyboardEvent) {
      const base = selected ?? new Date();
      let next: Date | null = null;
      switch (e.key) {
        case "ArrowLeft": next = addDays(base, -1); break;
        case "ArrowRight": next = addDays(base, 1); break;
        case "ArrowUp": next = addDays(base, -7); break;
        case "ArrowDown": next = addDays(base, 7); break;
        case "Home": next = startOfWeek(base, { weekStartsOn: 1 }); break;
        case "End": next = addDays(startOfWeek(base, { weekStartsOn: 1 }), 6); break;
      }
      if (next) {
        e.preventDefault();
        onSelect(next);
      }
    }
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [selected, onSelect]);

  const lookup = useMemo(() => {
    const m = new Map<string, DailySummary>();
    for (const d of days) m.set(d.date, d);
    return m;
  }, [days]);

  const holidayLookup = useMemo(() => {
    const m = new Map<string, Holiday>();
    for (const h of holidays) m.set(h.date, h);
    return m;
  }, [holidays]);

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
      <div ref={gridRef} className="grid grid-cols-7 gap-1" role="grid">
        {cells.map((d) => {
          const iso = format(d, "yyyy-MM-dd");
          const s = lookup.get(iso);
          const dimmed = !isSameMonth(d, month);
          const isSel = selected && format(selected, "yyyy-MM-dd") === iso;
          const [a, i, b] = s ? barWidths(s) : [0, 0, 0];
          const holiday = holidayLookup.get(iso);
          const weekend = isWeekend(d);
          // A day is "off" when an admin marked it as a holiday, or it's a
          // weekend not overridden as a working day.
          const off = holiday?.kind === "holiday" || (weekend && holiday?.kind !== "working");

          let bgCls = dimmed
            ? "bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-600"
            : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200";
          if (off && !dimmed) {
            bgCls = "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300";
          } else if (holiday?.kind === "working" && !dimmed) {
            bgCls = "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300";
          }

          return (
            <button
              key={iso}
              onClick={() => onSelect(d)}
              title={holiday?.name}
              tabIndex={isSel ? 0 : -1}
              role="gridcell"
              aria-selected={isSel}
              className={`h-16 rounded border text-left p-2 transition focus:outline-none focus:ring-2 focus:ring-brand/60 ${
                isSel
                  ? "border-brand dark:border-brand"
                  : off
                    ? "border-red-200 dark:border-red-900/50 hover:border-red-400 dark:hover:border-red-700"
                    : holiday?.kind === "working"
                      ? "border-emerald-200 dark:border-emerald-900/50 hover:border-emerald-400 dark:hover:border-emerald-700"
                      : "border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500"
              } ${bgCls}`}
            >
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-medium">{format(d, "d")}</div>
                {holiday && (
                  <span className="text-[9px] uppercase tracking-wide opacity-70">
                    {holiday.kind === "working" ? "open" : "off"}
                  </span>
                )}
              </div>
              {holiday ? (
                <div className="mt-1 text-[10px] leading-tight line-clamp-2 opacity-80">
                  {holiday.name}
                </div>
              ) : s && (a + i + b) > 0 ? (
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
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
