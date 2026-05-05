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

const SENSITIVE_KEY = /password|token|secret|refresh_token|access_token|authorization|cookie|api_key/i;

function redact(obj: unknown): unknown {
  if (obj == null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redact(v);
  }
  return out;
}

export function initSentryMain(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: app.isPackaged ? "production" : "development",
    release: `fdm-tracker@${app.getVersion()}`,
    // Errors only — perf tracing burns the free tier.
    tracesSampleRate: 0,
    // Employee-monitoring app: don't ship IPs / usernames / cookies to Sentry.
    sendDefaultPii: false,
    beforeSend: (event) => {
      if (event.request?.headers) {
        event.request.headers = redact(event.request.headers) as Record<string, string>;
      }
      if (event.request?.data) {
        event.request.data = redact(event.request.data);
      }
      if (event.user) {
        delete event.user.ip_address;
        delete event.user.email;
        delete event.user.username;
      }
      if (event.extra) {
        event.extra = redact(event.extra) as Record<string, unknown>;
      }
      return event;
    },
    beforeBreadcrumb: (breadcrumb) => {
      if (breadcrumb.category === "console") return null;
      return breadcrumb;
    },
  });
}
