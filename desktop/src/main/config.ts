/**
 * App-level configuration. Fixed for the session.
 *
 * The default `apiBase` is the production API. We intentionally do NOT read
 * `process.env.FDM_API_BASE` at runtime — env vars on the end user's PC
 * are out of our control. To target a different API for local dev, set
 * `__FDM_API_BASE__` via Vite's `define` (in electron.vite.config.ts) at
 * build time.
 */
declare const __FDM_API_BASE__: string | undefined;

const buildTimeBase: string | undefined =
  typeof __FDM_API_BASE__ !== "undefined" ? __FDM_API_BASE__ : undefined;

export const config = {
  apiBase: buildTimeBase ?? "https://api.fourdm.services",
  sampleIntervalMs: 10_000,        // idle-check cadence
  bucketSeconds: 60,               // one row == 60s of activity
  syncIntervalMs: 60_000,          // push to server every 60s
  maxBackoffMs: 5 * 60_000,        // cap retry interval at 5 min
};
