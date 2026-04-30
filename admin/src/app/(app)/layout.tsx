"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SideNav } from "@/components/SideNav";
import { TopBar } from "@/components/TopBar";
import { auth } from "@/lib/auth";

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [ready, setReady] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const p = auth.getProfile();
    if (!p || p.role !== "admin") {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  // Auto-close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [path]);

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <SideNav
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onMobileMenu={() => setMobileNavOpen(true)} />
        <main id="main-content" className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 max-w-7xl mx-auto w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
