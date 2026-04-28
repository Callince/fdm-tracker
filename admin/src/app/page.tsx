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
  return null;
}
