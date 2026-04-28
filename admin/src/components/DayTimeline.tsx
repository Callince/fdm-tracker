"use client";

import { useMemo, useState } from "react";
import { addMinutes, differenceInSeconds, format as fmt, parseISO, startOfHour } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import type { DayDetail } from "@/lib/types";
import { useIsDark } from "@/lib/useIsDark";

interface Props { detail: DayDetail }

type RangeKind = "active" | "idle" | "break";

interface Range {
  start: Date;
  end: Date;
  kind: RangeKind;
}

const KIND_STYLE: Record<RangeKind, { fill: string; text: string; label: string }> = {
  active: { fill: "#10b981", text: "text-active", label: "Active" },
  idle: { fill: "#f59e0b", text: "text-idle", label: "Idle" },
  break: { fill: "#3b82f6", text: "text-brk", label: "Break" },
};

function humanDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}m`;
}

function collapseBuckets(detail: DayDetail): Range[] {
  // Each bucket = 60s. Classify by dominant (active_seconds >= idle_seconds → active).
  const out: Range[] = [];
  const sorted = [...detail.buckets].sort((a, b) => a.bucket_start.localeCompare(b.bucket_start));
  for (const b of sorted) {
    const start = parseISO(b.bucket_start);
    const end = new Date(start.getTime() + 60_000);
    const kind: RangeKind = b.active_seconds >= b.idle_seconds ? "active" : "idle";
    const last = out.at(-1);
    // Merge contiguous same-kind buckets (allow a 1s gap for bucket edges).
    if (last && last.kind === kind && Math.abs(last.end.getTime() - start.getTime()) <= 1500) {
      last.end = end;
    } else {
      out.push({ start, end, kind });
    }
  }
  for (const b of detail.breaks) {
    if (!b.ended_at) continue;
    out.push({ start: parseISO(b.started_at), end: parseISO(b.ended_at), kind: "break" });
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function generateTicks(min: Date, max: Date): Date[] {
  const spanSec = differenceInSeconds(max, min);
  // Choose a tick interval that produces 6–12 ticks across the span.
  let stepMin = 60;
  if (spanSec < 30 * 60) stepMin = 5;
  else if (spanSec < 2 * 3600) stepMin = 15;
  else if (spanSec < 4 * 3600) stepMin = 30;
  else if (spanSec < 12 * 3600) stepMin = 60;
  else stepMin = 120;

  const ticks: Date[] = [];
  let t = startOfHour(min);
  while (t.getTime() < min.getTime()) t = addMinutes(t, stepMin);
  while (t.getTime() <= max.getTime()) {
    if (t.getTime() >= min.getTime()) ticks.push(t);
    t = addMinutes(t, stepMin);
  }
  return ticks;
}

export function DayTimeline({ detail }: Props) {
  const dark = useIsDark();
  const gridStroke = dark ? "#334155" : "#e2e8f0";
  const laneBg = dark ? "#1e293b" : "#f8fafc";
  const sessionFill = dark ? "#475569" : "#cbd5e1";
  const axisStroke = dark ? "#475569" : "#cbd5e1";
  const tickStroke = dark ? "#64748b" : "#94a3b8";
  const [hover, setHover] = useState<{ range: Range; x: number; y: number } | null>(null);

  const { ranges, bounds, ticks } = useMemo(() => {
    const ranges = collapseBuckets(detail);
    let min: Date | null = null;
    let max: Date | null = null;
    for (const r of ranges) {
      if (!min || r.start < min) min = r.start;
      if (!max || r.end > max) max = r.end;
    }
    for (const s of detail.sessions) {
      const st = parseISO(s.started_at);
      const en = s.ended_at ? parseISO(s.ended_at) : new Date();
      if (!min || st < min) min = st;
      if (!max || en > max) max = en;
    }
    if (!min || !max) return { ranges: [], bounds: null, ticks: [] };
    // Pad 5 min each side.
    min = new Date(min.getTime() - 5 * 60_000);
    max = new Date(max.getTime() + 5 * 60_000);
    return { ranges, bounds: { min, max }, ticks: generateTicks(min, max) };
  }, [detail]);

  if (!bounds) return <div className="text-sm text-slate-500 dark:text-slate-400">No activity for this day.</div>;

  const { min, max } = bounds;
  const totalSec = differenceInSeconds(max, min);
  const pct = (d: Date) => ((d.getTime() - min.getTime()) / 1000 / totalSec) * 100;

  function hoverTooltip(range: Range, e: React.MouseEvent<SVGRectElement>) {
    setHover({
      range,
      x: e.nativeEvent.offsetX,
      y: e.nativeEvent.offsetY,
    });
  }

  const laneH = 24;
  const gap = 6;
  const axisH = 26;
  const height = laneH * 3 + gap * 2 + axisH;

  const activityRanges = ranges.filter((r) => r.kind !== "break");
  const breakRanges = ranges.filter((r) => r.kind === "break");

  return (
    <div className="space-y-4">
      {/* bar chart ---------------------------------------------------------- */}
      <div className="relative w-full">
        <svg
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: `${height * 2}px` }}
          onMouseLeave={() => setHover(null)}
        >
          {/* vertical grid at ticks */}
          {ticks.map((t, i) => {
            const x = pct(t);
            return (
              <line
                key={`g-${i}`}
                x1={x} x2={x}
                y1={0} y2={laneH * 3 + gap * 2}
                stroke={gridStroke}
                strokeWidth={0.15}
              />
            );
          })}

          {/* lane labels (as rect backgrounds so they're easy to see) */}
          <rect x={0} y={0} width={100} height={laneH} fill={laneBg} />
          <rect x={0} y={laneH + gap} width={100} height={laneH} fill={laneBg} />
          <rect x={0} y={(laneH + gap) * 2} width={100} height={laneH} fill={laneBg} />

          {/* Session envelope — lane 0 */}
          {detail.sessions.map((s) => {
            const x = pct(parseISO(s.started_at));
            const x2 = pct(s.ended_at ? parseISO(s.ended_at) : new Date());
            return (
              <rect
                key={`s-${s.id}`}
                x={x} y={4}
                width={Math.max(0.2, x2 - x)}
                height={laneH - 8}
                fill={sessionFill}
                rx={1}
              />
            );
          })}

          {/* Activity/Idle — lane 1 */}
          {activityRanges.map((r, i) => {
            const x = pct(r.start);
            const x2 = pct(r.end);
            return (
              <rect
                key={`a-${i}`}
                x={x} y={laneH + gap + 2}
                width={Math.max(0.2, x2 - x)}
                height={laneH - 4}
                fill={KIND_STYLE[r.kind].fill}
                rx={1}
                onMouseMove={(e) => hoverTooltip(r, e)}
                style={{ cursor: "pointer" }}
              />
            );
          })}

          {/* Breaks — lane 2 */}
          {breakRanges.map((r, i) => {
            const x = pct(r.start);
            const x2 = pct(r.end);
            return (
              <rect
                key={`b-${i}`}
                x={x} y={(laneH + gap) * 2 + 2}
                width={Math.max(0.2, x2 - x)}
                height={laneH - 4}
                fill={KIND_STYLE.break.fill}
                rx={1}
                onMouseMove={(e) => hoverTooltip(r, e)}
                style={{ cursor: "pointer" }}
              />
            );
          })}

          {/* axis line */}
          <line
            x1={0} x2={100}
            y1={laneH * 3 + gap * 2}
            y2={laneH * 3 + gap * 2}
            stroke={axisStroke}
            strokeWidth={0.3}
          />
          {ticks.map((t, i) => {
            const x = pct(t);
            return (
              <line
                key={`tk-${i}`}
                x1={x} x2={x}
                y1={laneH * 3 + gap * 2}
                y2={laneH * 3 + gap * 2 + 4}
                stroke={tickStroke}
                strokeWidth={0.3}
              />
            );
          })}
        </svg>

        {/* HTML-layer: lane labels on the left */}
        <div className="absolute left-1 top-0 pointer-events-none text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400" style={{ lineHeight: `${laneH * 2}px` }}>Session</div>
        <div className="absolute left-1 pointer-events-none text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400"
             style={{ top: `${(laneH + gap) * 2}px`, lineHeight: `${laneH * 2}px` }}>Activity</div>
        <div className="absolute left-1 pointer-events-none text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400"
             style={{ top: `${(laneH + gap) * 4}px`, lineHeight: `${laneH * 2}px` }}>Break</div>

        {/* time labels along the axis */}
        <div className="relative w-full h-4 mt-1 text-[10px] text-slate-500 dark:text-slate-400 select-none">
          {ticks.map((t, i) => (
            <span
              key={`tl-${i}`}
              className="absolute -translate-x-1/2"
              style={{ left: `${pct(t)}%` }}
            >
              {formatInTimeZone(t, detail.timezone, "HH:mm")}
            </span>
          ))}
        </div>

        {/* tooltip */}
        {hover && (
          <div
            className="absolute z-10 pointer-events-none rounded-md bg-slate-900 text-white text-xs px-2 py-1 shadow"
            style={{ left: hover.x, top: hover.y - 40, transform: "translateX(-50%)" }}
          >
            <div className={`font-semibold ${KIND_STYLE[hover.range.kind].text}`} style={{ color: KIND_STYLE[hover.range.kind].fill }}>
              {KIND_STYLE[hover.range.kind].label}
            </div>
            <div>
              {formatInTimeZone(hover.range.start, detail.timezone, "HH:mm:ss")}
              {" → "}
              {formatInTimeZone(hover.range.end, detail.timezone, "HH:mm:ss")}
            </div>
            <div className="text-slate-300">
              {humanDuration(differenceInSeconds(hover.range.end, hover.range.start))}
            </div>
          </div>
        )}
      </div>

      {/* explicit ranges list --------------------------------------------- */}
      <div>
        <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Ranges</div>
        <ul className="text-xs divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md bg-white dark:bg-slate-900">
          {ranges.map((r, i) => {
            const dur = differenceInSeconds(r.end, r.start);
            const s = KIND_STYLE[r.kind];
            return (
              <li key={`r-${i}`} className="flex items-center gap-3 px-3 py-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.fill }} />
                <span className={`w-16 font-medium ${s.text}`}>{s.label}</span>
                <span className="tabular-nums text-slate-700 dark:text-slate-300">
                  {formatInTimeZone(r.start, detail.timezone, "HH:mm:ss")}
                  {" – "}
                  {formatInTimeZone(r.end, detail.timezone, "HH:mm:ss")}
                </span>
                <span className="ml-auto text-slate-500 dark:text-slate-400 tabular-nums">{humanDuration(dur)}</span>
              </li>
            );
          })}
          {ranges.length === 0 && <li className="px-3 py-2 text-slate-400 dark:text-slate-500">No ranges.</li>}
        </ul>
      </div>
    </div>
  );
}
