import { withSentryConfig } from "@sentry/nextjs";

const SENTRY_HOSTS = "https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io";

/**
 * Production CSP.
 *   - 'unsafe-inline' on styles is needed for Tailwind's runtime + the
 *     theme-bootstrap inline script we use to avoid FOUC.
 *   - 'unsafe-eval' is excluded; we don't use it.
 *   - connect-src includes the API base + Sentry endpoints.
 */
function buildCsp() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "";
  let apiHost = "";
  try {
    if (apiBase) {
      const u = new URL(apiBase);
      apiHost = `${u.protocol}//${u.host}`;
    }
  } catch { /* ignore — fall back to 'self' only */ }
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval'"   // Next dev needs eval for HMR
    : "'self' 'unsafe-inline'";                 // bootstrap inline only
  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self' ${apiHost} ${SENTRY_HOSTS} ${isDev ? "ws: wss:" : ""}`.trim(),
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `form-action 'self'`,
  ].join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: buildCsp() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000",
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// Wrap so Sentry can hook the build (source-map upload skipped — we don't
// have an org auth token wired into CI, and that's fine for an internal app:
// errors arrive un-symbolicated but with file/line numbers.)
export default withSentryConfig(nextConfig, {
  silent: true,
  // No org/project means no source-map upload; init still works at runtime.
  disableLogger: true,
  // The withSentryConfig wrapper still injects the runtime helpers.
  widenClientFileUpload: false,
});
