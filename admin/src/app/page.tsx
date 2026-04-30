"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/auth";

export default function Index() {
  const router = useRouter();
  useEffect(() => {
    const p = auth.getProfile();
    router.replace(p?.role === "admin" ? "/dashboard" : "/login");
  }, [router]);
  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 text-sm">
      Loading…
    </div>
  );
}
