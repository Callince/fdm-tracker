import * as Sentry from "@sentry/nextjs";
import { scrubSensitiveFields } from "./src/lib/sentryScrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: scrubSensitiveFields,
  });
}
