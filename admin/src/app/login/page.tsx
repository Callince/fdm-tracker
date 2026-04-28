"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.login(email.trim().toLowerCase(), password);
      if (res.role !== "admin") {
        setError("This console is admin-only. Sign in as an admin account.");
        return;
      }
      auth.saveLogin(res.tokens.access_token, res.tokens.refresh_token, {
        user_id: res.user_id,
        name: res.name,
        email: email.trim().toLowerCase(),
        role: res.role,
      });
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
      <Card className="w-full max-w-sm">
        <CardHeader className="bg-brand-tint dark:bg-[#3a1509]/70 border-b border-brand-light/40 dark:border-slate-800">
          <img src="/4d-logo.webp" alt="Fourth Dimension" className="h-10 w-auto block" draggable={false} />
          <div className="text-sm text-brand-dark dark:text-brand-light mt-3">Admin sign-in</div>
        </CardHeader>
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Email</label>
              <Input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@fourdm.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Password</label>
              <Input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <div className="rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
