/**
 * 60-second aggregator + background push to backend.
 *
 * Every `sampleIntervalMs` (10s) the idle monitor emits a sample. We
 * accumulate active/idle seconds within the current 60s window. At bucket
 * close we drain the input counters and insert a row into the local SQLite
 * buffer. A separate timer drains the buffer to the server every
 * `syncIntervalMs` (60s) with exponential backoff on failure.
 */
import { api, ApiError } from "./api";
import { auth } from "./auth";
import { config } from "./config";
import { idleMonitor, type Sample } from "./idleMonitor";
import { inputCounter } from "./inputCounter";
import { localDb } from "./localDb";
import { log } from "./logger";

type OnStatus = (msg: { online: boolean; lastOkAt: string | null; lastError: string | null; pending: number }) => void;
type OnSampleTick = () => void;

let bucketStart = 0;               // epoch ms
let activeAccum = 0;               // seconds this bucket has been "active"
let idleAccum = 0;                 // seconds this bucket has been "idle"
let currentSessionId: string | null = null;
let running = false;
let syncTimer: NodeJS.Timeout | null = null;
let backoff = 0;
let lastOkAt: string | null = null;
let lastError: string | null = null;
let statusListener: OnStatus | null = null;
// Optional per-sample listener used by the IPC layer to push fresh status
// to the renderer every ~10s, so live totals stay aligned with the wall
// clock instead of lagging behind the 30s poller.
let sampleTickListener: OnSampleTick | null = null;

function emitStatus(online: boolean) {
  if (!statusListener) return;
  statusListener({
    online,
    lastOkAt,
    lastError,
    pending: localDb.pendingCount(),
  });
}

function closeBucket(now: number) {
  if (!currentSessionId || bucketStart === 0) return;
  const totalElapsed = Math.round((now - bucketStart) / 1000);
  if (totalElapsed <= 0) return;
  const counts = inputCounter.drain();
  // First bucket — gets any tracked active/idle + the input counts.
  const firstSize = Math.min(config.bucketSeconds, totalElapsed);
  const firstActive = Math.min(activeAccum, firstSize);
  const firstIdle = Math.max(0, firstSize - firstActive);
  localDb.insertBucket({
    session_id: currentSessionId,
    bucket_start: new Date(bucketStart).toISOString(),
    active_seconds: firstActive,
    idle_seconds: firstIdle,
    keystroke_count: counts.keystrokes,
    mouse_event_count: counts.mouseEvents,
  });
  // Backfill any remaining time as idle-only 60s buckets. This covers
  // sleep / lid-close / lock-screen gaps that span more than a single
  // 60s bucket — without this, a 2-hour nap would collapse into a
  // single 60s bucket and the timeline would have an empty stretch.
  let cursor = bucketStart + firstSize * 1000;
  let remaining = totalElapsed - firstSize;
  while (remaining > 0) {
    const seconds = Math.min(config.bucketSeconds, remaining);
    localDb.insertBucket({
      session_id: currentSessionId,
      bucket_start: new Date(cursor).toISOString(),
      active_seconds: 0,
      idle_seconds: seconds,
      keystroke_count: 0,
      mouse_event_count: 0,
    });
    cursor += seconds * 1000;
    remaining -= seconds;
  }
  // advance the window; carry no residual
  bucketStart = now;
  activeAccum = 0;
  idleAccum = 0;
}

function onSample(s: Sample) {
  if (!currentSessionId) return;
  if (bucketStart === 0) bucketStart = s.timestamp;
  const elapsedSinceBucket = (s.timestamp - bucketStart) / 1000;
  if (elapsedSinceBucket >= config.bucketSeconds) {
    closeBucket(s.timestamp);
  }
  // Each sample represents the interval [sample-sampleInterval, sample].
  const windowSeconds = config.sampleIntervalMs / 1000;
  if (s.isActive) activeAccum += windowSeconds;
  else idleAccum += windowSeconds;
  // Fire the tick AFTER accumulating so listeners (the IPC pushStatus)
  // see the latest counts. Cheap — at most one ipc.send per 10 seconds.
  sampleTickListener?.();
}

async function drainToServer() {
  const buckets = localDb.pendingBuckets(200);
  if (buckets.length === 0) {
    emitStatus(true);
    return;
  }
  try {
    const res = await api.pushActivityBatch(buckets);
    const okIds = buckets.map((b) => b.client_event_id);
    // Server dedupes; we mark all sent as synced regardless of accepted vs dedup
    // (both outcomes mean the server has the data).
    localDb.markBucketsSynced(okIds);
    lastOkAt = new Date().toISOString();
    lastError = null;
    backoff = 0;
    if (res.rejected > 0) {
      log.warn("[sync] server rejected", res.rejected, res.reasons.slice(0, 3));
    }
    emitStatus(true);
  } catch (e) {
    const err = e instanceof ApiError ? `${e.status}: ${e.message}` : (e as Error).message;
    lastError = err;
    backoff = Math.min(config.maxBackoffMs, backoff === 0 ? 15_000 : backoff * 2);
    emitStatus(false);
  }
}

function scheduleSync() {
  if (!running) return;
  const delay = backoff > 0 ? backoff : config.syncIntervalMs;
  syncTimer = setTimeout(async () => {
    await drainToServer();
    scheduleSync();
  }, delay);
}

export const syncWorker = {
  start(idleThresholdMinutes: number, onStatus: OnStatus) {
    if (running) return;
    statusListener = onStatus;
    running = true;
    idleMonitor.start(idleThresholdMinutes);
    idleMonitor.onSample(onSample);
    inputCounter.start();
    localDb.purgeOldSynced();
    scheduleSync();
  },

  stop() {
    running = false;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = null;
    idleMonitor.stop();
    inputCounter.stop();
  },

  setSession(sessionId: string | null) {
    // Close current bucket before switching sessions so buckets never straddle.
    if (bucketStart !== 0) closeBucket(Date.now());
    currentSessionId = sessionId;
    bucketStart = sessionId ? Date.now() : 0;
    activeAccum = 0;
    idleAccum = 0;
    inputCounter.drain(); // reset counters on session switch
    // Reset sync backoff so a fresh session doesn't inherit a long (up to 30m)
    // delay left over from an earlier offline stretch.
    backoff = 0;
    lastError = null;
  },

  currentSession(): string | null {
    return currentSessionId;
  },

  forceFlushBucket() {
    if (currentSessionId && bucketStart !== 0) closeBucket(Date.now());
  },

  async forceSync() {
    await drainToServer();
  },

  /** Read-only view of the in-progress bucket — used by status() so the
   * dashboard's active/idle totals reflect time we've measured but not yet
   * flushed to SQLite. Values are floats (sample-interval granularity). */
  currentBucketAccum(): { active: number; idle: number } {
    return { active: activeAccum, idle: idleAccum };
  },

  /** Subscribe to the per-sample tick (~10s). Used by IPC to call pushStatus
   * so the renderer's live totals tick alongside the wall-clock timer. */
  onSampleTick(cb: OnSampleTick | null) {
    sampleTickListener = cb;
  },

  lastOk(): string | null { return lastOkAt; },
  lastErr(): string | null { return lastError; },
  pending(): number { return localDb.pendingCount(); },
};

// Auth state helper for the main entry — ensures we never start tracking
// without a valid login.
export function hasValidAuth(): boolean {
  const s = auth.get();
  return !!(s.accessToken && s.deviceSecret && s.profile);
}
