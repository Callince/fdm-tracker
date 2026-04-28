"use client";

import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

/**
 * Controlled tabs. Drop-in replacement for inline `TabButton` logic.
 * Usage:
 *   <Tabs value={tab} onChange={setTab}>
 *     <TabList>
 *       <TabButton value="org">Organization</TabButton>
 *       <TabButton value="me">My account</TabButton>
 *     </TabList>
 *     <TabPanel value="org" current={tab}>…</TabPanel>
 *     <TabPanel value="me" current={tab}>…</TabPanel>
 *   </Tabs>
 */

interface TabsProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  children: ReactNode;
  className?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic forwarding wrapper
export function Tabs<T extends string>({ value, onChange, children, className }: TabsProps<T>) {
  // Render-prop-free: child `TabButton`s read value/onChange via context clone.
  // Keep it simple: we pass value + onChange through React context.
  return (
    <TabsContext.Provider value={{ value, onChange: onChange as (v: string) => void }}>
      <div className={twMerge("space-y-5", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

import { createContext, useContext } from "react";

const TabsContext = createContext<{ value: string; onChange: (v: string) => void } | null>(null);

function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("TabButton / TabPanel must be inside <Tabs>");
  return ctx;
}

export function TabList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="tablist"
      className={twMerge(
        "inline-flex rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TabButton({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const { value: current, onChange } = useTabs();
  const active = current === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onChange(value)}
      className={twMerge(
        "px-4 py-1.5 text-sm rounded transition-colors",
        active
          ? "bg-brand text-white shadow-sm"
          : "text-slate-600 dark:text-slate-400 hover:text-brand-dark dark:hover:text-brand-light hover:bg-brand-tint dark:hover:bg-slate-800",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TabPanel({
  value,
  current,
  children,
}: {
  value: string;
  current: string;
  children: ReactNode;
}) {
  if (value !== current) return null;
  return (
    <div role="tabpanel" className="space-y-5">
      {children}
    </div>
  );
}
