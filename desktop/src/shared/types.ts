export type LiveStatus = "offline" | "idle" | "active" | "on_break";
export type ConnectionState = "online" | "offline";

export interface UserProfile {
  user_id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  position: string | null;
  team_id: string | null;
  team_name: string | null;
  timezone: string;
  idle_threshold_minutes: number;
  target_hours_per_day: number;
  /** Hour of day (0-23, local) that a tracker day rolls over. Default 4.
   * Mirrors the server's workday_start_hour so the desktop's "today" totals
   * align with the server's day_detail / daily_summary windows. */
  workday_start_hour: number;
}

export interface TeamBrief {
  id: string;
  name: string;
}

export interface TodaySessionEntry {
  kind: "session" | "break";
  id: string;
  session_id?: string;           // for breaks — the session they belong to
  started_at: string;
  ended_at: string | null;
  reason?: string | null;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResult {
  ok: boolean;
  profile?: UserProfile;
  error?: string;
}

export interface AppStatus {
  signed_in: boolean;
  profile?: UserProfile;
  session_active: boolean;
  on_break: boolean;
  session_started_at: string | null;   // ISO UTC of current session start
  break_started_at: string | null;     // ISO UTC of current break start
  today_active_seconds: number;
  today_idle_seconds: number;
  today_break_seconds: number;
  today_entries: TodaySessionEntry[];   // sessions + breaks, in order
  pending_sync_count: number;
  last_sync_ok_at: string | null;
  last_sync_error: string | null;
  connection: ConnectionState;
  live_state: LiveStatus;
  privacy_acknowledged: boolean;
  auto_start: boolean;
  end_of_day_reminder_hour: number | null;   // 0-23, null = disabled
  dark_mode: boolean;
  auto_break_on_idle: boolean;
  meeting_notifications_enabled: boolean;
  meeting_alarm_enabled: boolean;
  meeting_reminder_minutes: number;
  auto_lock_minutes: number;
  accessibility_granted: boolean;
  widget_visible: boolean;
}

export interface DailySummary {
  date: string;
  total_active_seconds: number;
  total_idle_seconds: number;
  total_break_seconds: number;
  first_activity_at: string | null;
  last_activity_at: string | null;
}

export interface SessionOut {
  id: string;
  started_at: string;
  ended_at: string | null;
}

export interface BreakOut {
  id: string;
  session_id: string;
  started_at: string;
  ended_at: string | null;
  reason: string | null;
}

export interface ActivityBucketOut {
  bucket_start: string;
  active_seconds: number;
  idle_seconds: number;
  keystroke_count: number;
  mouse_event_count: number;
}

export interface DayDetail {
  user_id: string;
  date: string;
  timezone: string;
  sessions: SessionOut[];
  breaks: BreakOut[];
  buckets: ActivityBucketOut[];
  totals: DailySummary;
}

export interface DailySummaryList {
  timezone: string;
  days: DailySummary[];
}

export type HolidayKind = "holiday" | "working";

export interface Holiday {
  id: string;
  date: string;        // YYYY-MM-DD
  name: string;
  kind: HolidayKind;
}

/**
 * Wire format for `POST /activity/batch`. Produced by the local SQLite buffer
 * (`localDb.pendingBuckets`), consumed by the typed API client. Sharing the
 * shape across producer and consumer means a server-side schema change is
 * caught at compile time instead of silently dropping fields.
 */
export interface ActivityBucketUpload {
  client_event_id: string;
  session_id: string;
  bucket_start: string;          // ISO 8601 UTC
  active_seconds: number;
  idle_seconds: number;
  keystroke_count: number;
  mouse_event_count: number;
}

export interface ActivityBatchResponse {
  accepted: number;
  deduplicated: number;
  rejected: number;
  reasons: string[];
}
