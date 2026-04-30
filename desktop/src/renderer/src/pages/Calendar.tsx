import { useEffect, useState } from "react";
import { addMonths, endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import type { DailySummary, DayDetail } from "@shared/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarGrid } from "@/components/CalendarGrid";
import { DayTimeline } from "@/components/DayTimeline";
import { Skeleton } from "@/components/Skeleton";
import { PageHeader } from "@/components/PageHeader";
import { hms } from "@/lib/format";

export function CalendarPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [day, setDay] = useState<Date>(() => new Date());
  const [days, setDays] = useState<DailySummary[]>([]);
  const [holidays, setHolidays] = useState<{ id: string; date: string; name: string; kind: "holiday" | "working" }[]>([]);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const from = format(startOfMonth(month), "yyyy-MM-dd");
    const to = format(endOfMonth(month), "yyyy-MM-dd");
    setLoading(true);
    window.fdm
      .dailySummary(from, to)
      .then((r) => setDays(r.days))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => {
    void window.fdm.listHolidays().then((r) => {
      if (r.ok && r.data) setHolidays(r.data.holidays);
    });
    // Refresh on window focus so admin changes show up next time the user
    // looks at this page.
    const onFocus = () => {
      void window.fdm.listHolidays().then((r) => {
        if (r.ok && r.data) setHolidays(r.data.holidays);
      });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    const iso = format(day, "yyyy-MM-dd");
    window.fdm.dayDetail(iso).then(setDetail).catch(() => setDetail(null));
  }, [day]);

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Your history"
        title="Calendar"
        subtitle="Pick a day to see its timeline."
      />

      <Card className="dark:bg-slate-900 dark:border-slate-800">
        <CardHeader className="flex items-center justify-between dark:border-slate-800">
          <div className="text-sm font-semibold">{format(month, "MMMM yyyy")}</div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => setMonth(subMonths(month, 1))}>‹</Button>
            <Button size="sm" variant="outline" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
            <Button size="sm" variant="outline" onClick={() => setMonth(addMonths(month, 1))}>›</Button>
          </div>
        </CardHeader>
        <CardBody>
          {loading && (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="h-16 lg:h-20" />
              ))}
            </div>
          )}
          {err && <div className="text-sm text-red-600">{err}</div>}
          <CalendarGrid
            month={month}
            days={days}
            holidays={holidays}
            selected={day}
            onSelect={setDay}
          />
        </CardBody>
      </Card>

      <Card className="dark:bg-slate-900 dark:border-slate-800">
        <CardHeader className="dark:border-slate-800">
          <div className="text-sm font-semibold">Day detail · {format(day, "PP")}</div>
        </CardHeader>
        <CardBody>
          {!detail && (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full" />
              <div className="grid grid-cols-3 gap-3 max-w-md">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            </div>
          )}
          {detail && (
            <div className="space-y-4">
              <DayTimeline detail={detail} />
              <div className="grid grid-cols-3 gap-3 max-w-md text-sm">
                <div><div className="text-slate-500 dark:text-slate-400">Active</div><div className="font-medium text-active">{hms(detail.totals.total_active_seconds)}</div></div>
                <div><div className="text-slate-500 dark:text-slate-400">Idle</div><div className="font-medium text-idle">{hms(detail.totals.total_idle_seconds)}</div></div>
                <div><div className="text-slate-500 dark:text-slate-400">Break</div><div className="font-medium text-brk">{hms(detail.totals.total_break_seconds)}</div></div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
