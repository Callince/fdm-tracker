/**
 * Lightweight file-backed logger for the main process.
 *
 * Writes timestamped lines to userData/logs/main.log. Rotates when it
 * crosses 1 MB. Hooks process-wide uncaughtException + unhandledRejection
 * so we have a record next time something dies silently.
 */
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

const MAX_BYTES = 1_000_000;
let logPath: string | null = null;
let rotated = false;

function getLogPath(): string {
  if (logPath) return logPath;
  const dir = path.join(app.getPath("userData"), "logs");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* best-effort */
  }
  logPath = path.join(dir, "main.log");
  return logPath;
}

function rotateIfNeeded(p: string) {
  if (rotated) return;
  try {
    const st = fs.statSync(p);
    if (st.size > MAX_BYTES) {
      fs.renameSync(p, p + ".1");
      rotated = true;
    }
  } catch {
    /* file may not exist yet */
  }
}

function write(level: string, parts: unknown[]) {
  const p = getLogPath();
  rotateIfNeeded(p);
  const line = `${new Date().toISOString()} [${level}] ${parts.map((x) => {
    if (x instanceof Error) return `${x.message}\n${x.stack ?? ""}`;
    if (typeof x === "string") return x;
    try { return JSON.stringify(x); } catch { return String(x); }
  }).join(" ")}\n`;
  try { fs.appendFileSync(p, line); } catch { /* swallow */ }
}

export const log = {
  info: (...parts: unknown[]) => write("INFO", parts),
  warn: (...parts: unknown[]) => write("WARN", parts),
  error: (...parts: unknown[]) => write("ERROR", parts),
  path: () => getLogPath(),
};

/** Install global handlers — call once during app bootstrap. */
export function installGlobalErrorHandlers() {
  process.on("uncaughtException", (err) => {
    log.error("uncaughtException", err);
  });
  process.on("unhandledRejection", (reason) => {
    log.error("unhandledRejection", reason);
  });
}
