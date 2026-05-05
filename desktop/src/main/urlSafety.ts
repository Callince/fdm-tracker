/**
 * URL safety helpers for `shell.openExternal`. The renderer / server should
 * never be able to open arbitrary `file://`, `cmd://`, `vscode://` etc.
 */
import { log } from "./logger";

const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:"]);

const MEETING_HOST_ALLOWLIST = [
  /(^|\.)zoom\.us$/i,
  /(^|\.)teams\.microsoft\.com$/i,
  /(^|\.)teams\.live\.com$/i,
  /(^|\.)meet\.google\.com$/i,
  /(^|\.)webex\.com$/i,
  /(^|\.)gotomeeting\.com$/i,
  /(^|\.)gotowebinar\.com$/i,
  /(^|\.)bluejeans\.com$/i,
  /(^|\.)whereby\.com$/i,
  /(^|\.)skype\.com$/i,
  /(^|\.)slack\.com$/i,
];

/** True iff the URL is a plain http(s) link with a host. */
export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname;
  } catch {
    return false;
  }
}

/** True iff the URL points at a known video-meeting host. */
export function isMeetingUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return MEETING_HOST_ALLOWLIST.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

/** True iff the scheme is one we'd ever pass to shell.openExternal. */
export function hasSafeScheme(url: string): boolean {
  try {
    const u = new URL(url);
    return SAFE_SCHEMES.has(u.protocol);
  } catch {
    return false;
  }
}

/** Log + reject a URL we won't open. Returns false so callers can early-exit. */
export function rejectUnsafe(url: string, reason: string): false {
  log.warn("[url-safety] blocked", { reason, url });
  return false;
}
