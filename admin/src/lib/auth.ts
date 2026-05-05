"use client";

const ACCESS_KEY = "fdm.admin.access";
const REFRESH_KEY = "fdm.admin.refresh";
const PROFILE_KEY = "fdm.admin.profile";
const DEVICE_KEY = "fdm.admin.device";

export interface StoredProfile {
  user_id: string;
  name: string;
  email: string;
  role: "user" | "admin";
}

function makeId(): string {
  // Prefer crypto.randomUUID where available; fall back to a timestamp +
  // crypto-random hex for older browsers.
  const c = (typeof crypto !== "undefined" ? crypto : null) as Crypto | null;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export const auth = {
  saveLogin(access: string, refresh: string, profile: StoredProfile) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  },
  saveAccess(access: string) {
    localStorage.setItem(ACCESS_KEY, access);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(PROFILE_KEY);
    // Keep DEVICE_KEY across logouts so the same browser is recognised as
    // the same device for audit / revoke flows.
  },
  getAccess(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACCESS_KEY);
  },
  getRefresh(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(REFRESH_KEY);
  },
  getProfile(): StoredProfile | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as StoredProfile) : null;
  },
  /** Stable per-browser identifier. Random UUID — not derived from
   * userAgent so it can't be spoofed by another origin. */
  getDeviceId(): string {
    if (typeof window === "undefined") return "ssr";
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = makeId();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  },
};
