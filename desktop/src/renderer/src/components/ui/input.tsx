import { forwardRef, type InputHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      className={twMerge(
        "h-10 w-full rounded-md border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 px-3 text-sm",
        "dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500",
        "focus:outline-none focus:ring-2 focus:ring-brand/60",
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = "Input";
