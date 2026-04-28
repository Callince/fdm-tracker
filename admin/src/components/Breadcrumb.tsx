"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  users: "People",
  teams: "Teams",
  reports: "Reports",
  settings: "Settings",
};

interface Props {
  /** Override the label for a path segment (e.g. a dynamic `[id]`). */
  labelOverride?: Record<string, string>;
}

export function Breadcrumb({ labelOverride }: Props) {
  const path = usePathname() ?? "";
  const parts = path.split("/").filter(Boolean);

  if (parts.length === 0) return null;

  const crumbs = parts.map((part, i) => {
    const href = "/" + parts.slice(0, i + 1).join("/");
    const label =
      labelOverride?.[part] ??
      SEGMENT_LABELS[part] ??
      (part.length > 12 ? "…" : part);
    return { href, label, isLast: i === parts.length - 1 };
  });

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
      {crumbs.map((c, i) => (
        <Fragment key={c.href}>
          {i > 0 && <span className="text-slate-300 dark:text-slate-500">/</span>}
          {c.isLast ? (
            <span className="text-slate-900 dark:text-slate-100 font-medium truncate max-w-[12rem]">
              {c.label}
            </span>
          ) : (
            <Link
              href={c.href}
              className="text-slate-500 dark:text-slate-400 hover:text-brand-dark dark:hover:text-brand-light truncate max-w-[10rem]"
            >
              {c.label}
            </Link>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
