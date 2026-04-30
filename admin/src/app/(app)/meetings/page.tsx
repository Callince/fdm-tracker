"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
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

const EMPTY_FORM = () => ({
  title: "",
  meeting_link: "",
  meeting_password: "",
  scheduled_date: format(new Date(), "yyyy-MM-dd"),
  scheduled_time: "10:00",
  duration_minutes: 30,
  user_ids: [] as string[],
});

/** Accept either a full http(s) URL or a recognizable meeting code and
 * normalize to a URL. Returns null on empty input. */
function normalizeMeetingLink(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  // Already a URL — let the backend strip surrounding text if any.
  if (/https?:\/\//i.test(s)) return s;
  // Google Meet code: abc-defg-hij  (letters only, three dash-separated groups).
  if (/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(s)) {
    return `https://meet.google.com/${s.toLowerCase()}`;
  }
  // Zoom: 9–11 digit meeting ID.
  if (/^\d{9,11}$/.test(s.replace(/[\s-]/g, ""))) {
    return `https://zoom.us/j/${s.replace(/[\s-]/g, "")}`;
  }
  // Otherwise hand it to the backend — it'll either accept it or reject.
  return s;
}

export default function MeetingsPage() {
  const qc = useQueryClient();
  const meetingsQ = useQuery({
    queryKey: ["admin", "meetings"],
    queryFn: () => api.listMeetings(),
  });

  // null editing = create mode; otherwise pre-fill for edit
  const [editing, setEditing] = useState<Meeting | null | undefined>(undefined);
  const [form, setForm] = useState(EMPTY_FORM());
  const [err, setErr] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Meeting | null>(null);

  const open = editing !== undefined;

  function closeModal() {
    setEditing(undefined);
    setForm(EMPTY_FORM());
    setErr(null);
  }

  function openCreate() {
    setForm(EMPTY_FORM());
    setEditing(null);
    setErr(null);
  }

  function openEdit(m: Meeting) {
    const local = parseISO(m.scheduled_at);
    setForm({
      title: m.title,
      meeting_link: m.meeting_link ?? "",
      meeting_password: m.meeting_password ?? "",
      scheduled_date: formatInTimeZone(local, TZ, "yyyy-MM-dd"),
      scheduled_time: formatInTimeZone(local, TZ, "HH:mm"),
      duration_minutes: m.duration_minutes,
      user_ids: m.attendees.map((a) => a.id),
    });
    setEditing(m);
    setErr(null);
  }

  const createM = useMutation({
    mutationFn: api.createMeeting,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "meetings"] });
      closeModal();
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : "Failed"),
  });

  const updateM = useMutation({
    mutationFn: (body: { id: string; data: Parameters<typeof api.updateMeeting>[1] }) =>
      api.updateMeeting(body.id, body.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "meetings"] });
      closeModal();
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
    const local = new Date(`${form.scheduled_date}T${form.scheduled_time}:00`);
    if (isNaN(local.getTime())) {
      setErr("Invalid date/time");
      return;
    }
    if (local.getTime() < Date.now() - 60_000) {
      setErr("Pick the current time or a later one — past meetings can't be scheduled.");
      return;
    }
    const payload = {
      title: form.title.trim(),
      meeting_link: normalizeMeetingLink(form.meeting_link),
      meeting_password: form.meeting_password.trim() || null,
      scheduled_at: local.toISOString(),
      duration_minutes: form.duration_minutes,
      user_ids: form.user_ids,
    };
    if (editing) {
      updateM.mutate({ id: editing.id, data: payload });
    } else {
      createM.mutate(payload);
    }
  }

  const meetings = meetingsQ.data?.meetings ?? [];
  const busy = createM.isPending || updateM.isPending;

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        kicker="Workspace"
        title="Meetings"
        subtitle="Schedule meetings and the desktop app will notify the right people."
        right={
          <Button onClick={openCreate}>
            <Plus size={14} className="mr-1" /> New meeting
          </Button>
        }
      />

      <Card>
        <CardBody className="p-0">
          {meetingsQ.isLoading && <TableSkeleton cols={6} rows={4} />}
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
                            <div className="space-y-0.5">
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-brand-dark dark:text-brand-light inline-flex items-center gap-1 hover:underline"
                              >
                                join <ExternalLink size={12} />
                              </a>
                              {m.meeting_password && (
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                  pwd: {m.meeting_password}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <button
                            onClick={() => openEdit(m)}
                            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                            title="Edit"
                            aria-label="Edit meeting"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setToDelete(m)}
                            className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"
                            title="Delete"
                            aria-label="Delete meeting"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Create / edit modal */}
      <Modal
        open={open}
        onClose={closeModal}
        title={editing ? "Edit meeting" : "Schedule a meeting"}
        subtitle={`Time is interpreted in your browser's timezone (${TZ}).`}
        size="lg"
        footer={
          <>
            <Button variant="outline" type="button" onClick={closeModal}>Cancel</Button>
            <Button type="submit" form="meeting-form" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save changes" : "Schedule"}
            </Button>
          </>
        }
      >
        <form id="meeting-form" onSubmit={submit} className="space-y-3">
          <Input placeholder="Title (e.g. Sprint planning)" value={form.title}
                 onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Date</label>
              <Input
                type="date"
                value={form.scheduled_date}
                min={editing ? undefined : format(new Date(), "yyyy-MM-dd")}
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
                  !editing && form.scheduled_date === format(new Date(), "yyyy-MM-dd")
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
          <div>
            <label className="text-xs text-slate-500 block mb-1">Meeting link</label>
            <Input
              placeholder="https://meet.google.com/abc-defg-hij  OR  abc-defg-hij"
              value={form.meeting_link}
              onChange={(e) => setForm({ ...form, meeting_link: e.target.value })}
            />
            <div className="mt-1 text-[11px] text-slate-400">
              Paste a full URL or just a Google Meet code (e.g. <code className="font-mono">abc-defg-hij</code>)
              or a Zoom meeting ID — we'll build the URL for you.
            </div>
            {form.meeting_link && (() => {
              const norm = normalizeMeetingLink(form.meeting_link);
              if (norm && norm !== form.meeting_link.trim()) {
                return (
                  <div className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 truncate">
                    → will save as <span className="font-mono">{norm}</span>
                  </div>
                );
              }
              return null;
            })()}
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Meeting password (optional)</label>
            <Input
              placeholder="e.g. 123456"
              value={form.meeting_password}
              onChange={(e) => setForm({ ...form, meeting_password: e.target.value })}
              maxLength={128}
            />
            <div className="mt-1 text-[11px] text-slate-400">
              For Zoom passcodes or any other gated meetings. Shown to attendees on the desktop and admin pages.
            </div>
          </div>
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
