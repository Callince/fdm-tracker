"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { DailySummary } from "@/lib/types";
import { useIsDark } from "@/lib/useIsDark";

export function UserActivityChart({ days }: { days: DailySummary[] }) {
  const dark = useIsDark();
  const grid = dark ? "#334155" : "#e2e8f0";
  const axis = dark ? "#94a3b8" : "#64748b";
  const tooltipBg = dark ? "#0f172a" : "#ffffff";
  const tooltipBorder = dark ? "#334155" : "#e2e8f0";
  const tooltipText = dark ? "#e2e8f0" : "#0f172a";

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
          <Bar dataKey="active" name="Active" stackId="1" fill="#10b981" />
          <Bar dataKey="idle" name="Idle" stackId="1" fill="#f59e0b" />
          <Bar dataKey="brk" name="Break" stackId="1" fill="#3b82f6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
