"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AdminUserRow } from "@/lib/types";

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}

export function UserMultiSelect({ value, onChange, placeholder = "All users (no one selected = broadcast)" }: Props) {
  const usersQ = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.listUsers(),
  });
  const all: AdminUserRow[] = usersQ.data?.users ?? [];

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClickAway(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const selected = useMemo(
    () => all.filter((u) => value.includes(u.id)),
    [all, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.position ?? "").toLowerCase().includes(q) ||
        (u.team_name ?? "").toLowerCase().includes(q),
    );
  }, [all, query]);

  function toggle(id: string) {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left h-auto min-h-10 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60"
      >
        <div className="flex items-center gap-2 px-3 py-1.5">
          {selected.length === 0 ? (
            <span className="text-slate-400 dark:text-slate-500 truncate flex-1">{placeholder}</span>
          ) : (
            <div className="flex flex-wrap gap-1 flex-1">
              {selected.map((u) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-tint dark:bg-[#3a1509]/60 text-brand-dark dark:text-brand-light px-2 py-0.5 text-xs"
                >
                  {u.name}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${u.name}`}
                    className="hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); toggle(u.id); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        toggle(u.id);
                      }
                    }}
                  >
                    <X size={11} />
                  </span>
                </span>
              ))}
            </div>
          )}
          <ChevronDown size={14} className="text-slate-400 shrink-0" />
        </div>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
          <div className="relative border-b border-slate-100 dark:border-slate-800">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email, position or team…"
              className="w-full h-10 pl-9 pr-3 bg-transparent text-sm outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {usersQ.isLoading && <div className="p-3 text-sm text-slate-500">Loading…</div>}
            {!usersQ.isLoading && filtered.length === 0 && (
              <div className="p-3 text-sm text-slate-500">No people match.</div>
            )}
            {filtered.map((u) => {
              const checked = value.includes(u.id);
              return (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => toggle(u.id)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-3 hover:bg-brand-tint/40 dark:hover:bg-slate-800 ${
                    checked ? "bg-brand-tint/30 dark:bg-[#3a1509]/40" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    className="accent-brand"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate flex items-center gap-2">
                      {u.name}
                      {u.role === "admin" && (
                        <span className="text-[10px] uppercase tracking-wider text-brand-dark dark:text-brand-light">
                          admin
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {u.email}
                      {u.team_name ? ` · ${u.team_name}` : ""}
                      {u.position ? ` · ${u.position}` : ""}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-2 flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{selected.length} selected</span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="hover:text-red-600 dark:hover:text-red-400"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
