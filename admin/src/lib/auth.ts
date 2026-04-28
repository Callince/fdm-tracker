"use client";

const ACCESS_KEY = "fdm.admin.access";
const REFRESH_KEY = "fdm.admin.refresh";
const PROFILE_KEY = "fdm.admin.profile";

export interface StoredProfile {
  user_id: string;
  name: string;
  email: string;
  role: "user" | "admin";
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
};
