/**
 * Theme bootstrap + runtime hook.
 *
 * The bootstrap string is injected into <head> via a <script> so the `dark`
 * class lands on <html> before React mounts — no flash of light content on
 * hard refresh.
 */

export type Theme = "light" | "dark";
const STORAGE_KEY = "fdm.theme";

export const themeBootScript = `
try {
  var t = localStorage.getItem("${STORAGE_KEY}");
  if (t === "dark") document.documentElement.classList.add("dark");
} catch (e) {}
`.trim();

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
}

export function setStoredTheme(t: Theme): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, t);
  document.documentElement.classList.toggle("dark", t === "dark");
}
