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

type OnStatus = (msg: { online: boolean; lastOkAt: string | null; lastError: string | null; pending: number }) => void;

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
  const elapsed = Math.min(config.bucketSeconds, Math.round((now - bucketStart) / 1000));
  if (elapsed <= 0) return;
  const counts = inputCounter.drain();
  localDb.insertBucket({
    session_id: currentSessionId,
    bucket_start: new Date(bucketStart).toISOString(),
    active_seconds: Math.min(activeAccum, elapsed),
    idle_seconds: Math.min(idleAccum, elapsed),
    keystroke_count: counts.keystrokes,
    mouse_event_count: counts.mouseEvents,
  });
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
      console.warn("[sync] server rejected", res.rejected, res.reasons.slice(0, 3));
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
