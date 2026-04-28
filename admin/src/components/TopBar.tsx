"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut } from "lucide-react";
import { api } from "@/lib/api";
import { auth } from "@/lib/auth";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ThemeToggle } from "@/components/ThemeToggle";

export function TopBar() {
  const router = useRouter();
  const profile = auth.getProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  async function handleLogout() {
    try { await api.logout(); } catch { /* ignore */ }
    auth.clear();
    router.push("/login");
  }

  const initial = (profile?.name ?? "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <header className="shrink-0 sticky top-0 z-20 h-14 flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur px-5">
      <div className="min-w-0">
        <Breadcrumb />
      </div>

      <div className="flex items-center gap-1">
        <ThemeToggle />
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex items-center gap-2 h-8 pl-1.5 pr-2 rounded-md text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span
              className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-brand text-white text-[11px] font-semibold"
              aria-hidden
            >
              {initial}
            </span>
            <span className="hidden sm:inline max-w-[10rem] truncate">{profile?.name ?? "Account"}</span>
            <ChevronDown size={14} className="text-slate-400" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-1 w-56 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                  {profile?.name}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {profile?.email}
                </div>
              </div>
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void handleLogout();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-brand-tint dark:hover:bg-slate-800 hover:text-brand-dark dark:hover:text-brand-light"
              >
                <LogOut size={14} />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
