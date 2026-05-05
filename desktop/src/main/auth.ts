/**
 * Persistent auth + device state using electron-store.
 *
 * Sensitive fields (accessToken, refreshToken, deviceSecret) are encrypted
 * via Electron's safeStorage — backed by:
 *   - macOS Keychain
 *   - Windows DPAPI
 *   - libsecret on Linux (best-effort)
 *
 * On first read of a profile that was written by an older version (plaintext),
 * the values are migrated transparently and re-saved encrypted.
 *
 * On disk: %APPDATA%/FDM Tracker/config.json (Windows) or
 *          ~/Library/Application Support/FDM Tracker/... (macOS).
 */
import { safeStorage } from "electron";
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
    workday_start_hour: number;
  } | null;
}

interface RawAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  deviceId: string | null;
  deviceSecret: string | null;
  profile: AuthState["profile"];
  encVersion?: number;
}

interface AppPrefs {
  privacyAcknowledged: boolean;
  autoStart: boolean;
  deviceFingerprint: string | null;   // stable per install
  endOfDayReminderHour: number | null;  // null = disabled, 0–23
  darkMode: boolean;
  autoBreakOnIdle: boolean;
  meetingNotificationsEnabled: boolean;
  meetingAlarmEnabled: boolean;
  meetingReminderMinutes: number;
  autoLockMinutes: number;            // 0 = disabled, otherwise lock after N min idle
}

const ENC_VERSION = 1;
const ENC_PREFIX = "enc:v1:";

/** Encrypt a value using safeStorage. Returns plaintext if encryption is
 * unavailable (Linux without libsecret, etc.) so the app keeps working. */
function encrypt(plain: string | null): string | null {
  if (plain == null) return null;
  if (!safeStorage.isEncryptionAvailable()) return plain;
  const buf = safeStorage.encryptString(plain);
  return ENC_PREFIX + buf.toString("base64");
}

function decrypt(stored: string | null): string | null {
  if (stored == null) return null;
  if (!stored.startsWith(ENC_PREFIX)) return stored;   // legacy plaintext
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const buf = Buffer.from(stored.slice(ENC_PREFIX.length), "base64");
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
}

const authStore = new Store<RawAuthState>({
  name: "auth",
  defaults: {
    accessToken: null,
    refreshToken: null,
    deviceId: null,
    deviceSecret: null,
    profile: null,
  },
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
    meetingNotificationsEnabled: true,
    meetingAlarmEnabled: true,
    meetingReminderMinutes: 5,
    autoLockMinutes: 30,
  },
});

function readAndMigrate(): AuthState {
  const stored: RawAuthState = {
    accessToken: authStore.get("accessToken"),
    refreshToken: authStore.get("refreshToken"),
    deviceId: authStore.get("deviceId"),
    deviceSecret: authStore.get("deviceSecret"),
    profile: authStore.get("profile"),
    encVersion: authStore.get("encVersion"),
  };
  const accessToken = decrypt(stored.accessToken);
  const refreshToken = decrypt(stored.refreshToken);
  const deviceSecret = decrypt(stored.deviceSecret);

  // Migrate plaintext values to encrypted on first read after upgrade.
  const needsMigration =
    stored.encVersion !== ENC_VERSION &&
    safeStorage.isEncryptionAvailable() &&
    (
      (stored.accessToken && !stored.accessToken.startsWith(ENC_PREFIX)) ||
      (stored.refreshToken && !stored.refreshToken.startsWith(ENC_PREFIX)) ||
      (stored.deviceSecret && !stored.deviceSecret.startsWith(ENC_PREFIX))
    );
  if (needsMigration) {
    authStore.set({
      accessToken: encrypt(accessToken),
      refreshToken: encrypt(refreshToken),
      deviceId: stored.deviceId,
      deviceSecret: encrypt(deviceSecret),
      profile: stored.profile,
      encVersion: ENC_VERSION,
    });
  }

  const profile = stored.profile;
  if (profile && typeof profile.target_hours_per_day !== "number") {
    profile.target_hours_per_day = 8;
  }
  // Forward-migration: profiles persisted before workday_start_hour was
  // added default to 04:00 (the server default). Avoids forcing a re-login
  // on existing 0.3.9 installs.
  if (profile && typeof profile.workday_start_hour !== "number") {
    profile.workday_start_hour = 4;
  }
  return {
    accessToken,
    refreshToken,
    deviceId: stored.deviceId,
    deviceSecret,
    profile,
  };
}

export const auth = {
  get: (): AuthState => readAndMigrate(),
  save(state: AuthState) {
    authStore.set({
      accessToken: encrypt(state.accessToken),
      refreshToken: encrypt(state.refreshToken),
      deviceId: state.deviceId,
      deviceSecret: encrypt(state.deviceSecret),
      profile: state.profile,
      encVersion: ENC_VERSION,
    });
  },
  setAccess(token: string) {
    authStore.set("accessToken", encrypt(token));
    authStore.set("encVersion", ENC_VERSION);
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
    meetingNotificationsEnabled: prefsStore.get("meetingNotificationsEnabled") ?? true,
    meetingAlarmEnabled: prefsStore.get("meetingAlarmEnabled") ?? true,
    meetingReminderMinutes: prefsStore.get("meetingReminderMinutes") ?? 5,
    autoLockMinutes: prefsStore.get("autoLockMinutes") ?? 30,
  }),
  set<K extends keyof AppPrefs>(key: K, value: AppPrefs[K]) {
    prefsStore.set(key, value);
  },
};
