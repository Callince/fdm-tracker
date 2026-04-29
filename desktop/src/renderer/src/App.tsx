import { useEffect, useState } from "react";
import { Login } from "@/pages/Login";
import { Signup } from "@/pages/Signup";
import { VerifyEmail } from "@/pages/VerifyEmail";
import { PrivacyNotice } from "@/pages/PrivacyNotice";
import { Dashboard } from "@/pages/Dashboard";
import { CalendarPage } from "@/pages/Calendar";
import { MeetingsPage } from "@/pages/Meetings";
import { Settings } from "@/pages/Settings";
import { Widget } from "@/pages/Widget";
import { AppShell, type ShellView } from "@/components/AppShell";
import { useAppStatus } from "@/lib/status";

type AuthView = "login" | "signup" | "verify";

const IS_WIDGET = typeof window !== "undefined" && window.location.hash === "#widget";

export default function App() {
  const status = useAppStatus();
  const [authView, setAuthView] = useState<AuthView>("login");
  const [pendingEmail, setPendingEmail] = useState("");
  const [view, setView] = useState<ShellView>("dashboard");
  const [showPrivacyReview, setShowPrivacyReview] = useState(false);

  useEffect(() => {
    if (status && status.signed_in) setAuthView("login");
  }, [status?.signed_in]);

  useEffect(() => {
    if (!status) return;
    document.documentElement.classList.toggle("dark", status.dark_mode);
  }, [status?.dark_mode]);

  if (IS_WIDGET) {
    return <Widget />;
  }

  if (!status) {
    return <div className="h-full flex items-center justify-center text-sm text-slate-500">Loading…</div>;
  }

  // ---- unauthenticated flows ----------------------------------------------
  if (!status.signed_in) {
    if (authView === "signup") {
      return (
        <Signup
          onSubmitted={(email) => { setPendingEmail(email); setAuthView("verify"); }}
          onBack={() => setAuthView("login")}
        />
      );
    }
    if (authView === "verify") {
      return (
        <VerifyEmail
          email={pendingEmail}
          onVerified={() => setAuthView("login")}
          onBack={() => setAuthView("login")}
        />
      );
    }
    return (
      <Login
        onLoggedIn={() => { /* status flips signed_in=true via event */ }}
        onSwitchToSignup={() => setAuthView("signup")}
        onSwitchToVerify={(email) => { setPendingEmail(email); setAuthView("verify"); }}
      />
    );
  }

  // ---- first-run privacy acknowledgement ----------------------------------
  if (!status.privacy_acknowledged) {
    return <PrivacyNotice onAcknowledge={() => { void window.fdm.acknowledgePrivacy(); }} />;
  }

  // ---- privacy review (from Settings) -------------------------------------
  if (showPrivacyReview) {
    return <PrivacyNotice onAcknowledge={() => setShowPrivacyReview(false)} />;
  }

  // ---- shell + active page ------------------------------------------------
  return (
    <AppShell
      status={status}
      active={view}
      onNavigate={setView}
      onLogout={() => { void window.fdm.logout(); }}
    >
      {view === "dashboard" && <Dashboard status={status} />}
      {view === "meetings" && <MeetingsPage />}
      {view === "calendar" && <CalendarPage />}
      {view === "settings" && (
        <Settings status={status} onViewPrivacy={() => setShowPrivacyReview(true)} />
      )}
    </AppShell>
  );
}
