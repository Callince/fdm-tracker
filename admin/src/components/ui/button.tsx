import { forwardRef, type ButtonHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "danger" | "brand";
  size?: "sm" | "md";
}

const base =
  "inline-flex items-center justify-center font-medium rounded-md transition-colors disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-brand/60 dark:focus:ring-offset-slate-900";

const variants = {
  default: "bg-brand text-white hover:bg-brand-dark",
  brand: "bg-brand text-white hover:bg-brand-dark",
  outline:
    "border border-slate-300 text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800",
  ghost:
    "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

const sizes = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm" };

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = "default", size = "md", ...rest }, ref) => (
    <button ref={ref} className={twMerge(base, variants[variant], sizes[size], className)} {...rest} />
  ),
);
Button.displayName = "Button";
