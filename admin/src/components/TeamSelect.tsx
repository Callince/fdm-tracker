"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface Props {
  value: string | null;
  onChange: (teamId: string | null) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export function TeamSelect({ value, onChange, disabled, className = "", placeholder = "No team" }: Props) {
  const q = useQuery({ queryKey: ["admin", "teams"], queryFn: () => api.listTeams() });
  const teams = q.data?.teams ?? [];
  return (
    <select
      className={`h-10 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 ${className}`}
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
    >
      <option value="">{placeholder}</option>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  );
}
