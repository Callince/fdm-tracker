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
  timestamp: number;   // epoch ms
  idleSeconds: number;
  isActive: boolean;
}

type Listener = (s: Sample) => void;
const listeners = new Set<Listener>();

let intervalRef: NodeJS.Timeout | null = null;
let thresholdMinutes = 5;
let lastIdle = 0;

export const idleMonitor = {
  start(idleThresholdMinutes: number) {
    thresholdMinutes = idleThresholdMinutes;
    if (intervalRef) return;
    intervalRef = setInterval(() => {
      const idle = powerMonitor.getSystemIdleTime();
      lastIdle = idle;
      const sample: Sample = {
        timestamp: Date.now(),
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
