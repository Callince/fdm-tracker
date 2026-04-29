/**
 * IPC channel names. All channels use ipcRenderer.invoke → returns a Promise.
 * Event channels (main → renderer) use ipcRenderer.on.
 */

export const IpcChannels = {
  // invoke
  getStatus: "fdm:status:get",
  login: "fdm:auth:login",
  logout: "fdm:auth:logout",
  signup: "fdm:auth:signup",
  verifyEmail: "fdm:auth:verify",
  resendVerification: "fdm:auth:resend",
  startWork: "fdm:session:start",
  endWork: "fdm:session:end",
  startBreak: "fdm:break:start",
  endBreak: "fdm:break:end",
  acknowledgePrivacy: "fdm:privacy:ack",
  setAutoStart: "fdm:autostart:set",
  setDarkMode: "fdm:prefs:darkMode",
  setEodReminder: "fdm:prefs:eodReminder",
  setAutoBreakOnIdle: "fdm:prefs:autoBreakOnIdle",
  setMeetingNotifications: "fdm:prefs:meetingNotifications",
  setMeetingAlarm: "fdm:prefs:meetingAlarm",
  setMeetingReminderMinutes: "fdm:prefs:meetingReminderMinutes",
  listHolidays: "fdm:holidays:list",
  listMyMeetings: "fdm:meetings:listMine",
  openExternal: "fdm:shell:openExternal",
  endBreakById: "fdm:break:endById",
  toggleWidget: "fdm:widget:toggle",
  hideWidget: "fdm:widget:hide",
  updateProfile: "fdm:me:update",
  changePassword: "fdm:me:password",
  exportMyData: "fdm:me:export",
  listPublicTeams: "fdm:teams:listPublic",
  createPublicTeam: "fdm:teams:createPublic",
  dailySummary: "fdm:calendar:summary",
  dayDetail: "fdm:calendar:day",
  rangeTotals: "fdm:calendar:rangeTotals",
  apiBase: "fdm:config:apiBase",

  // events (main → renderer)
  statusUpdate: "fdm:status:update",
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];
