"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths, endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Tabs, TabList, TabButton, TabPanel } from "@/components/ui/tabs";
import { CalendarGrid } from "@/components/CalendarGrid";
import { DayTimeline } from "@/components/DayTimeline";
import { TeamSelect } from "@/components/TeamSelect";
import { TeamBadge } from "@/components/TeamBadge";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { hms } from "@/lib/format";

const UserActivityChart = dynamic(
  () => import("@/components/UserActivityChart").then((m) => m.UserActivityChart),
  {
    ssr: false,
    loading: () => <div className="h-64 w-full rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />,
  },
);

type TabKey = "calendar" | "day" | "edit";

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const [tab, setTab] = useState<TabKey>("calendar");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [day, setDay] = useState<Date>(() => new Date());

  const userQ = useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => api.getUser(id),
  });

  const monthRange = useMemo(() => {
    const from = startOfMonth(month);
    const to = endOfMonth(month);
    return { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
  }, [month]);

  const summaryQ = useQuery({
    queryKey: ["admin", "user", id, "summary", monthRange.from, monthRange.to],
    queryFn: () => api.userDailySummary(id, monthRange.from, monthRange.to),
    enabled: !!userQ.data,
  });

  const dayQ = useQuery({
    queryKey: ["admin", "user", id, "day", format(day, "yyyy-MM-dd")],
    queryFn: () => api.userDayDetails(id, format(day, "yyyy-MM-dd")),
    enabled: !!userQ.data,
  });

  const holidaysQ = useQuery({
    queryKey: ["admin", "holidays"],
    queryFn: () => api.listHolidays(),
    staleTime: 5 * 60_000,
  });

  if (userQ.isLoading) return <div className="text-sm text-slate-500 dark:text-slate-400">Loading…</div>;
  if (!userQ.data) return <div className="text-sm text-red-600 dark:text-red-400">User not found.</div>;
  const u = userQ.data;

  const totals = summaryQ.data?.days.reduce(
    (acc, d) => ({
      a: acc.a + d.total_active_seconds,
      i: acc.i + d.total_idle_seconds,
      b: acc.b + d.total_break_seconds,
    }),
    { a: 0, i: 0, b: 0 },
  );

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        kicker={u.role === "admin" ? "Admin · User" : "Team member"}
        title={u.name}
        subtitle={`${u.email}${u.position ? ` · ${u.position}` : ""} · ${u.timezone}${!u.is_active ? " · inactive" : ""}`}
        back={
          <Link href="/users" className="inline-flex items-center gap-1 text-slate-500 hover:text-brand-dark dark:hover:text-brand-light">
            <ArrowLeft size={12} /> Back to users
          </Link>
        }
        right={
          <div className="flex items-center gap-2 self-center">
            <TeamBadge name={u.team_name} />
          </div>
        }
      />

      {/* Month totals strip — always visible */}
      {totals && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl">
          <StatCard label={`Active · ${format(month, "MMM yyyy")}`} value={hms(totals.a)} accent="active" />
          <StatCard label="Idle" value={hms(totals.i)} accent="idle" />
          <StatCard label="Break" value={hms(totals.b)} accent="brk" />
        </div>
      )}

      <Tabs value={tab} onChange={(v) => setTab(v as TabKey)}>
        <TabList>
          <TabButton value="calendar">Calendar</TabButton>
          <TabButton value="day">Day detail</TabButton>
          <TabButton value="edit">Edit</TabButton>
        </TabList>

        <TabPanel value="calendar" current={tab}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex items-center justify-between">
                <div className="text-sm font-semibold">{format(month, "MMMM yyyy")}</div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setMonth(subMonths(month, 1))}>‹</Button>
                  <Button size="sm" variant="outline" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
                  <Button size="sm" variant="outline" onClick={() => setMonth(addMonths(month, 1))}>›</Button>
                </div>
              </CardHeader>
              <CardBody>
                <CalendarGrid
                  month={month}
                  days={summaryQ.data?.days ?? []}
                  holidays={holidaysQ.data?.holidays ?? []}
                  selected={day}
                  onSelect={(d) => { setDay(d); setTab("day"); }}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <div className="text-sm font-semibold">Daily hours</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Stacked active / idle / break.</div>
              </CardHeader>
              <CardBody>
                {summaryQ.data && <UserActivityChart days={summaryQ.data.days} />}
              </CardBody>
            </Card>
          </div>
        </TabPanel>

        <TabPanel value="day" current={tab}>
          <Card>
            <CardHeader>
              <div className="text-sm font-semibold">Day detail · {format(day, "PP")}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Pick a different day from the Calendar tab.
              </div>
            </CardHeader>
            <CardBody>
              {dayQ.isLoading && <div className="text-sm text-slate-500 dark:text-slate-400">Loading…</div>}
              {dayQ.data && (
                <div className="space-y-4">
                  <DayTimeline detail={dayQ.data} />
                  <div className="grid grid-cols-3 gap-3 max-w-md text-sm">
                    <div><div className="text-slate-500 dark:text-slate-400">Active</div><div className="font-medium text-active">{hms(dayQ.data.totals.total_active_seconds)}</div></div>
                    <div><div className="text-slate-500 dark:text-slate-400">Idle</div><div className="font-medium text-idle">{hms(dayQ.data.totals.total_idle_seconds)}</div></div>
                    <div><div className="text-slate-500 dark:text-slate-400">Break</div><div className="font-medium text-brk">{hms(dayQ.data.totals.total_break_seconds)}</div></div>
                  </div>
                  {dayQ.data.sessions.length > 0 && (
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      <div className="font-semibold text-slate-700 dark:text-slate-200 mb-1">Sessions</div>
                      <ul className="space-y-0.5">
                        {dayQ.data.sessions.map((s) => (
                          <li key={s.id}>
                            {new Date(s.started_at).toLocaleTimeString()} →{" "}
                            {s.ended_at ? new Date(s.ended_at).toLocaleTimeString() : "(open)"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </TabPanel>

        <TabPanel value="edit" current={tab}>
          <EditUserForm userId={id} user={u} />
        </TabPanel>
      </Tabs>
    </div>
  );
}

/* -------- Edit form (inline, not a modal) -------------------------------- */

function EditUserForm({
  userId,
  user,
}: {
  userId: string;
  user: Awaited<ReturnType<typeof api.getUser>>;
}) {
  const qc = useQueryClient();
  const patch = useMutation({
    mutationFn: (body: Parameters<typeof api.updateUser>[1]) => api.updateUser(userId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "user", userId] });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });

  const [form, setForm] = useState({
    name: user.name,
    email: user.email,
    role: user.role,
    position: user.position ?? "",
    team_id: user.team_id,
    timezone: user.timezone,
    password: "",
    is_active: user.is_active,
  });
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function save() {
    setMsg(null);
    const body: Parameters<typeof api.updateUser>[1] = {
      name: form.name,
      email: form.email,
      role: form.role,
      position: form.position.trim() ? form.position.trim() : null,
      team_id: form.team_id,
      timezone: form.timezone,
      is_active: form.is_active,
    };
    if (form.password.trim().length >= 8) body.password = form.password;
    patch.mutate(body, {
      onSuccess: () => {
        setMsg({ tone: "ok", text: "Saved." });
        setForm((f) => ({ ...f, password: "" }));
      },
      onError: (e) => setMsg({ tone: "err", text: e instanceof ApiError ? e.message : "Failed" }),
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="text-sm font-semibold">Edit profile</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Changes propagate to the user's next request. Leave password blank to keep existing.
        </div>
      </CardHeader>
      <CardBody className="space-y-3 max-w-md">
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" />
        <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" />
        <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Position / job title" />
        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Team</label>
          <TeamSelect value={form.team_id} onChange={(id) => setForm({ ...form, team_id: id })} />
        </div>
        <select
          className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value as "user" | "admin" })}
        >
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="Timezone (IANA)" />
        <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="New password (leave blank to keep)" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          active
        </label>
        {msg && (
          <div className={`text-sm ${msg.tone === "ok" ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{msg.text}</div>
        )}
        <div>
          <Button onClick={save} disabled={patch.isPending}>
            {patch.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
