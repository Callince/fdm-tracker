import { useEffect, useMemo, useState } from "react";
import { addMinutes, differenceInSeconds, parseISO, startOfHour } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import type { DayDetail } from "@shared/types";

// Track the current dark-mode state so SVG fills (which ignore CSS variables
// at a distance) can pick the right palette. Updates whenever the `.dark`
// class on <html> toggles.
function useIsDark(): boolean {
  const [dark, setDark] = useState(
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains("dark")));
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

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

/** Subtract every break window from a single activity range, returning 0–N
 * pieces. Pieces preserve the original kind ("active"/"idle"). */
function carveBreaks(r: Range, breaks: Range[]): Range[] {
  let pieces: Range[] = [{ ...r }];
  for (const b of breaks) {
    const next: Range[] = [];
    for (const p of pieces) {
      if (b.end <= p.start || b.start >= p.end) {
        next.push(p);
        continue;
      }
      if (b.start > p.start) next.push({ start: p.start, end: b.start, kind: p.kind });
      if (b.end < p.end) next.push({ start: b.end, end: p.end, kind: p.kind });
    }
    pieces = next;
  }
  return pieces;
}

function collapseBuckets(detail: DayDetail): Range[] {
  // Build break ranges first — they take priority over active/idle when they
  // overlap, because a break stops both.
  const breaks: Range[] = [];
  for (const b of detail.breaks) {
    if (!b.ended_at) continue;
    breaks.push({ start: parseISO(b.started_at), end: parseISO(b.ended_at), kind: "break" });
  }

  // Coalesce contiguous same-kind buckets into ranges.
  const coalesced: Range[] = [];
  const sorted = [...detail.buckets].sort((a, b) => a.bucket_start.localeCompare(b.bucket_start));
  for (const b of sorted) {
    const start = parseISO(b.bucket_start);
    const end = new Date(start.getTime() + 60_000);
    const kind: RangeKind = b.active_seconds >= b.idle_seconds ? "active" : "idle";
    const last = coalesced.at(-1);
    if (last && last.kind === kind && Math.abs(last.end.getTime() - start.getTime()) <= 1500) {
      last.end = end;
    } else {
      coalesced.push({ start, end, kind });
    }
  }

  // Carve break windows out of each active/idle range so they don't visually
  // overlap a break.
  const out: Range[] = [];
  for (const r of coalesced) {
    out.push(...carveBreaks(r, breaks));
  }
  out.push(...breaks);
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function generateTicks(min: Date, max: Date): Date[] {
  const spanSec = differenceInSeconds(max, min);
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

export function DayTimeline({ detail }: { detail: DayDetail }) {
  const [hover, setHover] = useState<{ range: Range; x: number; y: number } | null>(null);
  const isDark = useIsDark();
  // Palette for SVG fills / strokes — swaps on dark-mode toggle.
  const palette = isDark
    ? { laneBg: "#1e293b", gridLine: "#334155", sessionBar: "#475569", axis: "#475569", tick: "#64748b" }
    : { laneBg: "#f8fafc", gridLine: "#e2e8f0", sessionBar: "#cbd5e1", axis: "#cbd5e1", tick: "#94a3b8" };

  const { ranges, bounds, ticks } = useMemo(() => {
    const r = collapseBuckets(detail);
    let min: Date | null = null;
    let max: Date | null = null;
    for (const x of r) {
      if (!min || x.start < min) min = x.start;
      if (!max || x.end > max) max = x.end;
    }
    for (const s of detail.sessions) {
      const st = parseISO(s.started_at);
      const en = s.ended_at ? parseISO(s.ended_at) : new Date();
      if (!min || st < min) min = st;
      if (!max || en > max) max = en;
    }
    if (!min || !max) return { ranges: [], bounds: null, ticks: [] };
    min = new Date(min.getTime() - 5 * 60_000);
    max = new Date(max.getTime() + 5 * 60_000);
    return { ranges: r, bounds: { min, max }, ticks: generateTicks(min, max) };
  }, [detail]);

  if (!bounds) return <div className="text-sm text-slate-500">No activity for this day.</div>;

  const { min, max } = bounds;
  const totalSec = differenceInSeconds(max, min);
  const pct = (d: Date) => ((d.getTime() - min.getTime()) / 1000 / totalSec) * 100;

  const laneH = 24;
  const gap = 6;
  const axisH = 26;
  const height = laneH * 3 + gap * 2 + axisH;

  const activityRanges = ranges.filter((r) => r.kind !== "break");
  const breakRanges = ranges.filter((r) => r.kind === "break");

  return (
    <div className="space-y-4">
      <div className="relative w-full">
        <svg
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: `${height * 2}px` }}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t, i) => {
            const x = pct(t);
            return (
              <line key={`g-${i}`} x1={x} x2={x} y1={0} y2={laneH * 3 + gap * 2}
                    stroke={palette.gridLine} strokeWidth={0.15} />
            );
          })}

          <rect x={0} y={0} width={100} height={laneH} fill={palette.laneBg} />
          <rect x={0} y={laneH + gap} width={100} height={laneH} fill={palette.laneBg} />
          <rect x={0} y={(laneH + gap) * 2} width={100} height={laneH} fill={palette.laneBg} />

          {detail.sessions.map((s) => {
            const x = pct(parseISO(s.started_at));
            const x2 = pct(s.ended_at ? parseISO(s.ended_at) : new Date());
            return (
              <rect key={`s-${s.id}`} x={x} y={4} width={Math.max(0.2, x2 - x)}
                    height={laneH - 8} fill={palette.sessionBar} rx={1} />
            );
          })}

          {activityRanges.map((r, i) => {
            const x = pct(r.start);
            const x2 = pct(r.end);
            return (
              <rect key={`a-${i}`} x={x} y={laneH + gap + 2}
                    width={Math.max(0.2, x2 - x)} height={laneH - 4}
                    fill={KIND_STYLE[r.kind].fill} rx={1}
                    onMouseMove={(e) => setHover({ range: r, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
                    style={{ cursor: "pointer" }} />
            );
          })}

          {breakRanges.map((r, i) => {
            const x = pct(r.start);
            const x2 = pct(r.end);
            return (
              <rect key={`b-${i}`} x={x} y={(laneH + gap) * 2 + 2}
                    width={Math.max(0.2, x2 - x)} height={laneH - 4}
                    fill={KIND_STYLE.break.fill} rx={1}
                    onMouseMove={(e) => setHover({ range: r, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
                    style={{ cursor: "pointer" }} />
            );
          })}

          <line x1={0} x2={100} y1={laneH * 3 + gap * 2} y2={laneH * 3 + gap * 2}
                stroke={palette.axis} strokeWidth={0.3} />
          {ticks.map((t, i) => {
            const x = pct(t);
            return (
              <line key={`tk-${i}`} x1={x} x2={x}
                    y1={laneH * 3 + gap * 2} y2={laneH * 3 + gap * 2 + 4}
                    stroke={palette.tick} strokeWidth={0.3} />
            );
          })}
        </svg>

        <div className="absolute left-1 top-0 pointer-events-none text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400" style={{ lineHeight: `${laneH * 2}px` }}>Session</div>
        <div className="absolute left-1 pointer-events-none text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400" style={{ top: `${(laneH + gap) * 2}px`, lineHeight: `${laneH * 2}px` }}>Activity</div>
        <div className="absolute left-1 pointer-events-none text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400" style={{ top: `${(laneH + gap) * 4}px`, lineHeight: `${laneH * 2}px` }}>Break</div>

        <div className="relative w-full h-4 mt-1 text-[10px] text-slate-500 dark:text-slate-400 select-none">
          {ticks.map((t, i) => (
            <span key={`tl-${i}`} className="absolute -translate-x-1/2" style={{ left: `${pct(t)}%` }}>
              {formatInTimeZone(t, detail.timezone, "HH:mm")}
            </span>
          ))}
        </div>

        {hover && (
          <div
            className="absolute z-10 pointer-events-none rounded-md bg-slate-900 text-white text-xs px-2 py-1 shadow"
            style={{ left: hover.x, top: hover.y - 40, transform: "translateX(-50%)" }}
          >
            <div style={{ color: KIND_STYLE[hover.range.kind].fill, fontWeight: 600 }}>
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
                <span className="tabular-nums text-slate-700 dark:text-slate-200">
                  {formatInTimeZone(r.start, detail.timezone, "HH:mm:ss")}
                  {" – "}
                  {formatInTimeZone(r.end, detail.timezone, "HH:mm:ss")}
                </span>
                <span className="ml-auto text-slate-500 tabular-nums">{humanDuration(dur)}</span>
              </li>
            );
          })}
          {ranges.length === 0 && <li className="px-3 py-2 text-slate-400">No ranges.</li>}
        </ul>
      </div>
    </div>
  );
}
