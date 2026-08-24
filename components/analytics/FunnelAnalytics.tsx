"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  COOKIE_CONSENT_CHANGE_EVENT,
  trackFunnelEvent,
  trackPageView,
} from "@/lib/analytics/client";
import { isAnalyticsAllowedPath } from "@/lib/analytics/route-privacy";
import { sanitizedMonitoringPath } from "@/lib/privacy/safe-monitoring-url";

function hasSearchFilters(searchParams: URLSearchParams) {
  return Array.from(searchParams.entries()).some(
    ([key, value]) => key !== "page" && Boolean(value),
  );
}

function getRouteFunnelEvent(pathname: string, searchParams: URLSearchParams) {
  if (pathname === "/login") {
    return {
      name: searchParams.get("mode") === "register" ? "signup_view" : "login_view",
      params: {},
    };
  }

  if (pathname === "/onboarding") {
    return { name: "onboarding_view", params: {} };
  }

  if (pathname === "/profile/photos") {
    return { name: "profile_photo_step_view", params: {} };
  }

  if (pathname === "/search-aupair" || pathname === "/search-family") {
    return {
      name: "search_view",
      params: {
        search_type: pathname === "/search-aupair" ? "au_pair" : "family",
        has_filters: hasSearchFilters(searchParams),
      },
    };
  }

  if (pathname.startsWith("/profile/")) {
    return { name: "profile_view", params: {} };
  }

  if (pathname === "/messages" || pathname.startsWith("/messages/")) {
    return {
      name: "messages_view",
      params: {
        messages_view:
          pathname === "/messages/new" || searchParams.has("profile")
              ? "new"
              : pathname.startsWith("/messages/") ||
                  searchParams.has("conversation")
                ? "conversation"
                : "inbox",
      },
    };
  }

  return null;
}

export function FunnelAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const pagePath = useMemo(() => sanitizedMonitoringPath(pathname), [pathname]);

  const trackCurrentRoute = useMemo(
    () => () => {
      if (!isAnalyticsAllowedPath(pathname)) return;

      const currentSearchParams = new URLSearchParams(searchKey);

      trackPageView(pagePath);

      const event = getRouteFunnelEvent(pathname, currentSearchParams);

      if (event) {
        trackFunnelEvent(event.name, event.params);
      }
    },
    [pagePath, pathname, searchKey],
  );

  useEffect(() => {
    trackCurrentRoute();
  }, [trackCurrentRoute]);

  useEffect(() => {
    function handleConsentChange(event: Event) {
      const choice = (event as CustomEvent<{ choice?: string }>).detail?.choice;

      if (choice === "all") {
        window.setTimeout(trackCurrentRoute, 0);
      }
    }

    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, handleConsentChange);

    return () => {
      window.removeEventListener(
        COOKIE_CONSENT_CHANGE_EVENT,
        handleConsentChange,
      );
    };
  }, [trackCurrentRoute]);

  return null;
}
