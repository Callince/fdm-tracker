"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  Settings,
  Users,
  Video,
  X,
} from "lucide-react";

interface Item {
  href: string;
  label: string;
  icon: typeof Activity;
}

interface Section {
  label: string;
  items: Item[];
}

const SECTIONS: Section[] = [
  { label: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: Activity }] },
  {
    label: "Manage",
    items: [
      { href: "/users", label: "People", icon: Users },
      { href: "/meetings", label: "Meetings", icon: Video },
      { href: "/holidays", label: "Holidays", icon: CalendarDays },
    ],
  },
  { label: "Insights", items: [{ href: "/reports", label: "Reports", icon: FileText }] },
  { label: "Admin", items: [{ href: "/settings", label: "Settings", icon: Settings }] },
];

const COLLAPSE_KEY = "fdm.admin.nav";

interface Props {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function SideNav({ mobileOpen, onMobileClose }: Props) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  }

  // The mobile drawer always shows the expanded layout. The desktop rail
  // honors the user's collapse preference.
  const layoutCollapsed = collapsed;

  return (
    <>
      {/* Backdrop — visible only when the mobile drawer is open. */}
      <div
        className={`md:hidden fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-[1px] transition-opacity ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onMobileClose}
        aria-hidden
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 md:static md:z-auto md:translate-x-0 transition-transform duration-200
          ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          ${layoutCollapsed ? "md:w-14" : "md:w-56"}
          w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-screen`}
      >
        {/* Skip link — visible only when focused via Tab */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-30 focus:rounded-md focus:bg-brand focus:text-white focus:px-3 focus:py-1.5 focus:text-sm focus:shadow-lg"
        >
          Skip to main content
        </a>

        {/* Brand */}
        <div
          className={`shrink-0 border-b border-brand-light/40 dark:border-slate-800 bg-brand-tint dark:bg-[#3a1509]/70 ${
            layoutCollapsed ? "md:px-2 md:py-3 md:flex md:items-center md:justify-center" : ""
          } px-5 py-4 flex items-center justify-between`}
        >
          {layoutCollapsed ? (
            <>
              <img
                src="/icon.png"
                alt="FDM Tracker"
                className="hidden md:block h-9 w-9 rounded-md select-none"
                draggable={false}
              />
              <img
                src="/4d-logo.webp"
                alt="Fourth Dimension"
                className="md:hidden h-8 w-auto block select-none"
                draggable={false}
              />
            </>
          ) : (
            <div>
              <img
                src="/4d-logo.webp"
                alt="Fourth Dimension"
                className="h-8 w-auto block select-none"
                draggable={false}
              />
              <div className="text-[11px] text-brand-dark/80 dark:text-brand-light mt-2 tracking-wide uppercase">
                FDM Tracker · Admin
              </div>
            </div>
          )}
          {/* Mobile close button — only inside the drawer, not on desktop */}
          <button
            onClick={onMobileClose}
            className="md:hidden p-1.5 rounded-md hover:bg-white/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-3 space-y-4">
          {SECTIONS.map((section) => (
            <div key={section.label}>
              {/* Section header — hidden when desktop is collapsed */}
              <div
                className={`px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 ${
                  layoutCollapsed ? "md:hidden" : ""
                }`}
              >
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map(({ href, label, icon: Icon }) => {
                  const active = path === href || path?.startsWith(href + "/");
                  return (
                    <Link
                      key={href}
                      href={href}
                      title={layoutCollapsed ? label : undefined}
                      className={`flex items-center gap-2 rounded-md text-sm transition-colors px-3 py-2
                        ${layoutCollapsed ? "md:justify-center md:h-9 md:w-10 md:mx-auto md:px-0 md:py-0" : ""}
                        ${
                          active
                            ? "bg-brand text-white shadow-sm"
                            : "text-slate-700 dark:text-slate-300 hover:bg-brand-tint dark:hover:bg-slate-800 hover:text-brand-dark dark:hover:text-brand-light"
                        }`}
                    >
                      <Icon size={16} />
                      <span className={`truncate ${layoutCollapsed ? "md:hidden" : ""}`}>
                        {label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Collapse toggle — desktop only */}
        <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 p-2 hidden md:block">
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`flex items-center gap-2 rounded-md text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
              collapsed ? "justify-center h-8 w-10 mx-auto" : "px-3 py-2 w-full"
            }`}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
