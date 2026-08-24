import * as Sentry from "@sentry/nextjs";
import { sanitizeSentryEvent } from "@/lib/monitoring/sentry-sanitize";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const isVercelRuntime = process.env.VERCEL === "1";

if (dsn && isVercelRuntime) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    sendDefaultPii: false,
    beforeSend: sanitizeSentryEvent,
    beforeSendTransaction: sanitizeSentryEvent,
  });
}
