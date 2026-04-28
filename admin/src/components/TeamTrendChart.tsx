"use client";

import { useMemo } from "react";
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

export function TeamTrendChart({ trend }: { trend: TeamTrend | undefined }) {
  const dark = useIsDark();
  const grid = dark ? "#334155" : "#e2e8f0";
  const axis = dark ? "#94a3b8" : "#64748b";
  const tooltipBg = dark ? "#0f172a" : "#ffffff";
  const tooltipBorder = dark ? "#334155" : "#e2e8f0";
  const tooltipText = dark ? "#e2e8f0" : "#0f172a";

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
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="g-idle" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="g-brk" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke={axis} fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}h`} />
          <Tooltip
            formatter={(v: number) => `${v}h`}
            contentStyle={{
              background: tooltipBg,
              border: `1px solid ${tooltipBorder}`,
              borderRadius: 8,
              fontSize: 12,
              color: tooltipText,
            }}
            labelStyle={{ color: tooltipText }}
            itemStyle={{ color: tooltipText }}
          />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 12, color: axis }} />
          <Area type="monotone" dataKey="active" name="Active" stroke="#10b981" fill="url(#g-active)" stackId="1" />
          <Area type="monotone" dataKey="idle" name="Idle" stroke="#f59e0b" fill="url(#g-idle)" stackId="1" />
          <Area type="monotone" dataKey="brk" name="Break" stroke="#3b82f6" fill="url(#g-brk)" stackId="1" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
