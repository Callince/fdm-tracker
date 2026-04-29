"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/PageHeader";
import type { Holiday } from "@/lib/types";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function HolidaysPage() {
  const qc = useQueryClient();
  const holQ = useQuery({
    queryKey: ["admin", "holidays"],
    queryFn: () => api.listHolidays(),
  });

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Holiday | null>(null);

  const createM = useMutation({
    mutationFn: api.createHoliday,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "holidays"] });
      setOpen(false);
      setName("");
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : "Failed"),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => api.deleteHoliday(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "holidays"] });
      setToDelete(null);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) {
      setErr("Holiday name required");
      return;
    }
    createM.mutate({ date, name: name.trim() });
  }

  const holidays = holQ.data?.holidays ?? [];

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        kicker="Workspace"
        title="Holidays"
        subtitle="Government / non-working days. These are excluded from monthly target hours alongside Sat/Sun."
        right={
          <Button onClick={() => setOpen(true)}>
            <Plus size={14} className="mr-1" /> New holiday
          </Button>
        }
      />

      <Card>
        <CardBody className="p-0">
          {holQ.isLoading && <div className="p-6 text-sm text-slate-500">Loading…</div>}
          {!holQ.isLoading && holidays.length === 0 && (
            <EmptyState
              title="No holidays set"
              description="Add Republic Day, Independence Day, etc. — every Mon-Fri holiday counts as a non-working day in target calculations."
            />
          )}
          {holidays.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-y border-slate-200 dark:border-slate-800">
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Day</th>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {holidays.map((h) => {
                  const d = parseISO(h.date);
                  return (
                    <tr key={h.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                      <td className="px-4 py-3 tabular-nums">{h.date}</td>
                      <td className="px-4 py-3 text-slate-500">{WEEKDAY[d.getDay()]}</td>
                      <td className="px-4 py-3 font-medium">{h.name}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setToDelete(h)}
                          className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add holiday"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={(e) => submit(e as unknown as FormEvent)} disabled={createM.isPending || !name.trim()}>
              {createM.isPending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <Input placeholder="Holiday name (e.g. Republic Day)" value={name}
                 onChange={(e) => setName(e.target.value)} required />
          {err && <div className="text-sm text-red-600">{err}</div>}
          <button type="submit" className="hidden" />
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteM.mutate(toDelete.id)}
        title={toDelete ? `Delete "${toDelete.name}"?` : ""}
        description="This date will count as a working day again in target calculations."
        confirmLabel="Delete"
        tone="danger"
        busy={deleteM.isPending}
      />
    </div>
  );
}
