"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SideNav } from "@/components/SideNav";
import { TopBar } from "@/components/TopBar";
import { auth } from "@/lib/auth";

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const p = auth.getProfile();
    if (!p || p.role !== "admin") {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <SideNav />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main id="main-content" className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-7xl mx-auto w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
