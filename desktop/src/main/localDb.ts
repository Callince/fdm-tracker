/**
 * Local SQLite buffer. Every 60s bucket is written here first; the sync
 * worker then drains to the backend. Break + session starts/ends are also
 * queued so we never lose state to a network blip.
 */
import Database from "better-sqlite3";
import { app } from "electron";
import * as Sentry from "@sentry/electron/main";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { log } from "./logger";

let db: Database.Database | null = null;

function tryIntegrity(d: Database.Database): boolean {
  try {
    const row = d.prepare("PRAGMA integrity_check").get() as { integrity_check?: string } | undefined;
    return row?.integrity_check === "ok";
  } catch {
    return false;
  }
}

/** Best-effort recovery — VACUUM + REINDEX rebuilds the file in place and
 * fixes most "corruption" that's actually just a partially-written page.
 * Returns true if integrity_check passes after the rebuild. */
function tryRecover(d: Database.Database): boolean {
  try {
    d.exec("REINDEX");
    d.exec("VACUUM");
    return tryIntegrity(d);
  } catch {
    return false;
  }
}

function open(): Database.Database {
  if (db) return db;
  const dbPath = path.join(app.getPath("userData"), "buffer.sqlite");
  try {
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    if (!tryIntegrity(db)) {
      // Try in-place repair before nuking. Most "corruption" we see in the
      // wild is a half-written WAL frame after a hard reboot — VACUUM
      // rewrites the main file from the b-tree and clears it.
      log.warn("[localDb] integrity check failed; attempting recover");
      if (tryRecover(db)) {
        log.info("[localDb] recovered via VACUUM/REINDEX");
        return db;
      }
      throw new Error("integrity_check failed and recovery did not succeed");
    }
  } catch (e) {
    // DB is corrupt or unreadable. Quarantine and start fresh — losing
    // unsynced buckets is far better than the app refusing to launch.
    // Tell the user (toast) AND Sentry so we can spot patterns of corruption.
    try { db?.close(); } catch { /* ignore */ }
    db = null;
    let quarantinePath: string | null = null;
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      quarantinePath = `${dbPath}.corrupt-${stamp}`;
      fs.renameSync(dbPath, quarantinePath);
    } catch { /* ignore */ }
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    const reason = (e as Error).message;
    log.error("[localDb] reset due to:", reason, "quarantine=", quarantinePath);
    try {
      Sentry.captureMessage(`localDb reset: ${reason}`, "warning");
    } catch { /* Sentry may not be initialised in dev */ }
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_buckets (
      client_event_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      bucket_start TEXT NOT NULL,          -- ISO 8601 UTC
      active_seconds INTEGER NOT NULL,
      idle_seconds INTEGER NOT NULL,
      keystroke_count INTEGER NOT NULL,
      mouse_event_count INTEGER NOT NULL,
      synced_at TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_activity_unsynced
      ON activity_buckets(synced_at) WHERE synced_at IS NULL;

    CREATE TABLE IF NOT EXISTS pending_sessions (
      local_id TEXT PRIMARY KEY,
      action TEXT NOT NULL,                -- 'start' | 'end'
      session_id TEXT,                     -- filled after start succeeds
      at TEXT NOT NULL,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS pending_breaks (
      local_id TEXT PRIMARY KEY,
      action TEXT NOT NULL,                -- 'start' | 'end'
      session_id TEXT,
      break_id TEXT,
      at TEXT NOT NULL,
      reason TEXT,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS state (
      k TEXT PRIMARY KEY,
      v TEXT NOT NULL
    );
  `);
  return db;
}

export interface PendingBucket {
  client_event_id: string;
  session_id: string;
  bucket_start: string;
  active_seconds: number;
  idle_seconds: number;
  keystroke_count: number;
  mouse_event_count: number;
}

export const localDb = {
  insertBucket(b: Omit<PendingBucket, "client_event_id">): string {
    const id = randomUUID();
    open()
      .prepare(
        `INSERT INTO activity_buckets
         (client_event_id, session_id, bucket_start, active_seconds, idle_seconds, keystroke_count, mouse_event_count)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        b.session_id,
        b.bucket_start,
        b.active_seconds,
        b.idle_seconds,
        b.keystroke_count,
        b.mouse_event_count,
      );
    return id;
  },

  pendingBuckets(limit = 500): PendingBucket[] {
    return open()
      .prepare(
        `SELECT client_event_id, session_id, bucket_start, active_seconds, idle_seconds,
                keystroke_count, mouse_event_count
         FROM activity_buckets WHERE synced_at IS NULL
         ORDER BY bucket_start ASC LIMIT ?`,
      )
      .all(limit) as PendingBucket[];
  },

  markBucketsSynced(ids: string[]) {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    const stmt = open().prepare(
      `UPDATE activity_buckets SET synced_at = ? WHERE client_event_id = ?`,
    );
    const tx = open().transaction((batch: string[]) => {
      for (const id of batch) stmt.run(now, id);
    });
    tx(ids);
  },

  pendingCount(): number {
    const row = open()
      .prepare(`SELECT COUNT(*) AS c FROM activity_buckets WHERE synced_at IS NULL`)
      .get() as { c: number };
    return row.c;
  },

  /** Sum every activity_bucket whose `bucket_start` falls in the half-open
   * range [fromIso, toIso). Includes synced AND pending rows — local data is
   * the source of truth for "today's totals" on the device that's tracking. */
  todayBucketTotals(fromIso: string, toIso: string): { active_seconds: number; idle_seconds: number } {
    const r = open()
      .prepare(
        `SELECT COALESCE(SUM(active_seconds), 0) AS a,
                COALESCE(SUM(idle_seconds), 0)   AS i
         FROM activity_buckets
         WHERE bucket_start >= ? AND bucket_start < ?`,
      )
      .get(fromIso, toIso) as { a: number; i: number };
    return { active_seconds: r.a, idle_seconds: r.i };
  },

  getState(k: string): string | null {
    const r = open().prepare(`SELECT v FROM state WHERE k = ?`).get(k) as { v: string } | undefined;
    return r?.v ?? null;
  },

  setState(k: string, v: string | null) {
    if (v === null) {
      open().prepare(`DELETE FROM state WHERE k = ?`).run(k);
    } else {
      open()
        .prepare(`INSERT INTO state (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`)
        .run(k, v);
    }
  },

  purgeOldSynced(maxAgeDays = 14) {
    const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
    open()
      .prepare(`DELETE FROM activity_buckets WHERE synced_at IS NOT NULL AND synced_at < ?`)
      .run(cutoff);
  },
};
