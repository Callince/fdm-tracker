/**
 * Polls /me/meetings every minute and fires a notification (and optional
 * alarm sound) when a meeting is `meetingReminderMinutes` minutes away.
 * Each (meeting_id, scheduled_at) pair is notified at most once per session.
 */
import { shell } from "electron";
import { api } from "./api";
import { auth, prefs } from "./auth";
import { notify } from "./notifications";

interface UpcomingMeeting {
  id: string;
  title: string;
  meeting_link: string | null;
  scheduled_at: string;
  duration_minutes: number;
}

let pollTimer: NodeJS.Timeout | null = null;
let cache: UpcomingMeeting[] = [];
const fired = new Set<string>();   // `${id}@${scheduled_at}`

async function refresh() {
  const a = auth.get();
  if (!a.accessToken) return;
  try {
    const r = await api.listMyMeetings();
    cache = r.meetings;
  } catch {
    // network blip — keep old cache
  }
}

function check() {
  const p = prefs.get();
  if (!p.meetingNotificationsEnabled) return;
  const now = Date.now();
  const reminderMs = Math.max(0, p.meetingReminderMinutes) * 60_000;
  for (const m of cache) {
    const ts = Date.parse(m.scheduled_at);
    if (isNaN(ts)) continue;
    const lead = ts - now;
    // Window: between (reminder + 60s) and 0 — fire once when entering.
    if (lead <= reminderMs && lead > 0) {
      const key = `${m.id}@${m.scheduled_at}`;
      if (fired.has(key)) continue;
      fired.add(key);
      const minutes = Math.max(1, Math.round(lead / 60_000));
      const body = m.meeting_link
        ? `Starts in ${minutes} min — click to join`
        : `Starts in ${minutes} min`;
      notify({
        title: m.title,
        body,
        sound: p.meetingAlarmEnabled,
        onClick: m.meeting_link ? () => shell.openExternal(m.meeting_link!) : undefined,
      });
    }
  }
  // Garbage-collect fired keys older than 24h to prevent unbounded growth.
  if (fired.size > 200) fired.clear();
}

export const meetingWatcher = {
  start() {
    if (pollTimer) return;
    void refresh();
    pollTimer = setInterval(async () => {
      await refresh();
      check();
    }, 60_000);
    // Also tick every 15s just for the check (no API call), so reminders
    // fire close to the actual minute boundary even if poll just happened.
    setInterval(check, 15_000);
  },
  stop() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    cache = [];
    fired.clear();
  },
};
