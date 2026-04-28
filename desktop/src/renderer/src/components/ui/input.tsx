import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { twMerge } from "tailwind-merge";

const baseClass = twMerge(
  "h-10 w-full rounded-md border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 px-3 text-sm",
  "dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500",
  "focus:outline-none focus:ring-2 focus:ring-brand/60",
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...rest }, ref) => {
    const [reveal, setReveal] = useState(false);
    if (type === "password") {
      const effective = reveal ? "text" : "password";
      return (
        <div className="relative w-full">
          <input
            ref={ref}
            type={effective}
            className={twMerge(baseClass, "pr-10", className)}
            {...rest}
          />
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            tabIndex={-1}
            aria-label={reveal ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      );
    }
    return (
      <input
        ref={ref}
        type={type}
        className={twMerge(baseClass, className)}
        {...rest}
      />
    );
  },
);
Input.displayName = "Input";
