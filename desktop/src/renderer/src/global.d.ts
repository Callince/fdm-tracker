/**
 * Mirrors the contextBridge surface defined in src/preload/index.ts.
 * Kept here so the renderer tsconfig can pick it up without importing
 * the preload module (which would pull in `electron` types into the web bundle).
 */
import type { AppStatus, DailySummaryList, DayDetail, LoginResult } from "@shared/types";

export {};

declare global {
  interface FdmApi {
    getStatus: () => Promise<AppStatus>;
    apiBase: () => Promise<string>;
    dailySummary: (from: string, to: string) => Promise<DailySummaryList>;
    dayDetail: (date: string) => Promise<DayDetail>;
    rangeTotals: (from: string, to: string) => Promise<{
      from_date: string; to_date: string;
      total_active_seconds: number; total_idle_seconds: number; total_break_seconds: number;
      days_counted: number; target_hours_per_day: number;
    }>;

    login: (email: string, password: string) => Promise<LoginResult>;
    logout: () => Promise<void>;
    signup: (body: { name: string; email: string; password: string; position?: string; team_id?: string | null; timezone?: string }) =>
      Promise<{ ok: boolean; data?: unknown; error?: string }>;
    listPublicTeams: () =>
      Promise<{ ok: boolean; data?: { teams: { id: string; name: string }[] }; error?: string }>;
    createPublicTeam: (name: string) =>
      Promise<{ ok: boolean; data?: { id: string; name: string }; error?: string }>;
    listHolidays: () =>
      Promise<{ ok: boolean; data?: { holidays: { id: string; date: string; name: string; kind: "holiday" | "working" }[] }; error?: string }>;
    listMyMeetings: () =>
      Promise<{
        ok: boolean;
        data?: { meetings: Array<{ id: string; title: string; meeting_link: string | null; meeting_password: string | null; scheduled_at: string; duration_minutes: number; attendees: { id: string; name: string; email: string }[] }> };
        error?: string;
      }>;
    openExternal: (url: string) => Promise<void>;
    setWidgetSize: (size: "mini" | "normal" | "max") => Promise<void>;
    verifyEmail: (email: string, code: string) =>
      Promise<{ ok: boolean; data?: unknown; error?: string }>;
    resendVerification: (email: string) =>
      Promise<{ ok: boolean; data?: unknown; error?: string }>;

    startWork: () => Promise<void>;
    endWork: () => Promise<void>;
    startBreak: () => Promise<void>;
    endBreak: () => Promise<void>;
    endBreakById: (breakId: string) => Promise<void>;

    acknowledgePrivacy: () => Promise<void>;
    setAutoStart: (enabled: boolean) => Promise<void>;
    setDarkMode: (enabled: boolean) => Promise<void>;
    setEodReminder: (hour: number | null) => Promise<void>;
    setAutoBreakOnIdle: (enabled: boolean) => Promise<void>;
    setMeetingNotifications: (enabled: boolean) => Promise<void>;
    setMeetingAlarm: (enabled: boolean) => Promise<void>;
    setMeetingReminderMinutes: (minutes: number) => Promise<void>;
    setAutoLockMinutes: (minutes: number) => Promise<void>;
    toggleWidget: () => Promise<void>;
    hideWidget: () => Promise<void>;

    updateProfile: (body: Partial<{ name: string; position: string | null; team_id: string | null; timezone: string }>) =>
      Promise<{ ok: boolean; error?: string }>;
    changePassword: (current: string, next: string) =>
      Promise<{ ok: boolean; error?: string }>;
    exportMyData: (from: string, to: string) =>
      Promise<{ ok: boolean; path?: string; error?: string }>;

    onStatus: (cb: (s: AppStatus) => void) => () => void;
  }

  interface Window {
    fdm: FdmApi;
  }
}
