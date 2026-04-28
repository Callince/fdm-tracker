import type { ReactNode } from "react";

interface Props {
  kicker: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

/**
 * Shared header container for inner pages. Same gradient + kicker treatment as
 * the Dashboard hero so Today / Calendar / Settings feel like one app.
 */
export function PageHeader({ kicker, title, subtitle, right }: Props) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-brand-light/40 bg-gradient-to-br from-brand-tint via-white to-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 dark:border-slate-800 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-brand-dark/80 dark:text-brand-light">
            {kicker}
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        {right}
      </div>
    </section>
  );
}
