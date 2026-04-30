/**
 * Lightweight skeleton placeholders for loading states. Pulses gently so
 * the user knows content is on the way without jumping when it arrives.
 */
import type { HTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={twMerge(
        "animate-pulse rounded bg-slate-200 dark:bg-slate-800",
        className,
      )}
      {...rest}
    />
  );
}

/** Three-line text skeleton — for lists / rows */
export function SkeletonText({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === rows - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

/** A row of skeleton cells — for tables / weekly stats */
export function SkeletonRow({ cells = 5 }: { cells?: number }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: cells }).map((_, i) => (
        <Skeleton key={i} className="h-8 flex-1" />
      ))}
    </div>
  );
}

/** Whole-page placeholder, vertical pulse blocks */
export function SkeletonPanel() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-20 w-full" />
      <SkeletonRow />
    </div>
  );
}
