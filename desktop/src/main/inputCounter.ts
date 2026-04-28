/**
 * Keyboard + mouse event counters using uiohook-napi.
 *
 * PRIVACY: We never inspect keycodes, modifier state, or mouse positions —
 * only count increments. The counters reset to zero each time `drain()` is
 * called (which happens at the end of every 60-second bucket).
 *
 * On macOS this requires the user to grant Accessibility + Input Monitoring
 * permission in System Settings. If uiohook fails to load (ungranted,
 * missing native binding, etc.), counters stay at zero and the tracker
 * still works — it just only reports OS-level idle/active.
 */
let uiohook: typeof import("uiohook-napi").uIOhook | null = null;
let started = false;

let keystrokes = 0;
let mouseEvents = 0;

function tryLoad(): boolean {
  if (uiohook) return true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("uiohook-napi") as typeof import("uiohook-napi");
    uiohook = mod.uIOhook;
    return true;
  } catch (e) {
    console.warn("[inputCounter] uiohook unavailable:", (e as Error).message);
    return false;
  }
}

export const inputCounter = {
  start(): boolean {
    if (started) return true;
    if (!tryLoad() || !uiohook) return false;
    try {
      uiohook.on("keydown", () => { keystrokes += 1; });
      uiohook.on("mousemove", () => { mouseEvents += 1; });
      uiohook.on("mousedown", () => { mouseEvents += 1; });
      uiohook.on("wheel", () => { mouseEvents += 1; });
      uiohook.start();
      started = true;
      return true;
    } catch (e) {
      console.warn("[inputCounter] failed to start:", (e as Error).message);
      return false;
    }
  },

  stop() {
    if (!started || !uiohook) return;
    try { uiohook.stop(); } catch { /* ignore */ }
    started = false;
  },

  drain(): { keystrokes: number; mouseEvents: number } {
    const out = { keystrokes, mouseEvents };
    keystrokes = 0;
    mouseEvents = 0;
    return out;
  },

  isAvailable(): boolean {
    return started;
  },
};
