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
      detail = await r.text();
    }
    const msg =
      (detail as { detail?: string } | null)?.detail ?? `HTTP ${r.status}`;
    throw new ApiError(r.status, typeof msg === "string" ? msg : JSON.stringify(msg), detail);
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
        device_platform: "win32",
        device_fingerprint: `admin-web-${navigator.userAgent.slice(0, 48)}`,
      }),
    });
  },

  logout: () => request<void>("/auth/logout", { method: "POST" }),

  listUsers: () =>
    request<{ users: AdminUserRow[] }>("/admin/users"),

  liveSnapshot: () =>
    request<{ generated_at: string; users: AdminUserRow[] }>("/admin/activity/live"),

  overview: () => request<TeamOverview>("/admin/overview"),

  teamTrend: (fromDate: string, toDate: string) =>
    request<TeamTrend>(`/admin/team-trend?from=${fromDate}&to=${toDate}`),

  getUser: (id: string) =>
    request<AdminUserDetail>(`/admin/users/${id}`),

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

  userDailySummary: (id: string, fromDate: string, toDate: string) =>
    request<DailySummaryList>(
      `/admin/users/${id}/daily-summary?from=${fromDate}&to=${toDate}`,
    ),

  userDayDetails: (id: string, date: string) =>
    request<DayDetail>(`/admin/users/${id}/day-details?date=${date}`),

  getSettings: () => request<OrgSettings>("/admin/settings"),

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

  getMe: () => request<MeProfile>("/me"),

  updateMe: (body: Partial<{ name: string; position: string | null; team_id: string | null; timezone: string }>) =>
    request<MeProfile>("/me", { method: "PATCH", body: JSON.stringify(body) }),

  changePassword: (current: string, next: string) =>
    request<void>("/me/password", {
      method: "POST",
      body: JSON.stringify({ current_password: current, new_password: next }),
    }),

  listTeams: () =>
    request<{ teams: Team[] }>("/admin/teams"),

  createTeam: (name: string) =>
    request<Team>("/admin/teams", { method: "POST", body: JSON.stringify({ name }) }),

  updateTeam: (id: string, name: string) =>
    request<Team>(`/admin/teams/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),

  deleteTeam: (id: string) =>
    request<void>(`/admin/teams/${id}`, { method: "DELETE" }),

  // ---- Meetings ----
  listMeetings: () =>
    request<{ meetings: Meeting[] }>("/admin/meetings"),

  createMeeting: (body: MeetingInput) =>
    request<Meeting>("/admin/meetings", { method: "POST", body: JSON.stringify(body) }),

  updateMeeting: (id: string, body: Partial<MeetingInput>) =>
    request<Meeting>(`/admin/meetings/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  deleteMeeting: (id: string) =>
    request<void>(`/admin/meetings/${id}`, { method: "DELETE" }),

  // ---- Holidays ----
  listHolidays: () =>
    request<{ holidays: Holiday[] }>("/admin/holidays"),

  createHoliday: (body: { date: string; name: string; kind?: "holiday" | "working" }) =>
    request<Holiday>("/admin/holidays", { method: "POST", body: JSON.stringify(body) }),

  deleteHoliday: (id: string) =>
    request<void>(`/admin/holidays/${id}`, { method: "DELETE" }),
};
