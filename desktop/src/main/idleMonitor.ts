/**
 * Samples OS-level idle seconds every `sampleIntervalMs` and classifies
 * the current sample into "active" or "idle" based on the org's threshold.
 *
 * This uses Electron's powerMonitor — no extra permissions required on
 * Windows (GetLastInputInfo) or macOS (CGEventSourceSecondsSinceLastEventType).
 */
import { powerMonitor } from "electron";
import { config } from "./config";

export interface Sample {
  /** Wall-clock epoch ms — used only for ISO timestamps written to disk. */
  timestamp: number;
  /** Monotonic high-resolution time in milliseconds. Use this for *elapsed*
   * math (bucket-boundary detection, drift calculations). NOT affected by
   * DST changes, NTP corrections, or the user manually changing the clock. */
  monoMs: number;
  idleSeconds: number;
  isActive: boolean;
}

type Listener = (s: Sample) => void;
const listeners = new Set<Listener>();

let intervalRef: NodeJS.Timeout | null = null;
let thresholdMinutes = 5;
let lastIdle = 0;

function monoMs(): number {
  // hrtime.bigint() returns nanoseconds since an arbitrary monotonic epoch.
  // Number.MAX_SAFE_INTEGER fits ~104 days of ms — more than enough.
  return Number(process.hrtime.bigint() / 1_000_000n);
}

export const idleMonitor = {
  start(idleThresholdMinutes: number) {
    thresholdMinutes = idleThresholdMinutes;
    if (intervalRef) return;
    intervalRef = setInterval(() => {
      const idle = powerMonitor.getSystemIdleTime();
      lastIdle = idle;
      const sample: Sample = {
        timestamp: Date.now(),
        monoMs: monoMs(),
        idleSeconds: idle,
        isActive: idle < thresholdMinutes * 60,
      };
      for (const l of listeners) l(sample);
    }, config.sampleIntervalMs);
  },
  stop() {
    if (intervalRef) clearInterval(intervalRef);
    intervalRef = null;
  },
  setThreshold(minutes: number) {
    thresholdMinutes = minutes;
  },
  onSample(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  lastIdleSeconds(): number {
    return lastIdle;
  },
};
