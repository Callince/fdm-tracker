/**
 * Silent auto-update via electron-updater.
 *
 * Mode: download new releases in the background; install them on the next
 * app launch. No popups, no force-restart while the user is working.
 *
 * The update feed is the GitHub Releases of Callince/fdm-tracker. For
 * private repos, electron-updater needs a token at runtime — we bake it
 * in via __FDM_GH_TOKEN__ (set at build time in electron.vite.config.ts).
 * If no token is present we skip silently — local dev builds, etc.
 */
import { autoUpdater } from "electron-updater";
import { log } from "./logger";

declare const __FDM_GH_TOKEN__: string | undefined;
const ghToken: string | undefined =
  typeof __FDM_GH_TOKEN__ !== "undefined" ? __FDM_GH_TOKEN__ : undefined;

let started = false;

export function startAutoUpdater(): void {
  if (started) return;
  started = true;

  // Silent mode: download in background, apply on next launch.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.logger = {
    info: (msg: unknown) => log.info("[auto-update]", msg),
    warn: (msg: unknown) => log.warn("[auto-update]", msg),
    error: (msg: unknown) => log.error("[auto-update]", msg),
    debug: () => { /* swallow chatty debug */ },
  } as unknown as typeof autoUpdater.logger;

  if (ghToken) {
    autoUpdater.setFeedURL({
      provider: "github",
      owner: "Callince",
      repo: "fdm-tracker",
      private: true,
      token: ghToken,
    });
  }

  autoUpdater.on("update-available", (info) => {
    log.info("update-available", info?.version);
  });
  autoUpdater.on("update-not-available", () => {
    log.info("up to date");
  });
  autoUpdater.on("update-downloaded", (info) => {
    log.info("update-downloaded — will install on next quit", info?.version);
  });
  autoUpdater.on("error", (err) => {
    log.warn("auto-update error", err?.message ?? err);
  });

  // Check on startup, then every 6 hours while the app runs.
  void autoUpdater.checkForUpdates().catch((e) => log.warn("initial check failed", e?.message));
  setInterval(() => {
    void autoUpdater.checkForUpdates().catch(() => { /* ignore */ });
  }, 6 * 60 * 60 * 1000);
}
