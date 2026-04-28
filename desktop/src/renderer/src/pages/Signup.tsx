import { useEffect, useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/AuthLayout";
import type { TeamBrief } from "@shared/types";

interface Props {
  onSubmitted: (email: string) => void;
  onBack: () => void;
}

export function Signup({ onSubmitted, onBack }: Props) {
  const [form, setForm] = useState({
    name: "", email: "", password: "", position: "",
    team_id: "" as string,
    timezone: "Asia/Kolkata",
  });
  const [teams, setTeams] = useState<TeamBrief[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = () => {
      window.fdm.listPublicTeams().then((r) => {
        if (r.ok && r.data) setTeams(r.data.teams);
      });
    };
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const body = {
      name: form.name,
      email: form.email.trim().toLowerCase(),
      password: form.password,
      position: form.position.trim() || undefined,
      team_id: form.team_id || null,
      timezone: form.timezone,
    };
    const r = await window.fdm.signup(body);
    setBusy(false);
    if (r.ok) onSubmitted(body.email);
    else setErr(r.error ?? "signup failed");
  }

  return (
    <AuthLayout
      heading="Create your account"
      subheading="Use your @fourdm.com or @fourdm.digital email."
      footer={
        <>
          Already have an account?{" "}
          <button
            type="button"
            className="text-brand font-medium hover:text-brand-dark underline-offset-4 hover:underline"
            onClick={onBack}
          >
            Sign in
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <Input placeholder="Full name" required value={form.name}
               onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input type="email" placeholder="Email" required value={form.email}
               onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input placeholder="Position / job title (optional)" value={form.position}
               onChange={(e) => setForm({ ...form, position: e.target.value })} />
        <div>
          <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Team</label>
          <select
            className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60"
            value={form.team_id}
            onChange={(e) => setForm({ ...form, team_id: e.target.value })}
          >
            <option value="">{teams.length === 0 ? "No teams configured — ask an admin" : "Pick a team (optional)"}</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <Input type="password" placeholder="Password (min 8 chars)" minLength={8} required
               value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {err && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}
        <Button type="submit" variant="brand" disabled={busy} className="w-full">
          {busy ? "Creating…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
