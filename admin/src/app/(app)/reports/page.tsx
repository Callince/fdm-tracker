"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, startOfMonth } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { PageHeader } from "@/components/PageHeader";

type GroupBy = "user" | "team";

export default function ReportsPage() {
  const today = new Date();
  const [from, setFrom] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(today, "yyyy-MM-dd"));
  const [includeZero, setIncludeZero] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>("user");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const teamsQ = useQuery({ queryKey: ["admin", "teams"], queryFn: ({ signal }) => api.listTeams(signal) });
  const teamLabel = useMemo(() => {
    if (!teamId) return "All teams";
    const t = teamsQ.data?.teams.find((x) => x.id === teamId);
    return t?.name ?? "All teams";
  }, [teamId, teamsQ.data]);

  const rangeLabel = useMemo(() => {
    if (from === to) return format(new Date(from), "PP");
    return `${format(new Date(from), "MMM d")} – ${format(new Date(to), "MMM d, yyyy")}`;
  }, [from, to]);

  async function download(fmt: "csv" | "json") {
    setErr(null);
    setBusy(true);
    try {
      const blob = await api.downloadReport(from, to, fmt, { includeZero, teamId, groupBy });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const tag = groupBy === "team" ? "by-team" : "by-user";
      a.download = `fdm-report-${tag}-${from}-${to}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  function preset(days: number) {
    const end = new Date();
    setFrom(format(addDays(end, -days), "yyyy-MM-dd"));
    setTo(format(end, "yyyy-MM-dd"));
  }

  return (
    <div className="space-y-6 max-w-3xl pb-24">
      <PageHeader
        kicker="Export"
        title="Reports"
        subtitle="Active / idle / break hours as CSV or JSON. Group by user or team, optionally scoped to a single team."
      />

      {/* Summary banner — always visible */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Current selection
            </div>
            <div className="text-sm text-slate-800 dark:text-slate-200 mt-0.5">
              <span className="font-medium">{rangeLabel}</span>
              <span className="text-slate-400 dark:text-slate-500 mx-2">·</span>
              <span>{teamLabel}</span>
              <span className="text-slate-400 dark:text-slate-500 mx-2">·</span>
              <span>Group by {groupBy === "team" ? "team" : "user"}</span>
              {includeZero && (
                <>
                  <span className="text-slate-400 dark:text-slate-500 mx-2">·</span>
                  <span>including empty days</span>
                </>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setFiltersOpen((v) => !v)}>
            {filtersOpen ? (
              <>Hide filters <ChevronUp size={14} className="ml-1" /></>
            ) : (
              <>Edit filters <ChevronDown size={14} className="ml-1" /></>
            )}
          </Button>
        </CardBody>
      </Card>

      {filtersOpen && (
        <>
          <Card>
            <CardHeader>
              <div className="text-sm font-semibold">Date range</div>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => preset(6)}>Last 7 days</Button>
                <Button size="sm" variant="outline" onClick={() => preset(29)}>Last 30 days</Button>
                <Button size="sm" variant="outline" onClick={() => {
                  const s = startOfMonth(new Date());
                  setFrom(format(s, "yyyy-MM-dd"));
                  setTo(format(new Date(), "yyyy-MM-dd"));
                }}>This month</Button>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">From</label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">To</label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><div className="text-sm font-semibold">Filters</div></CardHeader>
            <CardBody className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Team</label>
                <select
                  className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60"
                  value={teamId ?? ""}
                  onChange={(e) => setTeamId(e.target.value || null)}
                >
                  <option value="">All teams</option>
                  {(teamsQ.data?.teams ?? []).map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.member_count})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 block mb-2">Group by</label>
                <Segmented<GroupBy>
                  value={groupBy}
                  onChange={setGroupBy}
                  options={[
                    { value: "user", label: "User × day" },
                    { value: "team", label: "Team × day" },
                  ]}
                />
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {groupBy === "team"
                    ? "One row per team per day with totals across all members."
                    : "One row per user per day."}
                </div>
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeZero}
                  onChange={(e) => setIncludeZero(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <div className="font-medium">Include days with no activity</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Off by default — keeps the report focused on days users actually tracked.
                  </div>
                </span>
              </label>
            </CardBody>
          </Card>
        </>
      )}

      {err && <div className="text-sm text-red-600 dark:text-red-400">{err}</div>}

      {/* Sticky download footer */}
      <div className="fixed bottom-4 right-6 z-10">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-lg px-4 py-3 flex gap-2">
          <Button onClick={() => download("csv")} disabled={busy}>
            {busy ? "Downloading…" : "Download CSV"}
          </Button>
          <Button variant="outline" onClick={() => download("json")} disabled={busy}>
            JSON
          </Button>
        </div>
      </div>
    </div>
  );
}
