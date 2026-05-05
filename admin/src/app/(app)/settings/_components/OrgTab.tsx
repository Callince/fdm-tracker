"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export function OrgTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "settings"], queryFn: ({ signal }) => api.getSettings(signal) });
  const [idle, setIdle] = useState(5);
  const [startHour, setStartHour] = useState(4);
  const [targetHours, setTargetHours] = useState(8);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (q.data) {
      setIdle(q.data.idle_threshold_minutes);
      setStartHour(q.data.workday_start_hour);
      setTargetHours(q.data.target_hours_per_day);
    }
  }, [q.data]);

  const m = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "settings"] });
      setMsg({ tone: "ok", text: "Saved." });
    },
    onError: (e) => setMsg({ tone: "err", text: e instanceof ApiError ? e.message : "Failed" }),
  });

  return (
    <Card>
      <CardHeader>
        <div className="text-sm font-semibold">Tracking</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Applies to every user and every device.
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        <div>
          <label className="text-sm font-medium block mb-1">Idle threshold (minutes)</label>
          <Input
            type="number" min={1} max={120}
            value={idle}
            onChange={(e) => setIdle(parseInt(e.target.value || "0", 10))}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            If the OS reports no input for this many minutes, that minute is counted as idle.
          </p>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Workday start hour (local)</label>
          <Input
            type="number" min={0} max={23}
            value={startHour}
            onChange={(e) => setStartHour(parseInt(e.target.value || "0", 10))}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            A session that crosses midnight stays on the day it started, as long as it began after this hour.
          </p>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Target hours per day</label>
          <Input
            type="number" min={1} max={24}
            value={targetHours}
            onChange={(e) => setTargetHours(parseInt(e.target.value || "0", 10))}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Daily work target. The desktop app shows each user's progress against this in their "This week" and "This month" summaries.
          </p>
        </div>
        {msg && (
          <div className={`text-sm ${msg.tone === "ok" ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
            {msg.text}
          </div>
        )}
        <Button
          disabled={m.isPending}
          onClick={() => m.mutate({
            idle_threshold_minutes: idle,
            workday_start_hour: startHour,
            target_hours_per_day: targetHours,
          })}
        >
          {m.isPending ? "Saving…" : "Save"}
        </Button>
      </CardBody>
    </Card>
  );
}
