/** Single source of truth for chart palette. Mirrors the tailwind tokens
 * defined in tailwind.config.js (active / idle / brk / offline). Recharts
 * doesn't read CSS classes for `fill`/`stroke`, so we have to feed it raw
 * hex strings — keeping them here avoids drift across the four charting
 * components that currently inline these literals. */
export const CHART_COLORS = {
  active: "#10b981",
  idle: "#f59e0b",
  brk: "#3b82f6",
  offline: "#6b7280",
} as const;

export type ChartKind = keyof typeof CHART_COLORS;

/** Neutral colors for axes / grids / tooltips, themed by mode. */
export function chartTheme(dark: boolean) {
  return {
    grid: dark ? "#334155" : "#e2e8f0",
    axis: dark ? "#94a3b8" : "#64748b",
    tooltipBg: dark ? "#0f172a" : "#ffffff",
    tooltipBorder: dark ? "#334155" : "#e2e8f0",
    tooltipText: dark ? "#e2e8f0" : "#0f172a",
  } as const;
}
