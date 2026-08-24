"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { isAnalyticsAllowedPath } from "@/lib/analytics/route-privacy";
import {
  sanitizedMonitoringPath,
  sanitizedMonitoringUrl,
} from "@/lib/privacy/safe-monitoring-url";

type SpeedInsightEvent = {
  type: "vital";
  url: string;
  route?: string;
};

export function normalizeSpeedInsightEvent(
  event: SpeedInsightEvent,
  currentPath: string,
  origin: string,
) {
  let eventPath = "/";

  try {
    eventPath = new URL(event.url, origin).pathname;
  } catch {
    return null;
  }

  if (
    !isAnalyticsAllowedPath(currentPath) ||
    !isAnalyticsAllowedPath(eventPath) ||
    (event.route && !isAnalyticsAllowedPath(event.route))
  ) {
    return null;
  }

  const safeUrl = sanitizedMonitoringUrl(event.url);
  if (!safeUrl) return null;

  const safeRoute = sanitizedMonitoringPath(
    eventPath === "/login" ? "/login" : (event.route ?? eventPath),
  );

  return { ...event, url: safeUrl, route: safeRoute };
}

function filterPrivateSpeedInsight(event: SpeedInsightEvent) {
  return normalizeSpeedInsightEvent(
    event,
    window.location.pathname,
    window.location.origin,
  );
}

export function PrivacyAwareSpeedInsights() {
  const pathname = usePathname();
  const analyticsAllowed = isAnalyticsAllowedPath(pathname);

  useEffect(() => {
    if (analyticsAllowed) {
      window.paExternalTelemetryLoaded = true;
    }
  }, [analyticsAllowed]);

  if (!analyticsAllowed) return null;

  return <SpeedInsights beforeSend={filterPrivateSpeedInsight} />;
}
