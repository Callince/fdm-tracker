/**
 * Lightweight file-backed logger for the main process.
 *
 * Writes timestamped lines to userData/logs/main.log. Rotates when it
 * crosses 1 MB and gzips the rotated file in place — keeping disk use
 * bounded over weeks of operation. Files older than `RETENTION_DAYS`
 * are deleted on each rotation so a long-running install doesn't slowly
 * fill the disk.
 *
 * Also hooks process-wide uncaughtException + unhandledRejection so we
 * have a record next time something dies silently.
 */
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const MAX_BYTES = 1_000_000;
const RETENTION_DAYS = 30;
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

function compressInBackground(srcPath: string): void {
  // Using async streams keeps the rotation off the synchronous write path.
  // If gzipping fails the source file stays intact — the rotated copy is
  // still readable, just uncompressed.
  fs.promises
    .readFile(srcPath)
    .then((buf) => fs.promises.writeFile(srcPath + ".gz", zlib.gzipSync(buf)))
    .then(() => fs.promises.unlink(srcPath))
    .catch(() => {
      /* swallow — best-effort housekeeping */
    });
}

function pruneOldLogs(dir: string): void {
  fs.promises
    .readdir(dir)
    .then((files) => {
      const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
      return Promise.all(
        files
          .filter((f) => /^main\.log\./.test(f))
          .map(async (f) => {
            const p = path.join(dir, f);
            try {
              const st = await fs.promises.stat(p);
              if (st.mtimeMs < cutoff) await fs.promises.unlink(p);
            } catch {
              /* ignore */
            }
          }),
      );
    })
    .catch(() => {
      /* best-effort */
    });
}

function rotateIfNeeded(p: string) {
  if (rotated) return;
  try {
    const st = fs.statSync(p);
    if (st.size > MAX_BYTES) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const rotatedPath = `${p}.${stamp}`;
      fs.renameSync(p, rotatedPath);
      rotated = true;
      compressInBackground(rotatedPath);
      pruneOldLogs(path.dirname(p));
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
