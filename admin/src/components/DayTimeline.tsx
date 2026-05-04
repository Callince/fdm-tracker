"use client";

import { memo, useMemo, useState } from "react";
import { addMinutes, differenceInSeconds, parseISO, startOfHour } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import type { DayDetail } from "@/lib/types";
import { useIsDark } from "@/lib/useIsDark";
import { CHART_COLORS } from "@/lib/chart-theme";

interface Props { detail: DayDetail }

type RangeKind = "active" | "idle" | "break";

interface Range {
  start: Date;
  end: Date;
  kind: RangeKind;
}

const KIND_STYLE: Record<RangeKind, { fill: string; text: string; label: string }> = {
  active: { fill: CHART_COLORS.active, text: "text-active", label: "Active" },
  idle: { fill: CHART_COLORS.idle, text: "text-idle", label: "Idle" },
  break: { fill: CHART_COLORS.brk, text: "text-brk", label: "Break" },
};

function humanDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}m`;
}

function collapseBuckets(detail: DayDetail): Range[] {
  // Each bucket = 60s. Classify by dominant kind, then coalesce consecutive
  // same-kind buckets. Allow up to a 90s gap so small sync hiccups around
  // breaks/sleep don't fragment a continuous run.
  const COALESCE_GAP_MS = 90_000;
  const breaks: Range[] = [];
  for (const b of detail.breaks) {
    if (!b.ended_at) continue;
    breaks.push({ start: parseISO(b.started_at), end: parseISO(b.ended_at), kind: "break" });
  }

  const coalesced: Range[] = [];
  const sorted = [...detail.buckets].sort((a, b) => a.bucket_start.localeCompare(b.bucket_start));
  for (const b of sorted) {
    const start = parseISO(b.bucket_start);
    const end = new Date(start.getTime() + 60_000);
    const kind: RangeKind = b.active_seconds >= b.idle_seconds ? "active" : "idle";
    const last = coalesced.at(-1);
    const gap = last ? start.getTime() - last.end.getTime() : Infinity;
    if (last && last.kind === kind && gap >= 0 && gap <= COALESCE_GAP_MS) {
      last.end = end;
    } else {
      coalesced.push({ start, end, kind });
    }
  }

  // Carve break windows out of any active/idle range that overlaps them.
  function carve(r: Range): Range[] {
    let pieces: Range[] = [{ ...r }];
    for (const b of breaks) {
      const next: Range[] = [];
      for (const p of pieces) {
        if (b.end <= p.start || b.start >= p.end) { next.push(p); continue; }
        if (b.start > p.start) next.push({ start: p.start, end: b.start, kind: p.kind });
        if (b.end < p.end) next.push({ start: b.end, end: p.end, kind: p.kind });
      }
      pieces = next;
    }
    return pieces;
  }
  const out: Range[] = [];
  for (const r of coalesced) out.push(...carve(r));
  out.push(...breaks);
  out.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Fill bucket gaps inside an active session with idle so the time stays
  // accountable. Without this, a 2-minute hiccup (process restart, brief
  // network outage, suspend without sleep-fill) silently disappears from
  // the timeline because the coalesce tolerance is only 90s. We can't
  // prove the user was active during the gap, so idle is the safe fill.
  const sessionRanges: { start: Date; end: Date }[] = [];
  for (const s of detail.sessions) {
    if (!s.ended_at) continue;
    sessionRanges.push({ start: parseISO(s.started_at), end: parseISO(s.ended_at) });
  }
  const fills: Range[] = [];
  for (const sess of sessionRanges) {
    let cursor = sess.start;
    const inSession = out
      .filter((r) => r.start.getTime() < sess.end.getTime() && r.end.getTime() > sess.start.getTime())
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    for (const r of inSession) {
      if (cursor.getTime() < r.start.getTime()) {
        const gapStart = cursor;
        const gapEnd = new Date(Math.min(r.start.getTime(), sess.end.getTime()));
        const overlapsBreak = breaks.some(
          (b) => b.start.getTime() < gapEnd.getTime() && b.end.getTime() > gapStart.getTime(),
        );
        if (!overlapsBreak && gapEnd.getTime() - gapStart.getTime() >= 1000) {
          fills.push({ start: gapStart, end: gapEnd, kind: "idle" });
        }
      }
      if (r.end.getTime() > cursor.getTime()) cursor = r.end;
    }
    if (cursor.getTime() < sess.end.getTime()) {
      const gapStart = cursor;
      const gapEnd = sess.end;
      const overlapsBreak = breaks.some(
        (b) => b.start.getTime() < gapEnd.getTime() && b.end.getTime() > gapStart.getTime(),
      );
      if (!overlapsBreak && gapEnd.getTime() - gapStart.getTime() >= 1000) {
        fills.push({ start: gapStart, end: gapEnd, kind: "idle" });
      }
    }
  }
  if (fills.length > 0) {
    out.push(...fills);
    out.sort((a, b) => a.start.getTime() - b.start.getTime());
    for (let i = 1; i < out.length; i++) {
      const prev = out[i - 1];
      const cur = out[i];
      if (prev.kind === cur.kind && cur.start.getTime() - prev.end.getTime() <= 1000) {
        prev.end = cur.end > prev.end ? cur.end : prev.end;
        out.splice(i, 1);
        i--;
      }
    }
  }

  // Strictly non-overlapping: truncate any range that starts before the
  // previous one ends (sleep-fill synthetic buckets occasionally collide
  // with real buckets at the seam).
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1];
    const cur = out[i];
    if (cur.start < prev.end) {
      cur.start = new Date(prev.end);
      if (cur.start >= cur.end) { out.splice(i, 1); i--; }
    }
  }
  return out;
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

function DayTimelineImpl({ detail }: Props) {
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

export const DayTimeline = memo(DayTimelineImpl);
