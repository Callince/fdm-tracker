import * as Sentry from "@sentry/nextjs";
import { scrubSensitiveFields } from "./src/lib/sentryScrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // Errors only — no perf tracing on the free tier.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    // Capture a session replay only when an error fires. Cheap on the
    // free tier, invaluable when reproducing UI bugs.
    replaysOnErrorSampleRate: 0.1,
    // Employee monitoring app — never ship IPs / usernames / cookies to a
    // third-party SaaS. Strip auth headers and password-like fields too.
    sendDefaultPii: false,
    beforeSend: scrubSensitiveFields,
    beforeBreadcrumb: (breadcrumb) => {
      if (breadcrumb.category === "console") return null;
      return breadcrumb;
    },
  });
}
