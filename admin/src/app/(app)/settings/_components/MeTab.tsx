"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { TeamSelect } from "@/components/TeamSelect";

export function MeTab() {
  const qc = useQueryClient();
  const meQ = useQuery({ queryKey: ["me"], queryFn: () => api.getMe() });

  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [profileMsg, setProfileMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [pwMsg, setPwMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (meQ.data) {
      setName(meQ.data.name);
      setPosition(meQ.data.position ?? "");
      setTimezone(meQ.data.timezone);
      setTeamId(meQ.data.team_id);
    }
  }, [meQ.data]);

  const updateM = useMutation({
    mutationFn: api.updateMe,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "live"] });
      setProfileMsg({ tone: "ok", text: "Profile saved." });
    },
    onError: (e) =>
      setProfileMsg({ tone: "err", text: e instanceof ApiError ? e.message : "Failed" }),
  });

  const pwM = useMutation({
    mutationFn: (body: { cur: string; next: string }) => api.changePassword(body.cur, body.next),
    onSuccess: () => {
      setCur(""); setNext(""); setNext2("");
      setPwMsg({ tone: "ok", text: "Password changed." });
    },
    onError: (e) =>
      setPwMsg({ tone: "err", text: e instanceof ApiError ? e.message : "Failed" }),
  });

  function submitPw() {
    setPwMsg(null);
    if (next !== next2) {
      setPwMsg({ tone: "err", text: "New passwords don't match." });
      return;
    }
    if (next.length < 8) {
      setPwMsg({ tone: "err", text: "New password must be at least 8 characters." });
      return;
    }
    pwM.mutate({ cur, next });
  }

  if (meQ.isLoading) return <div className="text-sm text-slate-500 dark:text-slate-400">Loading…</div>;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="text-sm font-semibold">Profile</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {meQ.data?.email} · {meQ.data?.role}
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Position / job title</label>
            <Input
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="e.g. Head of Platform"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Team</label>
            <TeamSelect value={teamId} onChange={setTeamId} />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Timezone (IANA)</label>
            <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </div>
          {profileMsg && (
            <div className={`text-sm ${profileMsg.tone === "ok" ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {profileMsg.text}
            </div>
          )}
          <div>
            <Button
              disabled={updateM.isPending}
              onClick={() =>
                updateM.mutate({
                  name,
                  position: position.trim() || null,
                  team_id: teamId,
                  timezone,
                })
              }
            >
              {updateM.isPending ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-sm font-semibold">Change password</div>
        </CardHeader>
        <CardBody className="space-y-3">
          <Input
            type="password"
            placeholder="Current password"
            value={cur}
            onChange={(e) => setCur(e.target.value)}
            autoComplete="current-password"
          />
          <Input
            type="password"
            placeholder="New password (min 8)"
            minLength={8}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
          />
          <Input
            type="password"
            placeholder="Confirm new password"
            value={next2}
            onChange={(e) => setNext2(e.target.value)}
            autoComplete="new-password"
          />
          {pwMsg && (
            <div className={`text-sm ${pwMsg.tone === "ok" ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {pwMsg.text}
            </div>
          )}
          <div>
            <Button disabled={pwM.isPending || !cur || !next} onClick={submitPw}>
              {pwM.isPending ? "Saving…" : "Change password"}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
