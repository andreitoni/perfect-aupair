import * as Sentry from "@sentry/nextjs";
import { isAdminAnalyticsPath } from "@/lib/analytics/route-privacy";
import { sanitizeBrowserSentryEvent } from "@/lib/monitoring/sentry-sanitize";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const isAdminRoute = isAdminAnalyticsPath(window.location.pathname);
const isProductionHost =
  window.location.hostname === "perfectaupair.example" ||
  window.location.hostname === "www.perfectaupair.example";

if (dsn && isProductionHost && !isAdminRoute) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    sendDefaultPii: false,
    beforeSend: (event) => {
      const currentPath = window.location.pathname;
      if (isAdminAnalyticsPath(currentPath)) return null;

      return sanitizeBrowserSentryEvent(
        event,
        window.navigator.userAgent,
        currentPath,
      );
    },
    beforeSendTransaction: (event) => {
      const currentPath = window.location.pathname;
      if (isAdminAnalyticsPath(currentPath)) return null;

      return sanitizeBrowserSentryEvent(
        event,
        window.navigator.userAgent,
        currentPath,
      );
    },
  });
  window.paExternalTelemetryLoaded = true;
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
