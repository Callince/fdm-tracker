import { type HTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={twMerge(
        "rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-none",
        className,
      )}
      {...rest}
    />
  );
}
export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={twMerge("px-5 py-4 border-b border-slate-100 dark:border-slate-800", className)}
      {...rest}
    />
  );
}
export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={twMerge("px-5 py-4", className)} {...rest} />;
}
