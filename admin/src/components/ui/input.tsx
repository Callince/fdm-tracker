import { forwardRef, type InputHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      className={twMerge(
        "h-10 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 dark:focus:ring-brand/50",
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = "Input";
