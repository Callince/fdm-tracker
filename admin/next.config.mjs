import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000",
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
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
