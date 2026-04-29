import type { ReactNode } from "react";

interface Props {
  kicker: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  back?: ReactNode;
}

/**
 * Unified page header used by every admin route. Left side: kicker + title +
 * optional subtitle. Right side: anything (buttons, filters). Optional `back`
 * link renders above the kicker for drill-down pages.
 */
export function PageHeader({ kicker, title, subtitle, right, back }: Props) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-brand-light/40 dark:border-slate-800 bg-gradient-to-r from-brand-tint via-white to-white dark:from-[#3a1509] dark:via-slate-900 dark:to-slate-900 px-4 py-4 sm:px-6 sm:py-5">
      <span className="absolute left-0 top-0 h-full w-1 bg-brand" />
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          {back && <div className="mb-2 text-xs">{back}</div>}
          <div className="text-[11px] uppercase tracking-widest text-brand-dark/80 dark:text-brand-light">
            {kicker}
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">{subtitle}</p>
          )}
        </div>
        {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
      </div>
    </section>
  );
}
