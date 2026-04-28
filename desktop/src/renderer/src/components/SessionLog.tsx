import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { parseISO, differenceInSeconds } from "date-fns";
import type { TodaySessionEntry } from "@shared/types";

interface Props {
  entries: TodaySessionEntry[];
  timezone: string;
}

function fmtDur(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}m`;
}

export function SessionLog({ entries, timezone }: Props) {
  const [endingId, setEndingId] = useState<string | null>(null);

  async function endBreak(id: string) {
    setEndingId(id);
    try {
      await window.fdm.endBreakById(id);
    } finally {
      setEndingId(null);
    }
  }

  if (entries.length === 0) {
    return (
      <div className="text-sm text-slate-500 dark:text-slate-400">
        No sessions yet today — press <strong>Start work</strong> to begin.
      </div>
    );
  }

  return (
    <ul className="text-sm divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md bg-white dark:bg-slate-900">
      {entries.map((e) => {
        const start = parseISO(e.started_at);
        const end = e.ended_at ? parseISO(e.ended_at) : new Date();
        const dur = differenceInSeconds(end, start);
        const kind = e.kind;
        const color = kind === "break" ? "bg-brk" : "bg-active";
        const label = kind === "break" ? "Break" : "Session";
        return (
          <li key={`${e.kind}-${e.id}`} className="flex items-center gap-3 px-3 py-2">
            <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
            <span className={`w-16 font-medium ${kind === "break" ? "text-brk" : "text-active"}`}>
              {label}
              {!e.ended_at && <span className="ml-1 text-[10px] uppercase text-slate-400">live</span>}
            </span>
            <span className="tabular-nums text-slate-700 dark:text-slate-300">
              {formatInTimeZone(start, timezone, "HH:mm")}
              {" – "}
              {e.ended_at ? formatInTimeZone(end, timezone, "HH:mm") : "now"}
            </span>
            {e.reason && <span className="text-xs text-slate-500 truncate">{e.reason}</span>}
            <span className="ml-auto tabular-nums text-slate-500 dark:text-slate-400">
              {fmtDur(dur)}
            </span>
            {kind === "break" && !e.ended_at && (
              <button
                onClick={() => endBreak(e.id)}
                disabled={endingId === e.id}
                className="ml-2 text-[11px] px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand hover:text-brand-dark dark:hover:text-brand-light disabled:opacity-50"
                title="Close this break"
              >
                {endingId === e.id ? "Ending…" : "End break"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
