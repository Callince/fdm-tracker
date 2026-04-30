"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { twMerge } from "tailwind-merge";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  size?: "sm" | "md" | "lg";
  footer?: ReactNode;
  children: ReactNode;
  /** Hide the X button (still closes via backdrop / ESC). */
  hideCloseButton?: boolean;
  /** Extra className on the inner card. */
  className?: string;
}

const SIZE = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = "md",
  footer,
  children,
  hideCloseButton,
  className,
}: Props) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    // Remember the trigger so we can restore focus on close.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    function focusables(): HTMLElement[] {
      const root = ref.current;
      if (!root) return [];
      return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("aria-hidden"),
      );
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !ref.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    // Focus the first input so users can type immediately. Prefer text inputs
    // over buttons so focus doesn't land on the close (X) button.
    const t = setTimeout(() => {
      const root = ref.current;
      if (!root) return;
      const preferred = root.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select',
      );
      (preferred ?? focusables()[0])?.focus();
    }, 20);

    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
      // Restore focus to whatever opened the modal — important for keyboard users.
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/70 backdrop-blur-[1px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={twMerge(
          "w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)]",
          SIZE[size],
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="shrink-0 flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div id={titleId} className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {title}
              </div>
              {subtitle && (
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</div>
              )}
            </div>
            {!hideCloseButton && (
              <button
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}
        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">{children}</div>
        {footer && (
          <div className="shrink-0 px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
