"use client";

import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

interface Option<T extends string> {
  value: T;
  label: ReactNode;
}

interface Props<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  className?: string;
}

export function Segmented<T extends string>({ value, onChange, options, className }: Props<T>) {
  return (
    <div
      role="tablist"
      className={twMerge(
        "inline-flex rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              active
                ? "bg-brand text-white"
                : "text-slate-600 dark:text-slate-400 hover:bg-brand-tint dark:hover:bg-slate-800 hover:text-brand-dark dark:hover:text-brand-light"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
