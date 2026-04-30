/**
 * macOS Accessibility permission check.
 *
 * uiohook-napi (keystroke + mouse-event monitoring) silently fails on
 * macOS until the user grants Accessibility permission in
 * System Settings → Privacy & Security → Accessibility.
 *
 * Without it, every bucket reports zero keystrokes/mouse events, so
 * users look 'idle' to the activity classifier even when they're typing.
 *
 * On non-Mac, this module is a no-op.
 */
import { dialog, shell, systemPreferences } from "electron";

let lastPromptAt = 0;
const REPROMPT_COOLDOWN_MS = 60 * 60 * 1000;   // don't nag more than once an hour

export function isAccessibilityGranted(): boolean {
  if (process.platform !== "darwin") return true;
  // false = don't show the OS prompt — we control prompting ourselves.
  return systemPreferences.isTrustedAccessibilityClient(false);
}

/** Show our own dialog. If the user clicks "Open Settings" we deep-link
 * to the right pane. We DON'T pass prompt=true to isTrusted... because
 * macOS's built-in prompt is generic + bypasses our explanation. */
export async function maybePromptAccessibility(): Promise<void> {
  if (process.platform !== "darwin") return;
  if (isAccessibilityGranted()) return;
  if (Date.now() - lastPromptAt < REPROMPT_COOLDOWN_MS) return;
  lastPromptAt = Date.now();
  const r = await dialog.showMessageBox({
    type: "warning",
    title: "FDM Tracker needs Accessibility permission",
    message: "Activity tracking is currently disabled.",
    detail:
      "To count your keystrokes and mouse activity correctly, FDM Tracker needs " +
      "Accessibility permission. Without it, you'll appear idle even when working.\n\n" +
      "Click 'Open Settings' to grant access. After enabling FDM Tracker in the list, " +
      "quit and relaunch the app.",
    buttons: ["Open Settings", "Later"],
    defaultId: 0,
    cancelId: 1,
  });
  if (r.response === 0) {
    void shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    );
  }
}
