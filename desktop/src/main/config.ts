/**
 * App-level configuration. Read from env at startup, fixed for the session.
 * The API base can be overridden per-build with VITE_API_BASE or FDM_API_BASE.
 */
export const config = {
  apiBase: process.env.FDM_API_BASE ?? "http://127.0.0.1:8000",
  sampleIntervalMs: 10_000,        // idle-check cadence
  bucketSeconds: 60,               // one row == 60s of activity
  syncIntervalMs: 60_000,          // push to server every 60s
  maxBackoffMs: 5 * 60_000,        // cap retry interval at 5 min
};
