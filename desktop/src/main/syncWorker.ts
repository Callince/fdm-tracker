/**
 * 60-second aggregator + background push to backend.
 *
 * Every `sampleIntervalMs` (10s) the idle monitor emits a sample. We
 * accumulate active/idle seconds within the current 60s window. At bucket
 * close we drain the input counters and queue the bucket for flushing.
 *
 * Tolerance window: when a sample reports no input but `idleSeconds` is
 * still below the configured threshold, we tag those seconds as **active**
 * tentatively — the user might just be reading or thinking. If `idleSeconds`
 * eventually crosses the threshold, the entire tolerance run is retroactively
 * flipped to idle. To make that retroactive flip work across bucket
 * boundaries we hold closed buckets in an in-memory queue for up to
 * `threshold` seconds before writing to SQLite (`flushSettled`). This means
 * a 5-minute idle stretch (with threshold=3min) shows up as 5 minutes of
 * idle in the timeline, not 2 minutes after the threshold expired.
 *
 * A separate timer drains SQLite buckets to the server every
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

interface BufferedBucket {
  bucketStartMono: number;
  bucketStartWall: number;
  active: number;             // seconds tagged active so far
  idle: number;               // seconds tagged idle so far
  pendingTolerance: number;   // subset of `active` that came from the current
                              // unresolved no-input gap and may flip to idle
  keystrokes: number;
  mouseEvents: number;
  sessionId: string;
  closed: boolean;            // true once it hit 60s; queued, no longer accumulating
}

function nowMono(): number {
  return Number(process.hrtime.bigint() / 1_000_000n);
}

let currentBucket: BufferedBucket | null = null;
let bufferQueue: BufferedBucket[] = [];
let gapConfirmedIdle = false;     // true while sample.idleSeconds ≥ threshold

let currentSessionId: string | null = null;
let running = false;
let syncTimer: NodeJS.Timeout | null = null;
let backoff = 0;
let lastOkAt: string | null = null;
let lastError: string | null = null;
let statusListener: OnStatus | null = null;
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

function newBucket(monoMs: number, wallMs: number, sid: string): BufferedBucket {
  return {
    bucketStartMono: monoMs,
    bucketStartWall: wallMs,
    active: 0,
    idle: 0,
    pendingTolerance: 0,
    keystrokes: 0,
    mouseEvents: 0,
    sessionId: sid,
    closed: false,
  };
}

function flipAllToleranceToIdle() {
  if (currentBucket && currentBucket.pendingTolerance > 0) {
    currentBucket.active -= currentBucket.pendingTolerance;
    currentBucket.idle += currentBucket.pendingTolerance;
    currentBucket.pendingTolerance = 0;
  }
  for (const b of bufferQueue) {
    if (b.pendingTolerance > 0) {
      b.active -= b.pendingTolerance;
      b.idle += b.pendingTolerance;
      b.pendingTolerance = 0;
    }
  }
}

function clearAllToleranceAsActive() {
  if (currentBucket) currentBucket.pendingTolerance = 0;
  for (const b of bufferQueue) b.pendingTolerance = 0;
}

function flushSettled() {
  // Settled = pendingTolerance is 0, so the classification will not change.
  // Walk from the oldest; stop at the first un-settled bucket.
  while (bufferQueue.length > 0 && bufferQueue[0].pendingTolerance === 0) {
    const b = bufferQueue.shift()!;
    localDb.insertBucket({
      session_id: b.sessionId,
      bucket_start: new Date(b.bucketStartWall).toISOString(),
      active_seconds: Math.round(b.active),
      idle_seconds: Math.round(b.idle),
      keystroke_count: b.keystrokes,
      mouse_event_count: b.mouseEvents,
    });
  }
}

function gapFillBuckets(startWall: number, totalSec: number, sid: string, gapIsIdle: boolean) {
  let cursor = startWall;
  let remaining = totalSec;
  while (remaining > 0) {
    const seconds = Math.min(config.bucketSeconds, remaining);
    localDb.insertBucket({
      session_id: sid,
      bucket_start: new Date(cursor).toISOString(),
      active_seconds: gapIsIdle ? 0 : seconds,
      idle_seconds: gapIsIdle ? seconds : 0,
      keystroke_count: 0,
      mouse_event_count: 0,
    });
    cursor += seconds * 1000;
    remaining -= seconds;
  }
}

function closeAndQueueCurrent() {
  if (!currentBucket) return;
  // Drain input counters into the bucket at close time so they line up
  // with the activity window they describe.
  const counts = inputCounter.drain();
  currentBucket.keystrokes += counts.keystrokes;
  currentBucket.mouseEvents += counts.mouseEvents;
  currentBucket.closed = true;
  bufferQueue.push(currentBucket);
  currentBucket = null;
}

function onSample(s: Sample) {
  if (!currentSessionId) return;

  if (!currentBucket) {
    currentBucket = newBucket(s.monoMs, s.timestamp, currentSessionId);
  }

  const elapsed = (s.monoMs - currentBucket.bucketStartMono) / 1000;
  const windowSeconds = config.sampleIntervalMs / 1000;
  const thresholdSec = idleMonitor.getThresholdMinutes() * 60;

  // Long-gap detection. If samples haven't fired for ≥ 2 buckets (e.g.
  // suspend, lid close, frozen event loop), we close the current bucket
  // with whatever it has, gap-fill the rest, and start a fresh bucket.
  // The gap is classified by its total length: shorter than threshold
  // → active (brief stall, user was almost certainly there); longer →
  // idle (real away-from-keyboard).
  if (elapsed >= 2 * config.bucketSeconds) {
    const sid = currentBucket.sessionId;
    const bucketEndWall = currentBucket.bucketStartWall + config.bucketSeconds * 1000;
    closeAndQueueCurrent();
    flushSettled();
    const gapSec = Math.round(elapsed - config.bucketSeconds);
    gapFillBuckets(bucketEndWall, gapSec, sid, gapSec >= thresholdSec);
    currentBucket = newBucket(s.monoMs, s.timestamp, sid);
    // The gap itself counts as the "no input gap" if idle. But the sample
    // tells us authoritatively how long we've been idle so we just continue
    // with the new bucket.
  } else if (elapsed >= config.bucketSeconds) {
    closeAndQueueCurrent();
    currentBucket = newBucket(s.monoMs, s.timestamp, currentSessionId);
  }

  // Classify this 10s sample window.
  if (s.idleSeconds < windowSeconds) {
    // Input occurred within this window — gap (if any) ended below threshold.
    // Tolerance was correct: those seconds stay tagged active.
    clearAllToleranceAsActive();
    gapConfirmedIdle = false;
    currentBucket.active += windowSeconds;
  } else if (s.idleSeconds >= thresholdSec) {
    // No input + gap ≥ threshold → confirmed idle.
    if (!gapConfirmedIdle) {
      // First idle sample of this gap. Retroactively flip every accumulated
      // tolerance second across the buffer + current bucket from active
      // to idle — they were never really active, the user was already gone.
      flipAllToleranceToIdle();
      gapConfirmedIdle = true;
    }
    currentBucket.idle += windowSeconds;
  } else {
    // No input but still inside the threshold window. Tentatively active —
    // we'll flip to idle if the gap eventually crosses threshold, or leave
    // as active if the user comes back first.
    currentBucket.active += windowSeconds;
    currentBucket.pendingTolerance += windowSeconds;
  }

  flushSettled();
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

function flushAllPending() {
  // Force-flush every buffered bucket. Any unresolved tolerance is treated
  // as active — we don't have lookahead beyond this moment, so keeping
  // tentatively-active samples as active is the conservative choice.
  clearAllToleranceAsActive();
  if (currentBucket && (currentBucket.active > 0 || currentBucket.idle > 0)) {
    closeAndQueueCurrent();
  } else {
    currentBucket = null;
  }
  flushSettled();
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
    flushAllPending();
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = null;
    idleMonitor.stop();
    inputCounter.stop();
  },

  setSession(sessionId: string | null) {
    // Close out current session's pending data before switching so the
    // tail end of the prior session doesn't bleed into the new one.
    flushAllPending();
    currentSessionId = sessionId;
    currentBucket = null;
    bufferQueue = [];
    gapConfirmedIdle = false;
    inputCounter.drain();
    backoff = 0;
    lastError = null;
  },

  currentSession(): string | null {
    return currentSessionId;
  },

  forceFlushBucket() {
    if (currentSessionId) flushAllPending();
  },

  async forceSync() {
    await drainToServer();
  },

  /** Read-only view of in-flight bucket data — both the still-accumulating
   * current bucket and any queued-but-unflushed buckets. Callers (e.g.
   * status()) sum this with localDb.todayBucketTotals to compute live totals
   * that include data not yet written to SQLite. */
  currentBucketAccum(): { active: number; idle: number } {
    let a = 0;
    let i = 0;
    if (currentBucket) {
      a += currentBucket.active;
      i += currentBucket.idle;
    }
    for (const b of bufferQueue) {
      a += b.active;
      i += b.idle;
    }
    return { active: a, idle: i };
  },

  onSampleTick(cb: OnSampleTick | null) {
    sampleTickListener = cb;
  },

  lastOk(): string | null { return lastOkAt; },
  lastErr(): string | null { return lastError; },
  pending(): number { return localDb.pendingCount(); },
};

export function hasValidAuth(): boolean {
  const s = auth.get();
  return !!(s.accessToken && s.deviceSecret && s.profile);
}
