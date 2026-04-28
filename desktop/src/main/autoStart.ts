/**
 * Cross-platform login-item toggle. Never enable silently — the user must
 * tick the box in Settings.
 */
import { app } from "electron";

export const autoStart = {
  isEnabled(): boolean {
    return app.getLoginItemSettings().openAtLogin;
  },
  set(enabled: boolean) {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
      args: ["--hidden"],
    });
  },
};
