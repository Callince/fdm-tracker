/**
 * Main-process Sentry init. DSN is baked at build time via
 * __FDM_SENTRY_DSN__ define (electron.vite.config.ts). Empty in local dev
 * → no-op.
 */
import { app } from "electron";
import * as Sentry from "@sentry/electron/main";

declare const __FDM_SENTRY_DSN__: string | undefined;
const dsn: string | undefined =
  typeof __FDM_SENTRY_DSN__ !== "undefined" ? __FDM_SENTRY_DSN__ : undefined;

export function initSentryMain(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: app.isPackaged ? "production" : "development",
    release: `fdm-tracker@${app.getVersion()}`,
    // Errors only — perf tracing burns the free tier.
    tracesSampleRate: 0,
    sendDefaultPii: true,
  });
}
