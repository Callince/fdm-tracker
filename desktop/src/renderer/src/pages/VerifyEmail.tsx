import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/AuthLayout";

interface Props {
  email: string;
  onVerified: () => void;
  onBack: () => void;
}

export function VerifyEmail({ email, onVerified, onBack }: Props) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    const r = await window.fdm.verifyEmail(email, code.trim());
    setBusy(false);
    if (r.ok) {
      setMsg({ tone: "ok", text: "Verified — you can now sign in." });
      setTimeout(onVerified, 800);
    } else {
      setMsg({ tone: "err", text: r.error ?? "invalid code" });
    }
  }

  async function resend() {
    setMsg(null);
    const r = await window.fdm.resendVerification(email);
    if (r.ok) setMsg({ tone: "ok", text: "If the account is unverified, a new code has been sent." });
    else setMsg({ tone: "err", text: r.error ?? "could not resend" });
  }

  return (
    <AuthLayout
      heading="Check your inbox"
      subheading={`A 6-digit code was sent to ${email}.`}
    >
      <form onSubmit={submit} className="space-y-3">
        <Input
          inputMode="numeric" pattern="[0-9]*" maxLength={6} placeholder="123456"
          className="tracking-[0.5em] text-center text-lg"
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus
        />
        {msg && (
          <div
            className={`rounded-md px-3 py-2 text-sm border ${
              msg.tone === "ok"
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {msg.text}
          </div>
        )}
        <Button type="submit" variant="brand" disabled={busy || code.length < 4} className="w-full">
          {busy ? "Verifying…" : "Verify"}
        </Button>
        <div className="flex items-center justify-between pt-1 text-xs">
          <button type="button" className="text-slate-500 hover:text-slate-800" onClick={onBack}>
            ← Back
          </button>
          <button type="button" className="text-brand hover:text-brand-dark font-medium" onClick={resend}>
            Resend code
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
