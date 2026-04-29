"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { Plus, Trash2, ExternalLink } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { extractUrl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { PageHeader } from "@/components/PageHeader";
import { UserPickerPanel } from "@/components/UserPickerPanel";
import type { Meeting } from "@/lib/types";

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";

export default function MeetingsPage() {
  const qc = useQueryClient();
  const meetingsQ = useQuery({
    queryKey: ["admin", "meetings"],
    queryFn: () => api.listMeetings(),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    meeting_link: "",
    scheduled_date: format(new Date(), "yyyy-MM-dd"),
    scheduled_time: "10:00",
    duration_minutes: 30,
    user_ids: [] as string[],
  });
  const [err, setErr] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Meeting | null>(null);

  const createM = useMutation({
    mutationFn: api.createMeeting,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "meetings"] });
      setOpen(false);
      setForm({
        title: "", meeting_link: "",
        scheduled_date: format(new Date(), "yyyy-MM-dd"),
        scheduled_time: "10:00", duration_minutes: 30, user_ids: [],
      });
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : "Failed"),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => api.deleteMeeting(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "meetings"] });
      setToDelete(null);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!form.title.trim()) {
      setErr("Title required");
      return;
    }
    // Combine local date+time and let JS produce ISO with offset; backend stores UTC.
    const local = new Date(`${form.scheduled_date}T${form.scheduled_time}:00`);
    if (isNaN(local.getTime())) {
      setErr("Invalid date/time");
      return;
    }
    // Keep a 1-min slack so the user can submit at the exact minute they chose.
    if (local.getTime() < Date.now() - 60_000) {
      setErr("Pick the current time or a later one — past meetings can't be scheduled.");
      return;
    }
    createM.mutate({
      title: form.title.trim(),
      meeting_link: form.meeting_link.trim() || null,
      scheduled_at: local.toISOString(),
      duration_minutes: form.duration_minutes,
      user_ids: form.user_ids,
    });
  }

  const meetings = meetingsQ.data?.meetings ?? [];

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        kicker="Workspace"
        title="Meetings"
        subtitle="Schedule meetings and the desktop app will notify the right people."
        right={
          <Button onClick={() => setOpen(true)}>
            <Plus size={14} className="mr-1" /> New meeting
          </Button>
        }
      />

      <Card>
        <CardBody className="p-0">
          {meetingsQ.isLoading && <TableSkeleton cols={5} rows={4} />}
          {!meetingsQ.isLoading && meetings.length === 0 && (
            <EmptyState
              title="No meetings scheduled"
              description="Use the “New meeting” button to schedule one. The desktop app will notify the audience automatically."
            />
          )}
          {meetings.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/60 border-y border-slate-200 dark:border-slate-800">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-2 font-medium">When</th>
                    <th className="px-4 py-2 font-medium">Title</th>
                    <th className="px-4 py-2 font-medium">Audience</th>
                    <th className="px-4 py-2 font-medium">Duration</th>
                    <th className="px-4 py-2 font-medium">Link</th>
                    <th className="px-4 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {meetings.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-brand-tint/30 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-4 py-3 tabular-nums text-slate-700 dark:text-slate-300">
                        {formatInTimeZone(parseISO(m.scheduled_at), TZ, "yyyy-MM-dd HH:mm")}
                      </td>
                      <td className="px-4 py-3 font-medium">{m.title}</td>
                      <td className="px-4 py-3">
                        {m.attendees.length === 0 ? (
                          <span className="text-xs text-slate-500">All users</span>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-[260px]">
                            {m.attendees.slice(0, 3).map((a) => (
                              <span key={a.id} className="text-[11px] rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5">
                                {a.name}
                              </span>
                            ))}
                            {m.attendees.length > 3 && (
                              <span className="text-[11px] text-slate-500">
                                +{m.attendees.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{m.duration_minutes} min</td>
                      <td className="px-4 py-3">
                        {(() => {
                          const url = extractUrl(m.meeting_link);
                          if (!url) return <span className="text-slate-400">—</span>;
                          return (
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand-dark dark:text-brand-light inline-flex items-center gap-1 hover:underline"
                            >
                              join <ExternalLink size={12} />
                            </a>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setToDelete(m)}
                          className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Create modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Schedule a meeting"
        subtitle={`Time is interpreted in your browser's timezone (${TZ}).`}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={(e) => submit(e as unknown as FormEvent)} disabled={createM.isPending}>
              {createM.isPending ? "Scheduling…" : "Schedule"}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          <Input placeholder="Title (e.g. Sprint planning)" value={form.title}
                 onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Date</label>
              <Input
                type="date"
                value={form.scheduled_date}
                min={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Time</label>
              <Input
                type="time"
                value={form.scheduled_time}
                min={
                  form.scheduled_date === format(new Date(), "yyyy-MM-dd")
                    ? format(new Date(), "HH:mm")
                    : undefined
                }
                onChange={(e) => setForm({ ...form, scheduled_time: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Duration (minutes)</label>
            <Input type="number" min={1} max={1440} value={form.duration_minutes}
                   onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} />
          </div>
          <Input placeholder="Meeting link (optional — Meet, Zoom, …)" value={form.meeting_link}
                 onChange={(e) => setForm({ ...form, meeting_link: e.target.value })} />
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <label className="text-xs text-slate-500 dark:text-slate-400">Audience</label>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                Empty = broadcast to all users
              </span>
            </div>
            <UserPickerPanel
              value={form.user_ids}
              onChange={(ids) => setForm({ ...form, user_ids: ids })}
            />
          </div>
          {err && <div className="text-sm text-red-600 dark:text-red-400">{err}</div>}
          <button type="submit" className="hidden" />
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteM.mutate(toDelete.id)}
        title={toDelete ? `Delete "${toDelete.title}"?` : ""}
        description="The meeting will be removed and no further notifications will fire."
        confirmLabel="Delete meeting"
        tone="danger"
        busy={deleteM.isPending}
      />
    </div>
  );
}
