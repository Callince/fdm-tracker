"use client";

import { memo, useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TeamTrend } from "@/lib/types";
import { useIsDark } from "@/lib/useIsDark";
import { CHART_COLORS, chartTheme } from "@/lib/chart-theme";

function TeamTrendChartImpl({ trend }: { trend: TeamTrend | undefined }) {
  const dark = useIsDark();
  const t = chartTheme(dark);

  const data = useMemo(
    () =>
      (trend?.days ?? []).map((d) => ({
        label: format(parseISO(d.date), "EEE d"),
        active: d.active_hours,
        idle: d.idle_hours,
        brk: d.break_hours,
      })),
    [trend],
  );

  if (!trend || data.length === 0) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">No data for this range.</div>;
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="g-active" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.active} stopOpacity={0.55} />
              <stop offset="100%" stopColor={CHART_COLORS.active} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="g-idle" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.idle} stopOpacity={0.45} />
              <stop offset="100%" stopColor={CHART_COLORS.idle} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="g-brk" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.brk} stopOpacity={0.45} />
              <stop offset="100%" stopColor={CHART_COLORS.brk} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={t.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" stroke={t.axis} fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke={t.axis} fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}h`} />
          <Tooltip
            formatter={(v: number) => `${v}h`}
            contentStyle={{
              background: t.tooltipBg,
              border: `1px solid ${t.tooltipBorder}`,
              borderRadius: 8,
              fontSize: 12,
              color: t.tooltipText,
            }}
            labelStyle={{ color: t.tooltipText }}
            itemStyle={{ color: t.tooltipText }}
          />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 12, color: t.axis }} />
          <Area type="monotone" dataKey="active" name="Active" stroke={CHART_COLORS.active} fill="url(#g-active)" stackId="1" />
          <Area type="monotone" dataKey="idle" name="Idle" stroke={CHART_COLORS.idle} fill="url(#g-idle)" stackId="1" />
          <Area type="monotone" dataKey="brk" name="Break" stroke={CHART_COLORS.brk} fill="url(#g-brk)" stackId="1" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export const TeamTrendChart = memo(TeamTrendChartImpl);
