/**
 * Next.js instrumentation hook — runs once per server start.
 * Loads the right Sentry config based on the runtime.
 *
 * Note: onRequestError re-export is intentionally omitted. It's a Next 15
 * feature and @sentry/nextjs only exports it when the host Next is >= 15.
 * On Next 14 the import errors at build time. Render errors still get
 * captured via the standard error boundaries that sentry.client.config.ts
 * sets up.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
