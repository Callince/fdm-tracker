"use client";

import { auth } from "./auth";
import type {
  AdminUserDetail,
  AdminUserRow,
  DailySummaryList,
  DayDetail,
  Holiday,
  LoginResponse,
  Meeting,
  MeetingInput,
  MeProfile,
  OrgSettings,
  Team,
  TeamOverview,
  TeamTrend,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

/** Extract a user-facing message from a FastAPI-style error payload.
 * Handles `{detail: string}`, `{detail: [{msg: string}, …]}` (validation errors),
 * raw strings, and falls back to `null`. */
function extractErrorMessage(detail: unknown): string | null {
  if (detail == null) return null;
  if (typeof detail === "string") return detail;
  if (typeof detail !== "object") return null;
  const d = (detail as { detail?: unknown }).detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    const first = d.find((x): x is { msg: string } =>
      !!x && typeof x === "object" && typeof (x as { msg?: unknown }).msg === "string",
    );
    if (first) return first.msg;
  }
  return null;
}

async function refreshAccess(): Promise<string | null> {
  const refresh = auth.getRefresh();
  if (!refresh) return null;
  const r = await fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!r.ok) return null;
  const data = (await r.json()) as { access_token: string };
  auth.saveAccess(data.access_token);
  return data.access_token;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  isRetry = false,
): Promise<T> {
  const access = auth.getAccess();
  const headers = new Headers(init.headers);
  if (access) headers.set("Authorization", `Bearer ${access}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // RequestInit.signal flows in via `init` when the caller passes it (used
  // by TanStack Query queryFn cancellation on route change / refetch).
  const r = await fetch(`${BASE}${path}`, { ...init, headers });

  if (r.status === 401 && !isRetry) {
    const fresh = await refreshAccess();
    if (fresh) return request<T>(path, init, true);
    auth.clear();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(401, "unauthorized");
  }

  if (!r.ok) {
    let detail: unknown;
    try {
      detail = await r.json();
    } catch {
      try { detail = await r.text(); } catch { detail = null; }
    }
    const msg = extractErrorMessage(detail) ?? `HTTP ${r.status}`;
    throw new ApiError(r.status, msg, detail);
  }

  if (r.status === 204) return undefined as T;
  const ct = r.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return (await r.json()) as T;
  return (await r.text()) as unknown as T;
}

export const api = {
  async login(email: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        device_label: "admin-web",
        device_platform: "web",
        device_fingerprint: auth.getDeviceId(),
      }),
    });
  },

  logout: () => request<void>("/auth/logout", { method: "POST" }),

  listUsers: (signal?: AbortSignal) =>
    request<{ users: AdminUserRow[] }>("/admin/users", { signal }),

  liveSnapshot: (signal?: AbortSignal) =>
    request<{ generated_at: string; users: AdminUserRow[] }>("/admin/activity/live", { signal }),

  overview: (signal?: AbortSignal) =>
    request<TeamOverview>("/admin/overview", { signal }),

  teamTrend: (fromDate: string, toDate: string, signal?: AbortSignal) =>
    request<TeamTrend>(`/admin/team-trend?from=${fromDate}&to=${toDate}`, { signal }),

  getUser: (id: string, signal?: AbortSignal) =>
    request<AdminUserDetail>(`/admin/users/${id}`, { signal }),

  createUser: (body: {
    name: string;
    email: string;
    password: string;
    role: "user" | "admin";
    position?: string | null;
    team_id?: string | null;
    timezone: string;
  }) =>
    request<AdminUserDetail>("/admin/users", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateUser: (
    id: string,
    body: Partial<{
      name: string;
      email: string;
      password: string;
      role: "user" | "admin";
      position: string | null;
      team_id: string | null;
      timezone: string;
      is_active: boolean;
    }>,
  ) =>
    request<AdminUserDetail>(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  userDailySummary: (id: string, fromDate: string, toDate: string, signal?: AbortSignal) =>
    request<DailySummaryList>(
      `/admin/users/${id}/daily-summary?from=${fromDate}&to=${toDate}`,
      { signal },
    ),

  userDayDetails: (id: string, date: string, signal?: AbortSignal) =>
    request<DayDetail>(`/admin/users/${id}/day-details?date=${date}`, { signal }),

  getSettings: (signal?: AbortSignal) => request<OrgSettings>("/admin/settings", { signal }),

  updateSettings: (body: OrgSettings) =>
    request<OrgSettings>("/admin/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  reportsUrl: (
    fromDate: string,
    toDate: string,
    format: "csv" | "json",
    opts: { includeZero?: boolean; teamId?: string | null; groupBy?: "user" | "team" } = {},
  ) => {
    const params = new URLSearchParams({ from: fromDate, to: toDate, format });
    if (opts.includeZero) params.set("include_zero", "true");
    if (opts.teamId) params.set("team_id", opts.teamId);
    if (opts.groupBy) params.set("group_by", opts.groupBy);
    return `${BASE}/admin/reports?${params.toString()}`;
  },

  async downloadReport(
    fromDate: string,
    toDate: string,
    format: "csv" | "json",
    opts: { includeZero?: boolean; teamId?: string | null; groupBy?: "user" | "team" } = {},
  ): Promise<Blob> {
    const access = auth.getAccess();
    const r = await fetch(api.reportsUrl(fromDate, toDate, format, opts), {
      headers: access ? { Authorization: `Bearer ${access}` } : undefined,
    });
    if (!r.ok) throw new ApiError(r.status, `report download ${r.status}`);
    return r.blob();
  },

  getMe: (signal?: AbortSignal) => request<MeProfile>("/me", { signal }),

  updateMe: (body: Partial<{ name: string; position: string | null; team_id: string | null; timezone: string }>) =>
    request<MeProfile>("/me", { method: "PATCH", body: JSON.stringify(body) }),

  changePassword: (current: string, next: string) =>
    request<void>("/me/password", {
      method: "POST",
      body: JSON.stringify({ current_password: current, new_password: next }),
    }),

  listTeams: (signal?: AbortSignal) =>
    request<{ teams: Team[] }>("/admin/teams", { signal }),

  createTeam: (name: string) =>
    request<Team>("/admin/teams", { method: "POST", body: JSON.stringify({ name }) }),

  updateTeam: (id: string, name: string) =>
    request<Team>(`/admin/teams/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),

  deleteTeam: (id: string) =>
    request<void>(`/admin/teams/${id}`, { method: "DELETE" }),

  // ---- Meetings ----
  listMeetings: (signal?: AbortSignal) =>
    request<{ meetings: Meeting[] }>("/admin/meetings", { signal }),

  createMeeting: (body: MeetingInput) =>
    request<Meeting>("/admin/meetings", { method: "POST", body: JSON.stringify(body) }),

  updateMeeting: (id: string, body: Partial<MeetingInput>) =>
    request<Meeting>(`/admin/meetings/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  deleteMeeting: (id: string) =>
    request<void>(`/admin/meetings/${id}`, { method: "DELETE" }),

  // ---- Holidays ----
  listHolidays: (signal?: AbortSignal) =>
    request<{ holidays: Holiday[] }>("/admin/holidays", { signal }),

  createHoliday: (body: { date: string; name: string; kind?: "holiday" | "working" }) =>
    request<Holiday>("/admin/holidays", { method: "POST", body: JSON.stringify(body) }),

  /** Atomic upsert by date — replaces the prior delete-then-create pattern
   * so an interrupted network can't leave the org with a missing holiday.
   * Backend treats this as: if a holiday exists for `body.date`, update its
   * name + kind; otherwise create one. */
  upsertHoliday: (body: { date: string; name: string; kind?: "holiday" | "working" }) =>
    request<Holiday>("/admin/holidays", { method: "PUT", body: JSON.stringify(body) }),

  deleteHoliday: (id: string) =>
    request<void>(`/admin/holidays/${id}`, { method: "DELETE" }),
};
