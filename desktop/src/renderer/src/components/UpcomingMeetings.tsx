import { useEffect, useState } from "react";
import { differenceInMinutes, parseISO } from "date-fns";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

interface Meeting {
  id: string;
  title: string;
  meeting_link: string | null;
  scheduled_at: string;
  duration_minutes: number;
  attendees: { id: string; name: string; email: string }[];
}

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function formatLocal(iso: string): string {
  const d = parseISO(iso);
  const local = new Date(d.toLocaleString("en-US", { timeZone: TZ }));
  return `${local.getFullYear()}-${pad2(local.getMonth() + 1)}-${pad2(local.getDate())} ${pad2(local.getHours())}:${pad2(local.getMinutes())}`;
}

function formatLead(iso: string): string {
  const mins = differenceInMinutes(parseISO(iso), new Date());
  if (mins < 0) {
    const past = -mins;
    if (past < 60) return `started ${past} min ago`;
    return `started ${Math.floor(past / 60)}h ${past % 60}m ago`;
  }
  if (mins === 0) return "starting now";
  if (mins < 60) return `in ${mins} min`;
  if (mins < 24 * 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
  }
  const days = Math.floor(mins / (24 * 60));
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

export function UpcomingMeetings() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = () => {
      void window.fdm.listMyMeetings().then((r) => {
        setLoaded(true);
        if (r.ok && r.data) setMeetings(r.data.meetings);
      });
    };
    load();
    // Refresh on focus + every 60s while the dashboard is open.
    const t = setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", load);
    };
  }, []);

  // Show meetings that haven't ended yet (start + duration > now).
  const now = Date.now();
  const visible = meetings.filter((m) => {
    const end = parseISO(m.scheduled_at).getTime() + m.duration_minutes * 60_000;
    return end > now;
  }).slice(0, 5);

  return (
    <Card className="dark:bg-slate-900 dark:border-slate-800">
      <CardHeader className="dark:border-slate-800">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-sm font-semibold">Upcoming meetings</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              You'll get a desktop notification before each one.
            </div>
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
            {meetings.length}
          </span>
        </div>
      </CardHeader>
      <CardBody>
        {!loaded && <div className="text-sm text-slate-500">Loading…</div>}
        {loaded && visible.length === 0 && (
          <div className="text-sm text-slate-500 dark:text-slate-400 py-2">
            No meetings scheduled in the next 30 days.
          </div>
        )}
        {visible.length > 0 && (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 -my-2">
            {visible.map((m) => {
              const lead = formatLead(m.scheduled_at);
              const past = parseISO(m.scheduled_at).getTime() < now;
              const end = parseISO(m.scheduled_at).getTime() + m.duration_minutes * 60_000;
              const live = past && end > now;
              return (
                <li key={m.id} className="py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium text-sm truncate">{m.title}</div>
                      {live && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          live
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                      {formatLocal(m.scheduled_at)} · {m.duration_minutes} min · {lead}
                    </div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                      {m.attendees.length === 0
                        ? "All users"
                        : `Audience: ${m.attendees.slice(0, 3).map((a) => a.name).join(", ")}${m.attendees.length > 3 ? ` +${m.attendees.length - 3}` : ""}`}
                    </div>
                  </div>
                  {m.meeting_link && (
                    <button
                      type="button"
                      onClick={() => { void window.fdm.openExternal(m.meeting_link!); }}
                      className="shrink-0 inline-flex items-center px-3 h-8 rounded-md bg-brand text-white text-xs font-medium hover:bg-brand-dark"
                    >
                      Join
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
