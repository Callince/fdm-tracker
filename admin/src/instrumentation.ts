/**
 * Next.js instrumentation hook — runs once per server start.
 * Loads the right Sentry config based on the runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export { onRequestError } from "@sentry/nextjs";
