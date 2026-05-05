import type { ErrorEvent, EventHint } from "@sentry/nextjs";

const SENSITIVE_HEADER_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-csrf-token",
  "x-api-key",
]);

const SENSITIVE_BODY_KEYS = /password|token|secret|refresh_token|access_token|api_key|authorization/i;

function redactObject(obj: unknown): unknown {
  if (obj == null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redactObject);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_HEADER_KEYS.has(k.toLowerCase()) || SENSITIVE_BODY_KEYS.test(k)) {
      out[k] = "[redacted]";
    } else {
      out[k] = redactObject(v);
    }
  }
  return out;
}

export function scrubSensitiveFields(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  if (event.request) {
    if (event.request.headers) {
      event.request.headers = redactObject(event.request.headers) as Record<string, string>;
    }
    if (event.request.cookies) {
      event.request.cookies = "[redacted]" as unknown as Record<string, string>;
    }
    if (event.request.data) {
      event.request.data = redactObject(event.request.data);
    }
  }
  if (event.user) {
    delete event.user.ip_address;
    delete event.user.email;
    delete event.user.username;
  }
  if (event.extra) {
    event.extra = redactObject(event.extra) as Record<string, unknown>;
  }
  return event;
}
