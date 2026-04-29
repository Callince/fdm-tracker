"use client";

import { useMemo, useState } from "react";
import { CheckSquare, Search, Square, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AdminUserRow } from "@/lib/types";

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  emptyHint?: string;
}

export function UserPickerPanel({ value, onChange, emptyHint = "No one picked yet — meeting will broadcast to all users." }: Props) {
  const usersQ = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.listUsers(),
  });
  const all: AdminUserRow[] = usersQ.data?.users ?? [];

  const [query, setQuery] = useState("");

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

  const allFilteredIds = filtered.map((u) => u.id);
  const allFilteredSelected =
    allFilteredIds.length > 0 && allFilteredIds.every((id) => value.includes(id));

  function toggleAllFiltered() {
    if (allFilteredSelected) {
      onChange(value.filter((v) => !allFilteredIds.includes(v)));
    } else {
      const merged = new Set(value);
      for (const id of allFilteredIds) merged.add(id);
      onChange(Array.from(merged));
    }
  }

  return (
    <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      {/* Selected chips */}
      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 flex items-center gap-2 min-h-[40px]">
        {selected.length === 0 ? (
          <span className="text-xs text-slate-500 dark:text-slate-400">{emptyHint}</span>
        ) : (
          <div className="flex flex-wrap gap-1 flex-1">
            {selected.map((u) => (
              <button
                type="button"
                key={u.id}
                onClick={() => toggle(u.id)}
                className="inline-flex items-center gap-1 rounded-full bg-brand-tint dark:bg-[#3a1509]/60 text-brand-dark dark:text-brand-light px-2 py-0.5 text-xs hover:bg-brand-tint/80 dark:hover:bg-[#3a1509]/80"
              >
                {u.name}
                <X size={11} />
              </button>
            ))}
          </div>
        )}
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400"
          >
            Clear
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative border-b border-slate-100 dark:border-slate-800">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, position or team…"
          className="w-full h-10 pl-9 pr-3 bg-transparent text-sm outline-none text-slate-900 dark:text-slate-100"
        />
      </div>

      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>
          {filtered.length} {filtered.length === 1 ? "person" : "people"}
          {query && ` matching "${query}"`}
        </span>
        {filtered.length > 0 && (
          <button
            type="button"
            onClick={toggleAllFiltered}
            className="hover:text-brand-dark dark:hover:text-brand-light inline-flex items-center gap-1"
          >
            {allFilteredSelected
              ? <><CheckSquare size={12} /> Deselect all</>
              : <><Square size={12} /> Select all</>}
          </button>
        )}
      </div>

      {/* List */}
      <div className="max-h-56 overflow-y-auto">
        {usersQ.isLoading && <div className="p-3 text-sm text-slate-500">Loading…</div>}
        {!usersQ.isLoading && filtered.length === 0 && (
          <div className="p-4 text-sm text-slate-500 text-center">No people match.</div>
        )}
        {filtered.map((u) => {
          const checked = value.includes(u.id);
          return (
            <button
              type="button"
              key={u.id}
              onClick={() => toggle(u.id)}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-3 hover:bg-brand-tint/40 dark:hover:bg-slate-800 border-b border-slate-50 dark:border-slate-800/60 last:border-0 ${
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
    </div>
  );
}
