"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { PageHeader } from "@/components/PageHeader";
import { TeamSelect } from "@/components/TeamSelect";
import { TeamBadge } from "@/components/TeamBadge";
import { atTz, hms, statusColor, statusLabel } from "@/lib/format";

type Filter = string | "none" | null;

export default function PeoplePage() {
  const qc = useQueryClient();

  const usersQ = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.listUsers(),
  });
  const teamsQ = useQuery({
    queryKey: ["admin", "teams"],
    queryFn: () => api.listTeams(),
  });

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(null);

  // Create-user modal
  const [userOpen, setUserOpen] = useState(false);
  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "user" as "user" | "admin",
    position: "",
    team_id: null as string | null,
    timezone: "Asia/Kolkata",
  });
  const [userErr, setUserErr] = useState<string | null>(null);

  const createUserM = useMutation({
    mutationFn: api.createUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "live"] });
      setUserOpen(false);
      setUserForm((f) => ({ ...f, name: "", email: "", password: "", position: "" }));
    },
  });

  // Create / rename / delete team
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamErr, setTeamErr] = useState<string | null>(null);

  const [editingTeam, setEditingTeam] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState("");

  const [deleteTeam, setDeleteTeam] = useState<{ id: string; name: string; member_count: number } | null>(null);

  const createTeamM = useMutation({
    mutationFn: (name: string) => api.createTeam(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "teams"] });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "live"] });
      setTeamName("");
      setTeamErr(null);
      setTeamOpen(false);
    },
    onError: (e) => setTeamErr(e instanceof ApiError ? e.message : "create failed"),
  });

  const updateTeamM = useMutation({
    mutationFn: (body: { id: string; name: string }) => api.updateTeam(body.id, body.name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "teams"] });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });

  const deleteTeamM = useMutation({
    mutationFn: (id: string) => api.deleteTeam(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "teams"] });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "live"] });
      setDeleteTeam(null);
      // If the deleted team was the active filter, reset to All.
      setFilter((f) => (deleteTeam && f === deleteTeam.id ? null : f));
    },
  });

  const teams = teamsQ.data?.teams ?? [];
  const allUsers = usersQ.data?.users ?? [];

  const counts = useMemo(() => {
    const byTeam: Record<string, number> = {};
    let noTeam = 0;
    for (const u of allUsers) {
      if (!u.team_id) noTeam += 1;
      else byTeam[u.team_id] = (byTeam[u.team_id] ?? 0) + 1;
    }
    return { byTeam, noTeam, total: allUsers.length };
  }, [allUsers]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allUsers.filter((u) => {
      if (filter === "none" && u.team_id !== null) return false;
      if (filter && filter !== "none" && u.team_id !== filter) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.position ?? "").toLowerCase().includes(q)
      );
    });
  }, [allUsers, query, filter]);

  function submitUser(e: FormEvent) {
    e.preventDefault();
    setUserErr(null);
    const position = userForm.position.trim();
    createUserM.mutate(
      { ...userForm, position: position || null },
      { onError: (e) => setUserErr(e instanceof ApiError ? e.message : "Failed") },
    );
  }

  function submitTeam(e: FormEvent) {
    e.preventDefault();
    setTeamErr(null);
    const name = teamName.trim();
    if (name) createTeamM.mutate(name);
  }

  function saveRename(id: string) {
    const name = editTeamName.trim();
    if (!name) return;
    updateTeamM.mutate({ id, name }, { onSettled: () => setEditingTeam(null) });
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        kicker="Workspace"
        title="People"
        subtitle="Users and their teams in one place. Click a team chip to filter the list."
        right={
          <div className="flex items-center gap-2 self-center">
            <Button variant="outline" onClick={() => setTeamOpen(true)}>
              <Plus size={14} className="mr-1" /> New team
            </Button>
            <Button onClick={() => setUserOpen(true)}>
              <Plus size={14} className="mr-1" /> New user
            </Button>
          </div>
        }
      />

      {/* Teams strip ----------------------------------------------------- */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Teams</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {teams.length} team{teams.length === 1 ? "" : "s"} · click to filter
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            label="All"
            count={counts.total}
            active={filter === null}
            onClick={() => setFilter(null)}
          />
          {teams.map((t) =>
            editingTeam === t.id ? (
              <div
                key={t.id}
                className="inline-flex items-center gap-1 h-9 px-2 rounded-full bg-brand-tint dark:bg-[#3a1509]/60"
              >
                <Input
                  value={editTeamName}
                  onChange={(e) => setEditTeamName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveRename(t.id);
                    if (e.key === "Escape") setEditingTeam(null);
                  }}
                  autoFocus
                  className="h-7 w-32 text-sm"
                />
                <button
                  onClick={() => saveRename(t.id)}
                  className="p-1 rounded hover:bg-white/40 dark:hover:bg-slate-800/40"
                  aria-label="Save"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={() => setEditingTeam(null)}
                  className="p-1 rounded hover:bg-white/40 dark:hover:bg-slate-800/40"
                  aria-label="Cancel"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <FilterChip
                key={t.id}
                label={t.name}
                count={counts.byTeam[t.id] ?? t.member_count}
                active={filter === t.id}
                onClick={() => setFilter(filter === t.id ? null : t.id)}
                actions={
                  <>
                    <Link
                      href={`/teams/${t.id}`}
                      className="p-1 rounded hover:bg-white/40 dark:hover:bg-slate-800/40"
                      title="Open team detail"
                      aria-label={`Open ${t.name} team detail`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ArrowRight size={12} />
                    </Link>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTeam(t.id);
                        setEditTeamName(t.name);
                      }}
                      className="p-1 rounded hover:bg-white/40 dark:hover:bg-slate-800/40"
                      title="Rename"
                      aria-label={`Rename ${t.name}`}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTeam(t);
                      }}
                      className="p-1 rounded hover:bg-white/40 dark:hover:bg-slate-800/40 text-red-600 dark:text-red-400"
                      title="Delete"
                      aria-label={`Delete ${t.name}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                }
              />
            ),
          )}
          {counts.noTeam > 0 && (
            <FilterChip
              label="No team"
              count={counts.noTeam}
              active={filter === "none"}
              onClick={() => setFilter(filter === "none" ? null : "none")}
              muted
            />
          )}
          <button
            onClick={() => setTeamOpen(true)}
            className="inline-flex items-center gap-1 h-9 px-3 rounded-full border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 hover:border-brand hover:text-brand-dark dark:hover:text-brand-light transition-colors"
          >
            <Plus size={12} /> New team
          </button>
        </div>
      </div>

      {/* Users toolbar --------------------------------------------------- */}
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              />
              <Input
                placeholder="Search name, email, or position…"
                className="pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {filteredUsers.length} / {counts.total}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Users table ----------------------------------------------------- */}
      <Card>
        <CardBody className="p-0">
          {usersQ.isLoading && <TableSkeleton cols={8} rows={6} />}
          {!usersQ.isLoading && filteredUsers.length === 0 && (
            <EmptyState
              title={allUsers.length ? "No matches" : "No users yet"}
              description={
                allUsers.length
                  ? "Try clearing the team filter or changing your search."
                  : "Invite the first user — use the “+ New user” button."
              }
            />
          )}
          {filteredUsers.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Users</caption>
                <thead className="bg-slate-50 dark:bg-slate-900/60 border-y border-slate-200 dark:border-slate-800">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Member</th>
                    <th className="px-4 py-2 font-medium">Team</th>
                    <th className="px-4 py-2 font-medium">Position</th>
                    <th className="px-4 py-2 font-medium text-right">Started</th>
                    <th className="px-4 py-2 font-medium text-right">Active</th>
                    <th className="px-4 py-2 font-medium text-right">Idle</th>
                    <th className="px-4 py-2 font-medium text-right">Break</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-brand-tint/30 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${statusColor(u.status)}`} />
                          <span className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400">
                            {statusLabel(u.status)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/users/${u.id}`} className="block hover:text-brand-dark dark:hover:text-brand-light">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{u.name}</span>
                            {u.role === "admin" && (
                              <span className="text-[10px] uppercase tracking-wider text-brand-dark dark:text-brand-light">admin</span>
                            )}
                            {!u.is_active && (
                              <span className="text-[10px] uppercase tracking-wider text-red-600 dark:text-red-400">inactive</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{u.email}</div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <TeamBadge name={u.team_name} />
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{u.position ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {u.today_started_at ? atTz(u.today_started_at, u.timezone) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-active font-medium">{hms(u.today_active_seconds)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-idle">{hms(u.today_idle_seconds)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-brk">{hms(u.today_break_seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Create user modal ---------------------------------------------- */}
      <Modal
        open={userOpen}
        onClose={() => setUserOpen(false)}
        title="Create user"
        subtitle="They skip email verification and can sign in immediately."
        size="md"
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setUserOpen(false)}>Cancel</Button>
            <Button type="submit" form="create-user-form" disabled={createUserM.isPending}>
              {createUserM.isPending ? "Creating…" : "Create"}
            </Button>
          </>
        }
      >
        <form id="create-user-form" onSubmit={submitUser} className="space-y-3">
          <Input placeholder="Full name" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} required />
          <Input type="email" placeholder="Email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} required />
          <Input placeholder="Position / job title (e.g. Designer, PM)" value={userForm.position} onChange={(e) => setUserForm({ ...userForm, position: e.target.value })} />
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Team</label>
            <TeamSelect value={userForm.team_id} onChange={(id) => setUserForm({ ...userForm, team_id: id })} />
          </div>
          <Input type="password" placeholder="Temporary password (min 8)" minLength={8} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} required />
          <select
            aria-label="Role"
            className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60"
            value={userForm.role}
            onChange={(e) => setUserForm({ ...userForm, role: e.target.value as "user" | "admin" })}
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <Input placeholder="Timezone (IANA)" value={userForm.timezone} onChange={(e) => setUserForm({ ...userForm, timezone: e.target.value })} />
          {userErr && <div className="text-sm text-red-600 dark:text-red-400">{userErr}</div>}
        </form>
      </Modal>

      {/* Create team modal ---------------------------------------------- */}
      <Modal
        open={teamOpen}
        onClose={() => setTeamOpen(false)}
        title="Create a new team"
        subtitle="E.g. Design, Engineering, Accounts. Assign members when creating or editing a user."
        size="sm"
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setTeamOpen(false)}>Cancel</Button>
            <Button type="submit" form="create-team-form" disabled={createTeamM.isPending || !teamName.trim()}>
              {createTeamM.isPending ? "Creating…" : "Create team"}
            </Button>
          </>
        }
      >
        <form id="create-team-form" onSubmit={submitTeam} className="space-y-3">
          <Input
            placeholder="Team name"
            required
            autoFocus
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
          />
          {teamErr && <div className="text-sm text-red-600 dark:text-red-400">{teamErr}</div>}
        </form>
      </Modal>

      {/* Delete team confirm -------------------------------------------- */}
      <ConfirmDialog
        open={!!deleteTeam}
        onClose={() => setDeleteTeam(null)}
        onConfirm={() => deleteTeam && deleteTeamM.mutate(deleteTeam.id)}
        title={deleteTeam ? `Delete "${deleteTeam.name}"?` : ""}
        description={
          deleteTeam?.member_count
            ? `${deleteTeam.member_count} user${deleteTeam.member_count === 1 ? "" : "s"} will keep their account but lose the team link.`
            : "This team has no members."
        }
        confirmLabel="Delete team"
        tone="danger"
        busy={deleteTeamM.isPending}
      />
    </div>
  );
}

/* -------- FilterChip --------------------------------------------------- */

function FilterChip({
  label,
  count,
  active,
  onClick,
  actions,
  muted = false,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  actions?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={`group inline-flex items-center h-9 rounded-full border transition-colors select-none ${
        active
          ? "bg-brand text-white border-brand shadow-sm"
          : muted
            ? "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
            : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:border-brand/50"
      }`}
    >
      <button
        onClick={onClick}
        className="inline-flex items-center gap-2 pl-3 pr-2 h-full text-sm"
      >
        <span className="font-medium truncate max-w-[140px]">{label}</span>
        <span
          className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded-full ${
            active
              ? "bg-white/20 text-white"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
          }`}
        >
          {count}
        </span>
      </button>
      {actions && (
        <div
          className={`flex items-center gap-0.5 pr-2 ${
            active ? "opacity-80" : "opacity-0 group-hover:opacity-100 transition-opacity"
          }`}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
