import { useEffect, useMemo, useState } from "react";
import { differenceInMinutes, parseISO } from "date-fns";
import { ExternalLink, Users, Video } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";

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

function formatLocalDateTime(iso: string): string {
  const d = parseISO(iso);
  const local = new Date(d.toLocaleString("en-US", { timeZone: TZ }));
  return `${local.getFullYear()}-${pad2(local.getMonth() + 1)}-${pad2(local.getDate())} ${pad2(local.getHours())}:${pad2(local.getMinutes())}`;
}

function formatLead(iso: string): string {
  const mins = differenceInMinutes(parseISO(iso), new Date());
  if (mins < 0) {
    const past = -mins;
    if (past < 60) return `${past} min ago`;
    if (past < 24 * 60) return `${Math.floor(past / 60)}h ${past % 60}m ago`;
    return `${Math.floor(past / (24 * 60))} day${Math.floor(past / (24 * 60)) === 1 ? "" : "s"} ago`;
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

export function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => {
      void window.fdm.listMyMeetings().then((r) => {
        setLoading(false);
        if (r.ok && r.data) setMeetings(r.data.meetings);
      });
    };
    load();
    const t = setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", load);
    };
  }, []);

  const now = Date.now();
  const { past, live, upcoming } = useMemo(() => {
    const past: Meeting[] = [];
    const live: Meeting[] = [];
    const upcoming: Meeting[] = [];
    for (const m of meetings) {
      const start = parseISO(m.scheduled_at).getTime();
      const end = start + m.duration_minutes * 60_000;
      if (end < now) past.push(m);
      else if (start <= now && now <= end) live.push(m);
      else upcoming.push(m);
    }
    past.sort((a, b) => parseISO(b.scheduled_at).getTime() - parseISO(a.scheduled_at).getTime());
    live.sort((a, b) => parseISO(a.scheduled_at).getTime() - parseISO(b.scheduled_at).getTime());
    upcoming.sort((a, b) => parseISO(a.scheduled_at).getTime() - parseISO(b.scheduled_at).getTime());
    return { past, live, upcoming };
  }, [meetings, now]);

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Schedule"
        title="Meetings"
        subtitle="Everything you've been invited to. Live ones at the top."
      />

      <Section
        title="Live now"
        meetings={live}
        emptyText="No meetings happening right now."
        accent="emerald"
      />

      <Section
        title="Upcoming"
        meetings={upcoming}
        emptyText="No upcoming meetings in the next 30 days."
      />

      <Section
        title="Past"
        meetings={past}
        emptyText="No past meetings yet."
        muted
      />

      {loading && (
        <div className="text-xs text-slate-400 dark:text-slate-500 text-center">Loading…</div>
      )}
    </div>
  );
}

function Section({
  title,
  meetings,
  emptyText,
  accent,
  muted,
}: {
  title: string;
  meetings: Meeting[];
  emptyText: string;
  accent?: "emerald";
  muted?: boolean;
}) {
  return (
    <Card className="dark:bg-slate-900 dark:border-slate-800">
      <CardHeader className="dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`text-sm font-semibold ${
            accent === "emerald" ? "text-emerald-700 dark:text-emerald-400" : ""
          }`}>
            {title}
          </div>
          {accent === "emerald" && meetings.length > 0 && (
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </div>
        <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
          {meetings.length}
        </span>
      </CardHeader>
      <CardBody>
        {meetings.length === 0 ? (
          <div className="text-sm text-slate-500 dark:text-slate-400 py-2">{emptyText}</div>
        ) : (
          <ul className={`divide-y divide-slate-100 dark:divide-slate-800 -my-2 ${muted ? "opacity-80" : ""}`}>
            {meetings.map((m) => (
              <li key={m.id} className="py-3 flex items-start gap-3">
                <Video size={16} className="mt-0.5 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{m.title}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                    {formatLocalDateTime(m.scheduled_at)} · {m.duration_minutes} min · {formatLead(m.scheduled_at)}
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate flex items-center gap-1">
                    <Users size={11} />
                    {m.attendees.length === 0
                      ? "All users"
                      : `${m.attendees.length} ${m.attendees.length === 1 ? "person" : "people"} · ${m.attendees.slice(0, 3).map((a) => a.name).join(", ")}${m.attendees.length > 3 ? ` +${m.attendees.length - 3}` : ""}`}
                  </div>
                </div>
                {m.meeting_link && (
                  <button
                    type="button"
                    onClick={() => { void window.fdm.openExternal(m.meeting_link!); }}
                    className="shrink-0 inline-flex items-center gap-1 px-3 h-8 rounded-md bg-brand text-white text-xs font-medium hover:bg-brand-dark"
                  >
                    {muted ? "Open" : "Join"}
                    <ExternalLink size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
