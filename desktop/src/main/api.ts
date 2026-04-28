/**
 * Typed HTTP client. Uses Node 20+ global fetch. JWT + HMAC attach based on route.
 */
import { signRequest } from "./hmac";
import { auth } from "./auth";
import { config } from "./config";
import type {
  DailySummaryList,
  DayDetail,
  UserProfile,
} from "@shared/types";

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

async function tryRefresh(): Promise<boolean> {
  const { refreshToken } = auth.get();
  if (!refreshToken) return false;
  const r = await fetch(`${config.apiBase}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!r.ok) return false;
  const data = (await r.json()) as { access_token: string };
  auth.setAccess(data.access_token);
  return true;
}

interface RequestOpts {
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  sign?: boolean;     // add HMAC header
  auth?: boolean;     // add JWT header
}

async function request<T>(opts: RequestOpts, retry = false): Promise<T> {
  const method = opts.method ?? "GET";
  const bodyStr = opts.body === undefined ? "" : JSON.stringify(opts.body);
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  if (opts.auth !== false) {
    const { accessToken } = auth.get();
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  }
  if (opts.sign) {
    const { deviceSecret } = auth.get();
    if (!deviceSecret) throw new ApiError(0, "no device secret — log in again");
    const { header } = signRequest(deviceSecret, method, opts.path, bodyStr);
    headers["X-Device-Signature"] = header;
  }

  const r = await fetch(`${config.apiBase}${opts.path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : bodyStr,
  });

  if (r.status === 401 && !retry && opts.auth !== false) {
    if (await tryRefresh()) return request<T>(opts, true);
    throw new ApiError(401, "unauthorized");
  }

  if (!r.ok) {
    let detail: unknown;
    try { detail = await r.json(); } catch { detail = await r.text(); }
    const msg = (detail as { detail?: string } | null)?.detail ?? `HTTP ${r.status}`;
    throw new ApiError(r.status, typeof msg === "string" ? msg : JSON.stringify(msg), detail);
  }
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

export const api = {
  async login(email: string, password: string, deviceFingerprint: string, platform: string, label: string): Promise<UserProfile> {
    const data = await request<{
      tokens: { access_token: string; refresh_token: string };
      device: { device_id: string; device_secret: string };
      user_id: string; name: string; role: "user" | "admin";
      timezone: string; idle_threshold_minutes: number;
      target_hours_per_day?: number;
      position?: string | null;
      team_id?: string | null;
      team_name?: string | null;
    }>({
      path: "/auth/login",
      method: "POST",
      body: {
        email, password,
        device_label: label,
        device_platform: platform,
        device_fingerprint: deviceFingerprint,
      },
      auth: false,
    });
    auth.save({
      accessToken: data.tokens.access_token,
      refreshToken: data.tokens.refresh_token,
      deviceId: data.device.device_id,
      deviceSecret: data.device.device_secret,
      profile: {
        user_id: data.user_id,
        name: data.name,
        email,
        role: data.role,
        position: data.position ?? null,
        team_id: data.team_id ?? null,
        team_name: data.team_name ?? null,
        timezone: data.timezone,
        idle_threshold_minutes: data.idle_threshold_minutes,
        target_hours_per_day: data.target_hours_per_day ?? 8,
      },
    });
    return {
      user_id: data.user_id, name: data.name, email, role: data.role,
      position: data.position ?? null,
      team_id: data.team_id ?? null,
      team_name: data.team_name ?? null,
      timezone: data.timezone, idle_threshold_minutes: data.idle_threshold_minutes,
      target_hours_per_day: data.target_hours_per_day ?? 8,
    };
  },

  async signup(body: { name: string; email: string; password: string; position?: string; team_id?: string | null; timezone?: string }) {
    return request<{ id: string; email: string; verification_required: boolean; message: string }>({
      path: "/auth/signup", method: "POST", body, auth: false,
    });
  },

  async listPublicTeams() {
    return request<{ teams: { id: string; name: string }[] }>({
      path: "/teams", auth: false,
    });
  },

  async createPublicTeam(name: string) {
    return request<{ id: string; name: string }>({
      path: "/teams", method: "POST", body: { name }, auth: false,
    });
  },

  async verifyEmail(email: string, code: string) {
    return request<{ message: string }>({
      path: "/auth/verify-email", method: "POST", body: { email, code }, auth: false,
    });
  },

  async resendVerification(email: string) {
    return request<{ message: string }>({
      path: "/auth/resend-verification", method: "POST", body: { email }, auth: false,
    });
  },

  logout: () => request<void>({ path: "/auth/logout", method: "POST" }),

  startSession: (startedAt: string) =>
    request<{ session_id: string; started_at: string }>({
      path: "/sessions/start", method: "POST", body: { started_at: startedAt }, sign: true,
    }),

  endSession: (sessionId: string, endedAt: string) =>
    request<{ session_id: string; ended_at: string }>({
      path: "/sessions/end", method: "POST",
      body: { session_id: sessionId, ended_at: endedAt }, sign: true,
    }),

  startBreak: (sessionId: string, startedAt: string, reason?: string | null) =>
    request<{ break_id: string }>({
      path: "/breaks/start", method: "POST",
      body: { session_id: sessionId, started_at: startedAt, reason: reason ?? null }, sign: true,
    }),

  endBreak: (breakId: string, endedAt: string) =>
    request<{ break_id: string; ended_at: string }>({
      path: "/breaks/end", method: "POST",
      body: { break_id: breakId, ended_at: endedAt }, sign: true,
    }),

  pushActivityBatch: (buckets: unknown[]) =>
    request<{ accepted: number; deduplicated: number; rejected: number; reasons: string[] }>({
      path: "/activity/batch", method: "POST", body: { buckets }, sign: true,
    }),

  dailySummary: (from: string, to: string) =>
    request<DailySummaryList>({ path: `/me/daily-summary?from=${from}&to=${to}` }),

  rangeTotals: (from: string, to: string) =>
    request<{
      from_date: string; to_date: string;
      total_active_seconds: number; total_idle_seconds: number; total_break_seconds: number;
      days_counted: number; target_hours_per_day: number;
    }>({ path: `/me/range-totals?from=${from}&to=${to}` }),

  dayDetail: (date: string) =>
    request<DayDetail>({ path: `/me/day-details?date=${date}` }),

  getMe: () =>
    request<{
      user_id: string; name: string; email: string;
      role: "user" | "admin"; position: string | null;
      team_id: string | null; team_name: string | null;
      timezone: string;
    }>({ path: "/me" }),

  updateMe: (body: Partial<{ name: string; position: string | null; team_id: string | null; timezone: string }>) =>
    request<{
      user_id: string; name: string; email: string;
      role: "user" | "admin"; position: string | null;
      team_id: string | null; team_name: string | null;
      timezone: string;
    }>({ path: "/me", method: "PATCH", body }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>({
      path: "/me/password",
      method: "POST",
      body: { current_password: currentPassword, new_password: newPassword },
    }),

  exportMyDataUrl: (from: string, to: string) =>
    `${config.apiBase}/me/export?from=${from}&to=${to}`,
};
