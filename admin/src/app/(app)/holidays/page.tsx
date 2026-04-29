"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addMonths,
  endOfMonth,
  format,
  isSameDay,
  parseISO,
  startOfMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/PageHeader";
import type { Holiday, HolidayKind } from "@/lib/types";

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function HolidaysPage() {
  const qc = useQueryClient();
  const holQ = useQuery({
    queryKey: ["admin", "holidays"],
    queryFn: () => api.listHolidays(),
  });

  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [editing, setEditing] = useState<{ date: string; existing: Holiday | null } | null>(null);
  const [editName, setEditName] = useState("");
  const [editKind, setEditKind] = useState<HolidayKind>("holiday");
  const [err, setErr] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Holiday | null>(null);

  const createM = useMutation({
    mutationFn: api.createHoliday,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "holidays"] });
      setEditing(null);
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : "Failed"),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => api.deleteHoliday(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "holidays"] });
      setToDelete(null);
      setEditing(null);
    },
  });

  const holidays = holQ.data?.holidays ?? [];
  const holidayByDate = useMemo(() => {
    const m = new Map<string, Holiday>();
    for (const h of holidays) m.set(h.date, h);
    return m;
  }, [holidays]);

  const weeks = useMemo(() => buildMonthGrid(cursor), [cursor]);

  function openEditor(date: Date) {
    const key = format(date, "yyyy-MM-dd");
    const existing = holidayByDate.get(key) ?? null;
    setEditing({ date: key, existing });
    setEditName(existing?.name ?? defaultNameFor(date, existing));
    setEditKind(existing?.kind ?? (isWeekend(date) ? "working" : "holiday"));
    setErr(null);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!editing) return;
    if (!editName.trim()) {
      setErr("Name required");
      return;
    }
    // If an existing entry exists, delete first then create — backend is
    // create-only (no PATCH on holidays).
    const doCreate = () =>
      createM.mutate({ date: editing.date, name: editName.trim(), kind: editKind });
    if (editing.existing) {
      deleteM.mutate(editing.existing.id, {
        onSuccess: () => doCreate(),
        onError: (e) => setErr(e instanceof ApiError ? e.message : "Failed"),
      });
    } else {
      doCreate();
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        kicker="Workspace"
        title="Holidays"
        subtitle="Saturday and Sunday are non-working by default. Click any date to mark a holiday or override Sat/Sun as a working day."
      />

      <Card>
        <CardBody>
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setCursor((c) => addMonths(c, -1))}
              className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="text-lg font-semibold tabular-nums">
              {format(cursor, "MMMM yyyy")}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCursor(startOfMonth(new Date()))}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-brand-dark dark:hover:text-brand-light"
              >
                Today
              </button>
              <button
                onClick={() => setCursor((c) => addMonths(c, 1))}
                className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Next month"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAY_HEADERS.map((h, i) => (
              <div
                key={h}
                className={`text-[10px] uppercase tracking-wider text-center py-1 ${
                  i >= 5 ? "text-slate-400 dark:text-slate-500" : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {h}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {weeks.flat().map((day) => {
              const inMonth = day.getMonth() === cursor.getMonth();
              const key = format(day, "yyyy-MM-dd");
              const holiday = holidayByDate.get(key);
              const weekend = isWeekend(day);
              const today = isSameDay(day, new Date());

              const nonWorking =
                holiday?.kind === "holiday" || (weekend && holiday?.kind !== "working");

              return (
                <button
                  key={key}
                  onClick={() => openEditor(day)}
                  className={`relative h-14 sm:h-20 rounded-md border text-left p-1 sm:p-2 transition-colors ${
                    !inMonth ? "opacity-40" : ""
                  } ${
                    today ? "ring-2 ring-brand/60" : ""
                  } ${
                    nonWorking
                      ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/50 hover:bg-red-100 dark:hover:bg-red-900/30"
                      : holiday?.kind === "working"
                      ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <div
                      className={`text-xs sm:text-sm font-medium ${
                        nonWorking
                          ? "text-red-700 dark:text-red-300"
                          : holiday?.kind === "working"
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {day.getDate()}
                    </div>
                    {weekend && !holiday && (
                      <span className="hidden sm:inline text-[9px] uppercase tracking-wide text-slate-400">
                        weekend
                      </span>
                    )}
                  </div>
                  {holiday && (
                    <div
                      className={`mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] leading-tight line-clamp-2 ${
                        holiday.kind === "holiday"
                          ? "text-red-700/80 dark:text-red-300/80"
                          : "text-emerald-700/80 dark:text-emerald-300/80"
                      }`}
                    >
                      {holiday.kind === "working" && "↻ "}
                      {holiday.name}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-slate-500 dark:text-slate-400">
            <Legend swatch="bg-red-100 border-red-200" label="Holiday (non-working)" />
            <Legend swatch="bg-slate-50 border-slate-200" label="Sat/Sun (auto non-working)" />
            <Legend swatch="bg-emerald-100 border-emerald-200" label="Working exception" />
          </div>
        </CardBody>
      </Card>

      {/* Edit modal */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={
          editing
            ? `${editing.existing ? "Edit" : "Mark"} ${format(parseISO(editing.date), "EEEE, MMM d, yyyy")}`
            : ""
        }
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            {editing?.existing && (
              <Button
                variant="outline"
                onClick={() => editing.existing && setToDelete(editing.existing)}
              >
                <Trash2 size={14} className="mr-1" /> Remove
              </Button>
            )}
            <Button onClick={(e) => submit(e as unknown as FormEvent)} disabled={createM.isPending || deleteM.isPending}>
              {createM.isPending || deleteM.isPending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        {editing && (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEditKind("holiday")}
                  className={`rounded-md border px-3 py-2 text-sm text-left transition-colors ${
                    editKind === "holiday"
                      ? "border-brand bg-brand-tint dark:bg-[#3a1509]/60 text-brand-dark dark:text-brand-light"
                      : "border-slate-300 dark:border-slate-700 hover:border-brand/50"
                  }`}
                >
                  <div className="font-medium">Holiday</div>
                  <div className="text-[11px] text-slate-500">Non-working day</div>
                </button>
                <button
                  type="button"
                  onClick={() => setEditKind("working")}
                  className={`rounded-md border px-3 py-2 text-sm text-left transition-colors ${
                    editKind === "working"
                      ? "border-brand bg-brand-tint dark:bg-[#3a1509]/60 text-brand-dark dark:text-brand-light"
                      : "border-slate-300 dark:border-slate-700 hover:border-brand/50"
                  }`}
                >
                  <div className="font-medium">Working day</div>
                  <div className="text-[11px] text-slate-500">Override Sat/Sun → working</div>
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Name</label>
              <Input
                placeholder={
                  editKind === "holiday" ? "e.g. Republic Day" : "e.g. Working Saturday"
                }
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                autoFocus
              />
            </div>
            {err && <div className="text-sm text-red-600">{err}</div>}
            <button type="submit" className="hidden" />
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteM.mutate(toDelete.id)}
        title={toDelete ? `Delete "${toDelete.name}"?` : ""}
        description="This date will revert to its default behavior — Mon-Fri working, Sat/Sun off."
        confirmLabel="Delete"
        tone="danger"
        busy={deleteM.isPending}
      />
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded border ${swatch}`} />
      <span>{label}</span>
    </span>
  );
}

function isWeekend(d: Date): boolean {
  const w = d.getDay();
  return w === 0 || w === 6;
}

function defaultNameFor(d: Date, existing: Holiday | null): string {
  if (existing) return existing.name;
  if (isWeekend(d)) return "Working Saturday";
  return "";
}

function buildMonthGrid(monthStart: Date): Date[][] {
  const monthEnd = endOfMonth(monthStart);
  // Start grid on Monday (Indian common convention).
  const start = new Date(monthStart);
  const startDow = (start.getDay() + 6) % 7; // Mon=0
  start.setDate(start.getDate() - startDow);
  const end = new Date(monthEnd);
  const endDow = (end.getDay() + 6) % 7;
  end.setDate(end.getDate() + (6 - endDow));

  const weeks: Date[][] = [];
  let cur = new Date(start);
  while (cur <= end) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}
