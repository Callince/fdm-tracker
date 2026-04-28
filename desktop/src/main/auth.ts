/**
 * Persistent auth + device state using electron-store.
 * On disk: %APPDATA%/fdm-tracker/config.json (Windows) or ~/Library/Application Support/...
 */
import Store from "electron-store";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  deviceId: string | null;
  deviceSecret: string | null;
  profile: {
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
  } | null;
}

interface AppPrefs {
  privacyAcknowledged: boolean;
  autoStart: boolean;
  deviceFingerprint: string | null;   // stable per install
  endOfDayReminderHour: number | null;  // null = disabled, 0–23
  darkMode: boolean;
  autoBreakOnIdle: boolean;
}

const authStore = new Store<AuthState>({
  name: "auth",
  defaults: { accessToken: null, refreshToken: null, deviceId: null, deviceSecret: null, profile: null },
});

const prefsStore = new Store<AppPrefs>({
  name: "prefs",
  defaults: {
    privacyAcknowledged: false,
    autoStart: false,
    deviceFingerprint: null,
    endOfDayReminderHour: null,
    darkMode: false,
    autoBreakOnIdle: false,
  },
});

export const auth = {
  get: (): AuthState => {
    const profile = authStore.get("profile");
    // Default-fill target_hours_per_day for profiles persisted before the
    // field existed; it'll be overwritten on the next login/refresh.
    if (profile && typeof profile.target_hours_per_day !== "number") {
      profile.target_hours_per_day = 8;
    }
    return {
      accessToken: authStore.get("accessToken"),
      refreshToken: authStore.get("refreshToken"),
      deviceId: authStore.get("deviceId"),
      deviceSecret: authStore.get("deviceSecret"),
      profile,
    };
  },
  save(state: AuthState) {
    authStore.set(state);
  },
  setAccess(token: string) {
    authStore.set("accessToken", token);
  },
  setProfile(p: AuthState["profile"]) {
    authStore.set("profile", p);
  },
  clear() {
    authStore.clear();
  },
};

export const prefs = {
  get: (): AppPrefs => ({
    privacyAcknowledged: prefsStore.get("privacyAcknowledged"),
    autoStart: prefsStore.get("autoStart"),
    deviceFingerprint: prefsStore.get("deviceFingerprint"),
    endOfDayReminderHour: prefsStore.get("endOfDayReminderHour"),
    darkMode: prefsStore.get("darkMode"),
    autoBreakOnIdle: prefsStore.get("autoBreakOnIdle"),
  }),
  set<K extends keyof AppPrefs>(key: K, value: AppPrefs[K]) {
    prefsStore.set(key, value);
  },
};
