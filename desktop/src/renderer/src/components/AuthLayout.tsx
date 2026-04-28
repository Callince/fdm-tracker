import type { ReactNode } from "react";

interface Props {
  heading: string;
  subheading?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({ heading, subheading, children, footer }: Props) {
  return (
    <div className="h-screen flex overflow-hidden">
      {/* Brand panel (hidden on narrow windows). Logo sits on a white card
          for contrast against the brand gradient. */}
      <div className="hidden md:flex w-[40%] min-w-[320px] bg-gradient-to-br from-brand to-brand-dark text-white flex-col justify-between p-8">
        <div>
          <div className="inline-block bg-white rounded-md shadow px-3 py-2">
            <img
              src="./4d-logo.webp"
              alt="Fourth Dimension"
              className="h-8 w-auto block select-none"
              draggable={false}
            />
          </div>
        </div>
        <div>
          <div className="text-3xl font-semibold leading-tight">FDM Tracker</div>
          <p className="text-sm text-white/80 mt-3 max-w-sm">
            An internal time tracker for Fourth Dimension. Count active hours, log breaks,
            and keep your day visible to the team.
          </p>
        </div>
        <div className="text-xs text-white/60">
          © Fourth Dimension Media Solutions
        </div>
      </div>

      {/* Form column — follows dark mode. */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-auto bg-slate-50 dark:bg-slate-950">
        <div className="w-full max-w-sm">
          <div className="md:hidden mb-6">
            <img src="./4d-logo.webp" alt="Fourth Dimension" className="h-8 w-auto" />
          </div>
          <div className="mb-6">
            <div className="text-[11px] uppercase tracking-widest text-brand-dark/80 dark:text-brand-light">
              FDM Tracker
            </div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">{heading}</h1>
            {subheading && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subheading}</p>
            )}
          </div>
          {children}
          {footer && (
            <div className="mt-4 text-xs text-slate-500 dark:text-slate-400 text-center">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
