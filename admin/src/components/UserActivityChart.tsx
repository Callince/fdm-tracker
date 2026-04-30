"use client";

import { memo, useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { DailySummary } from "@/lib/types";
import { useIsDark } from "@/lib/useIsDark";
import { CHART_COLORS, chartTheme } from "@/lib/chart-theme";

function UserActivityChartImpl({ days }: { days: DailySummary[] }) {
  const dark = useIsDark();
  const t = chartTheme(dark);

  const data = useMemo(
    () =>
      days.map((d) => ({
        label: format(parseISO(d.date), "d"),
        active: +(d.total_active_seconds / 3600).toFixed(2),
        idle: +(d.total_idle_seconds / 3600).toFixed(2),
        brk: +(d.total_break_seconds / 3600).toFixed(2),
      })),
    [days],
  );

  if (data.length === 0) return null;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
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
          <Bar dataKey="active" name="Active" stackId="1" fill={CHART_COLORS.active} />
          <Bar dataKey="idle" name="Idle" stackId="1" fill={CHART_COLORS.idle} />
          <Bar dataKey="brk" name="Break" stackId="1" fill={CHART_COLORS.brk} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export const UserActivityChart = memo(UserActivityChartImpl);
