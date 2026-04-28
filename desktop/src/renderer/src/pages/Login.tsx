import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/AuthLayout";

interface Props {
  onLoggedIn: () => void;
  onSwitchToSignup: () => void;
  onSwitchToVerify: (email: string) => void;
}

export function Login({ onLoggedIn, onSwitchToSignup, onSwitchToVerify }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const r = await window.fdm.login(email, password);
    setBusy(false);
    if (r.ok) {
      onLoggedIn();
    } else {
      const msg = r.error ?? "login failed";
      setErr(msg);
      if (msg.toLowerCase().includes("email not verified")) {
        onSwitchToVerify(email.trim().toLowerCase());
      }
    }
  }

  return (
    <AuthLayout
      heading="Sign in"
      subheading="Use your FDM email to start tracking your day."
      footer={
        <>
          No account yet?{" "}
          <button
            type="button"
            className="text-brand font-medium hover:text-brand-dark underline-offset-4 hover:underline"
            onClick={onSwitchToSignup}
          >
            Create one
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Email</label>
          <Input
            type="email" required autoComplete="username" autoFocus
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@fourdm.com"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Password</label>
          <Input
            type="password" required autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {err && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {err}
          </div>
        )}
        <Button type="submit" variant="brand" disabled={busy} className="w-full">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
