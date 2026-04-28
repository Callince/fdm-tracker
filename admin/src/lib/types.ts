export type LiveStatus = "active" | "idle" | "on_break" | "offline";

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  position: string | null;
  team_id: string | null;
  team_name: string | null;
  timezone: string;
  is_active: boolean;
  status: LiveStatus;
  today_active_seconds: number;
  today_idle_seconds: number;
  today_break_seconds: number;
  last_seen_at: string | null;
}

export interface LoginResponse {
  tokens: {
    access_token: string;
    refresh_token: string;
    token_type: "bearer";
    expires_in: number;
  };
  device: { device_id: string; device_secret: string };
  user_id: string;
  name: string;
  role: "user" | "admin";
  timezone: string;
  is_new_device: boolean;
  idle_threshold_minutes: number;
}

export interface DailySummary {
  date: string;                  // YYYY-MM-DD
  total_active_seconds: number;
  total_idle_seconds: number;
  total_break_seconds: number;
  first_activity_at: string | null;
  last_activity_at: string | null;
}

export interface DailySummaryList {
  timezone: string;
  days: DailySummary[];
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

export interface AdminUserDetail {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  position: string | null;
  team_id: string | null;
  team_name: string | null;
  timezone: string;
  is_active: boolean;
}

export interface Team {
  id: string;
  name: string;
  member_count: number;
}

export interface MeProfile {
  user_id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  position: string | null;
  team_id: string | null;
  team_name: string | null;
  timezone: string;
}

export interface OrgSettings {
  idle_threshold_minutes: number;
  workday_start_hour: number;
  target_hours_per_day: number;
}

export interface TeamOverview {
  total_users: number;
  active_now: number;
  on_break_now: number;
  team_active_seconds_today: number;
  team_break_seconds_today: number;
  team_idle_seconds_today: number;
}

export interface TrendDay {
  date: string;
  active_hours: number;
  idle_hours: number;
  break_hours: number;
}

export interface TeamTrend {
  from_date: string;
  to_date: string;
  days: TrendDay[];
}
