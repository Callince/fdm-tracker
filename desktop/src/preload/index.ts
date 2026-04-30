import { contextBridge, ipcRenderer } from "electron";
import { IpcChannels } from "@shared/ipc";
import type { AppStatus, DailySummaryList, DayDetail, LoginResult } from "@shared/types";

const api = {
  // queries
  getStatus: (): Promise<AppStatus> => ipcRenderer.invoke(IpcChannels.getStatus),
  apiBase: (): Promise<string> => ipcRenderer.invoke(IpcChannels.apiBase),
  dailySummary: (from: string, to: string): Promise<DailySummaryList> =>
    ipcRenderer.invoke(IpcChannels.dailySummary, { from, to }),
  dayDetail: (date: string): Promise<DayDetail> =>
    ipcRenderer.invoke(IpcChannels.dayDetail, { date }),

  rangeTotals: (from: string, to: string) =>
    ipcRenderer.invoke(IpcChannels.rangeTotals, { from, to }) as Promise<{
      from_date: string; to_date: string;
      total_active_seconds: number; total_idle_seconds: number; total_break_seconds: number;
      days_counted: number; target_hours_per_day: number;
    }>,

  // auth
  login: (email: string, password: string): Promise<LoginResult> =>
    ipcRenderer.invoke(IpcChannels.login, { email, password }),
  logout: (): Promise<void> => ipcRenderer.invoke(IpcChannels.logout),
  signup: (body: { name: string; email: string; password: string; position?: string; team_id?: string | null; timezone?: string }) =>
    ipcRenderer.invoke(IpcChannels.signup, body) as Promise<{ ok: boolean; data?: unknown; error?: string }>,
  listPublicTeams: () =>
    ipcRenderer.invoke(IpcChannels.listPublicTeams) as Promise<{ ok: boolean; data?: { teams: { id: string; name: string }[] }; error?: string }>,
  createPublicTeam: (name: string) =>
    ipcRenderer.invoke(IpcChannels.createPublicTeam, { name }) as Promise<{ ok: boolean; data?: { id: string; name: string }; error?: string }>,
  listHolidays: () =>
    ipcRenderer.invoke(IpcChannels.listHolidays) as Promise<{ ok: boolean; data?: { holidays: { id: string; date: string; name: string; kind: "holiday" | "working" }[] }; error?: string }>,
  listMyMeetings: () =>
    ipcRenderer.invoke(IpcChannels.listMyMeetings) as Promise<{
      ok: boolean;
      data?: { meetings: Array<{ id: string; title: string; meeting_link: string | null; meeting_password: string | null; scheduled_at: string; duration_minutes: number; attendees: { id: string; name: string; email: string }[] }> };
      error?: string;
    }>,
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.openExternal, url),
  setWidgetSize: (size: "mini" | "normal" | "max"): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.setWidgetHeight, size),
  verifyEmail: (email: string, code: string) =>
    ipcRenderer.invoke(IpcChannels.verifyEmail, { email, code }) as Promise<{ ok: boolean; data?: unknown; error?: string }>,
  resendVerification: (email: string) =>
    ipcRenderer.invoke(IpcChannels.resendVerification, { email }) as Promise<{ ok: boolean; data?: unknown; error?: string }>,

  // tracker controls
  startWork: (): Promise<void> => ipcRenderer.invoke(IpcChannels.startWork),
  endWork: (): Promise<void> => ipcRenderer.invoke(IpcChannels.endWork),
  startBreak: (): Promise<void> => ipcRenderer.invoke(IpcChannels.startBreak),
  endBreak: (): Promise<void> => ipcRenderer.invoke(IpcChannels.endBreak),
  endBreakById: (breakId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.endBreakById, { break_id: breakId }),

  // prefs
  acknowledgePrivacy: (): Promise<void> => ipcRenderer.invoke(IpcChannels.acknowledgePrivacy),
  setAutoStart: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.setAutoStart, enabled),
  setDarkMode: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.setDarkMode, enabled),
  setEodReminder: (hour: number | null): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.setEodReminder, hour),
  setAutoBreakOnIdle: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.setAutoBreakOnIdle, enabled),
  setMeetingNotifications: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.setMeetingNotifications, enabled),
  setMeetingAlarm: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.setMeetingAlarm, enabled),
  setMeetingReminderMinutes: (minutes: number): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.setMeetingReminderMinutes, minutes),

  // floating widget
  toggleWidget: (): Promise<void> => ipcRenderer.invoke(IpcChannels.toggleWidget),
  hideWidget: (): Promise<void> => ipcRenderer.invoke(IpcChannels.hideWidget),

  // self-serve profile
  updateProfile: (body: Partial<{ name: string; position: string | null; team_id: string | null; timezone: string }>) =>
    ipcRenderer.invoke(IpcChannels.updateProfile, body) as Promise<{ ok: boolean; error?: string }>,
  changePassword: (current: string, next: string) =>
    ipcRenderer.invoke(IpcChannels.changePassword, { current, next }) as Promise<{ ok: boolean; error?: string }>,
  exportMyData: (from: string, to: string) =>
    ipcRenderer.invoke(IpcChannels.exportMyData, { from, to }) as Promise<{ ok: boolean; path?: string; error?: string }>,

  // events
  onStatus: (cb: (s: AppStatus) => void) => {
    const handler = (_: unknown, s: AppStatus) => cb(s);
    ipcRenderer.on(IpcChannels.statusUpdate, handler);
    return () => ipcRenderer.removeListener(IpcChannels.statusUpdate, handler);
  },
};

contextBridge.exposeInMainWorld("fdm", api);

export type FdmApi = typeof api;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Window {
    fdm: FdmApi;
  }
}
