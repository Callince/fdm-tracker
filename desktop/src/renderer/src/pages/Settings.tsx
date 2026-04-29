import { useEffect, useState } from "react";
import { addDays, format, startOfMonth } from "date-fns";
import type { AppStatus, TeamBrief } from "@shared/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";

interface Props {
  status: AppStatus;
  onViewPrivacy: () => void;
}

export function Settings({ status, onViewPrivacy }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ section: string; tone: "ok" | "err"; text: string } | null>(null);

  // ---- profile form ----
  const [name, setName] = useState(status.profile?.name ?? "");
  const [position, setPosition] = useState(status.profile?.position ?? "");
  const [timezone, setTimezone] = useState(status.profile?.timezone ?? "Asia/Kolkata");
  const [teamId, setTeamId] = useState<string>(status.profile?.team_id ?? "");
  const [teams, setTeams] = useState<TeamBrief[]>([]);
  useEffect(() => {
    setName(status.profile?.name ?? "");
    setPosition(status.profile?.position ?? "");
    setTimezone(status.profile?.timezone ?? "Asia/Kolkata");
    setTeamId(status.profile?.team_id ?? "");
  }, [status.profile?.user_id]);
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

  // ---- password form ----
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");

  // ---- export range ----
  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));

  async function saveProfile() {
    setMsg(null);
    setBusy("profile");
    const r = await window.fdm.updateProfile({
      name,
      position: position.trim() || null,
      team_id: teamId || null,
      timezone,
    });
    setBusy(null);
    if (r.ok) setMsg({ section: "profile", tone: "ok", text: "Profile updated." });
    else setMsg({ section: "profile", tone: "err", text: r.error ?? "update failed" });
  }

  async function submitPassword() {
    setMsg(null);
    if (newPw !== newPw2) {
      setMsg({ section: "password", tone: "err", text: "New passwords don't match." });
      return;
    }
    if (newPw.length < 8) {
      setMsg({ section: "password", tone: "err", text: "New password must be at least 8 characters." });
      return;
    }
    setBusy("password");
    const r = await window.fdm.changePassword(curPw, newPw);
    setBusy(null);
    if (r.ok) {
      setCurPw(""); setNewPw(""); setNewPw2("");
      setMsg({ section: "password", tone: "ok", text: "Password changed." });
    } else {
      setMsg({ section: "password", tone: "err", text: r.error ?? "change failed" });
    }
  }

  async function toggleAutoStart(enabled: boolean) {
    setBusy("autostart");
    await window.fdm.setAutoStart(enabled);
    setBusy(null);
  }

  async function toggleDark(enabled: boolean) {
    setBusy("dark");
    await window.fdm.setDarkMode(enabled);
    setBusy(null);
  }

  async function setEod(hour: number | null) {
    setBusy("eod");
    await window.fdm.setEodReminder(hour);
    setBusy(null);
  }

  async function toggleAutoBreak(enabled: boolean) {
    setBusy("autobreak");
    await window.fdm.setAutoBreakOnIdle(enabled);
    setBusy(null);
  }

  async function toggleMeetingNotifications(enabled: boolean) {
    setBusy("meeting-notif");
    await window.fdm.setMeetingNotifications(enabled);
    setBusy(null);
  }

  async function toggleMeetingAlarm(enabled: boolean) {
    setBusy("meeting-alarm");
    await window.fdm.setMeetingAlarm(enabled);
    setBusy(null);
  }

  async function setMeetingMinutes(minutes: number) {
    setBusy("meeting-min");
    await window.fdm.setMeetingReminderMinutes(minutes);
    setBusy(null);
  }

  async function exportData() {
    setMsg(null);
    setBusy("export");
    const r = await window.fdm.exportMyData(from, to);
    setBusy(null);
    if (r.ok) setMsg({ section: "export", tone: "ok", text: `Saved to ${r.path}` });
    else if (r.error !== "cancelled") setMsg({ section: "export", tone: "err", text: r.error ?? "export failed" });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Configuration"
        title="Settings"
        subtitle="Your profile, preferences, and data export."
      />

      <div className="space-y-5">

        {/* Profile ------------------------------------------------------- */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader className="dark:border-slate-800"><div className="text-sm font-semibold">Profile</div></CardHeader>
          <CardBody className="space-y-3">
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Position / job title</label>
              <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. UI Designer" />
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Team</label>
              <select
                className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                <option value="">{teams.length === 0 ? "No teams configured" : "No team"}</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Timezone (IANA)</label>
              <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Asia/Kolkata" />
            </div>
            {msg?.section === "profile" && (
              <div className={`text-sm ${msg.tone === "ok" ? "text-green-700" : "text-red-600"}`}>{msg.text}</div>
            )}
            <div>
              <Button onClick={saveProfile} disabled={busy === "profile"}>
                {busy === "profile" ? "Saving…" : "Save profile"}
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Password ------------------------------------------------------ */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader className="dark:border-slate-800"><div className="text-sm font-semibold">Change password</div></CardHeader>
          <CardBody className="space-y-3">
            <Input type="password" placeholder="Current password" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" />
            <Input type="password" placeholder="New password (min 8)" minLength={8} value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
            <Input type="password" placeholder="Confirm new password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} autoComplete="new-password" />
            {msg?.section === "password" && (
              <div className={`text-sm ${msg.tone === "ok" ? "text-green-700" : "text-red-600"}`}>{msg.text}</div>
            )}
            <div>
              <Button onClick={submitPassword} disabled={busy === "password" || !curPw || !newPw}>
                {busy === "password" ? "Saving…" : "Change password"}
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Preferences --------------------------------------------------- */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader className="dark:border-slate-800"><div className="text-sm font-semibold">Preferences</div></CardHeader>
          <CardBody className="space-y-4">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={status.auto_start} disabled={busy === "autostart"}
                     onChange={(e) => toggleAutoStart(e.target.checked)} className="mt-1" />
              <span>
                <div className="font-medium">Launch at login</div>
                <div className="text-slate-500 dark:text-slate-400">Starts minimized to the tray. Tracking begins only when you press <strong>Start work</strong>.</div>
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={status.dark_mode} disabled={busy === "dark"}
                     onChange={(e) => toggleDark(e.target.checked)} className="mt-1" />
              <span>
                <div className="font-medium">Dark mode</div>
                <div className="text-slate-500 dark:text-slate-400">Easier on the eyes for evening work.</div>
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={status.auto_break_on_idle} disabled={busy === "autobreak"}
                     onChange={(e) => toggleAutoBreak(e.target.checked)} className="mt-1" />
              <span>
                <div className="font-medium">Auto-pause when I go idle</div>
                <div className="text-slate-500 dark:text-slate-400">
                  When you're idle for twice the admin's threshold, FDM starts a break for you and ends it when you come back.
                </div>
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={status.meeting_notifications_enabled} disabled={busy === "meeting-notif"}
                     onChange={(e) => toggleMeetingNotifications(e.target.checked)} className="mt-1" />
              <span>
                <div className="font-medium">Meeting reminders</div>
                <div className="text-slate-500 dark:text-slate-400">
                  Notify me before scheduled meetings I'm invited to. Click the notification to open the meeting link.
                </div>
              </span>
            </label>

            {status.meeting_notifications_enabled && (
              <>
                <label className="flex items-start gap-3 text-sm pl-6">
                  <input type="checkbox" checked={status.meeting_alarm_enabled} disabled={busy === "meeting-alarm"}
                         onChange={(e) => toggleMeetingAlarm(e.target.checked)} className="mt-1" />
                  <span>
                    <div className="font-medium">Play alarm sound</div>
                    <div className="text-slate-500 dark:text-slate-400">
                      Use the OS notification sound. Off = silent toast only.
                    </div>
                  </span>
                </label>

                <div className="space-y-1 pl-6">
                  <div className="text-sm font-medium">Remind me</div>
                  <div className="flex items-center gap-2">
                    <select
                      className="h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60"
                      value={status.meeting_reminder_minutes}
                      onChange={(e) => setMeetingMinutes(parseInt(e.target.value, 10))}
                      disabled={busy === "meeting-min"}
                    >
                      {[1, 5, 10, 15, 30, 60].map((m) => (
                        <option key={m} value={m}>{m} minute{m === 1 ? "" : "s"} before</option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1">
              <div className="text-sm font-medium">End-of-day reminder</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                If your work session is still open past this hour (local time), FDM Tracker will nudge you to end it.
              </div>
              <div className="flex items-center gap-2 mt-1">
                <select
                  className="h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60"
                  value={status.end_of_day_reminder_hour ?? ""}
                  onChange={(e) => setEod(e.target.value === "" ? null : parseInt(e.target.value, 10))}
                  disabled={busy === "eod"}
                >
                  <option value="">off</option>
                  {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                    <option key={h} value={h}>{`${h.toString().padStart(2, "0")}:00`}</option>
                  ))}
                </select>
                <span className="text-xs text-slate-500">
                  {status.end_of_day_reminder_hour != null ? "on" : "disabled"}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Data export --------------------------------------------------- */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader className="dark:border-slate-800"><div className="text-sm font-semibold">Export my data</div></CardHeader>
          <CardBody className="space-y-3">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              CSV of your daily activity totals. Per DPDP Act 2023 you can request a copy of the data we hold about you.
            </div>
            <div className="flex gap-3">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { const t = new Date(); setFrom(format(addDays(t, -6), "yyyy-MM-dd")); setTo(format(t, "yyyy-MM-dd")); }}>Last 7 days</Button>
              <Button size="sm" variant="outline" onClick={() => { const t = new Date(); setFrom(format(addDays(t, -29), "yyyy-MM-dd")); setTo(format(t, "yyyy-MM-dd")); }}>Last 30 days</Button>
              <Button size="sm" variant="outline" onClick={() => { const s = startOfMonth(new Date()); setFrom(format(s, "yyyy-MM-dd")); setTo(format(new Date(), "yyyy-MM-dd")); }}>This month</Button>
            </div>
            {msg?.section === "export" && (
              <div className={`text-sm ${msg.tone === "ok" ? "text-green-700" : "text-red-600"}`}>{msg.text}</div>
            )}
            <div>
              <Button onClick={exportData} disabled={busy === "export"}>
                {busy === "export" ? "Downloading…" : "Download CSV"}
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Account ------------------------------------------------------- */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader className="dark:border-slate-800"><div className="text-sm font-semibold">Account</div></CardHeader>
          <CardBody className="space-y-3 text-sm">
            <div><span className="text-slate-500 dark:text-slate-400">Email: </span>{status.profile?.email}</div>
            <div><span className="text-slate-500 dark:text-slate-400">Role: </span>{status.profile?.role}</div>
            <div><span className="text-slate-500 dark:text-slate-400">Team: </span>{status.profile?.team_name ?? "—"}</div>
            <div><span className="text-slate-500 dark:text-slate-400">Idle threshold: </span>{status.profile?.idle_threshold_minutes} min (set by admin)</div>
            <div><span className="text-slate-500 dark:text-slate-400">Daily target: </span>{status.profile?.target_hours_per_day ?? 8} hours (active + idle + break; set by admin)</div>
            <div className="pt-2 flex gap-2">
              <Button variant="outline" onClick={onViewPrivacy}>View privacy notice</Button>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Use the <strong>Log out</strong> button in the sidebar to sign out.
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
