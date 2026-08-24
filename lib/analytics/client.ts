"use client";

import {
  genericMonitoringPageTitle,
  sanitizedMonitoringPath,
  sanitizedMonitoringUrl,
} from "@/lib/privacy/safe-monitoring-url";
import { isAnalyticsAllowedPath } from "@/lib/analytics/route-privacy";
import {
  COOKIE_CONSENT_CHANGE_EVENT,
  COOKIE_CONSENT_COOKIE_NAME,
  COOKIE_CONSENT_OPEN_EVENT,
  COOKIE_CONSENT_STORAGE_KEY,
  parseCookieConsentChoice,
  type CookieConsentChoice,
} from "@/lib/analytics/consent";

export {
  COOKIE_CONSENT_CHANGE_EVENT,
  COOKIE_CONSENT_COOKIE_NAME,
  COOKIE_CONSENT_OPEN_EVENT,
  COOKIE_CONSENT_STORAGE_KEY,
  type CookieConsentChoice,
} from "@/lib/analytics/consent";

type AnalyticsValue = string | number | boolean | null | undefined;
type AnalyticsParams = Record<string, AnalyticsValue>;
type QueuedAnalyticsEvent = {
  name: string;
  params: AnalyticsParams;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
    hj?: (...args: unknown[]) => void;
    paExternalTelemetryLoaded?: boolean;
    paSessionReplayLoaded?: boolean;
    _hjSettings?: {
      hjid: number;
      hjsv: number;
    };
    paAnalyticsQueue?: QueuedAnalyticsEvent[];
  }
}

function readCookie(name: string) {
  if (typeof document === "undefined") return null;

  try {
    const value = document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith(`${name}=`))
      ?.split("=")[1];

    return value ? decodeURIComponent(value) : null;
  } catch {
    return null;
  }
}

export function readCookieConsentChoice(): CookieConsentChoice | null {
  if (typeof window === "undefined") return null;

  // The server can only read the cookie, so keep it as the single source of
  // truth to avoid hydration and telemetry decisions disagreeing with SSR.
  return parseCookieConsentChoice(readCookie(COOKIE_CONSENT_COOKIE_NAME));
}

export function hasOptionalAnalyticsConsent() {
  return readCookieConsentChoice() === "all";
}

export function saveCookieConsentChoice(choice: CookieConsentChoice) {
  let cookieSaved = false;

  try {
    document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=${choice}; path=/; max-age=15552000; SameSite=Lax${
      window.location.protocol === "https:" ? "; Secure" : ""
    }`;
    cookieSaved =
      parseCookieConsentChoice(readCookie(COOKIE_CONSENT_COOKIE_NAME)) === choice;
  } catch {
    cookieSaved = false;
  }

  const effectiveChoice: CookieConsentChoice = cookieSaved
    ? choice
    : "necessary";

  try {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, effectiveChoice);
  } catch {
    // Some embedded browsers deny localStorage while still allowing cookies.
    // The cookie remains the only consent source used by the app and server.
  }

  window.dispatchEvent(
    new CustomEvent(COOKIE_CONSENT_CHANGE_EVENT, {
      detail: { choice: effectiveChoice },
    }),
  );

  return effectiveChoice;
}

function normalizedAnalyticsParams(params: AnalyticsParams = {}) {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value.slice(0, 120) : value,
      ]),
  );
}

function currentAnalyticsPageContext(pagePath?: string) {
  const safePath = sanitizedMonitoringPath(
    pagePath ?? window.location.pathname,
  );
  let safeReferrer = "";

  try {
    if (document.referrer) {
      const referrer = new URL(document.referrer, window.location.origin);
      safeReferrer =
        referrer.origin === window.location.origin
          ? (sanitizedMonitoringUrl(referrer.toString()) ?? "")
          : referrer.origin;
    }
  } catch {
    safeReferrer = "";
  }

  return {
    page_path: safePath,
    page_location:
      sanitizedMonitoringUrl(`${window.location.origin}${safePath}`) ??
      window.location.origin,
    page_referrer: safeReferrer,
    page_title: genericMonitoringPageTitle(safePath),
  };
}

function applyAnalyticsPageContext(pagePath?: string) {
  if (typeof window.gtag !== "function") return;

  window.gtag("set", currentAnalyticsPageContext(pagePath));
}

export function flushQueuedAnalyticsEvents() {
  if (
    typeof window === "undefined" ||
    !isAnalyticsAllowedPath(window.location.pathname) ||
    !hasOptionalAnalyticsConsent() ||
    typeof window.gtag !== "function"
  ) {
    if (
      typeof window !== "undefined" &&
      !isAnalyticsAllowedPath(window.location.pathname)
    ) {
      window.paAnalyticsQueue = [];
    }
    return;
  }

  const queue = window.paAnalyticsQueue ?? [];
  window.paAnalyticsQueue = [];

  for (const event of queue) {
    const params = {
      ...normalizedAnalyticsParams(event.params),
      ...currentAnalyticsPageContext(
        typeof event.params.page_path === "string"
          ? event.params.page_path
          : undefined,
      ),
    };
    const pagePath =
      typeof params.page_path === "string" ? params.page_path : undefined;

    applyAnalyticsPageContext(pagePath);
    window.gtag("event", event.name, params);
  }
}

export function trackFunnelEvent(
  name: string,
  params: AnalyticsParams = {},
) {
  if (
    typeof window === "undefined" ||
    !isAnalyticsAllowedPath(window.location.pathname) ||
    !hasOptionalAnalyticsConsent()
  ) {
    return;
  }

  const normalizedParams = {
    ...normalizedAnalyticsParams(params),
    ...currentAnalyticsPageContext(),
  };

  if (typeof window.gtag !== "function") {
    window.paAnalyticsQueue = [
      ...(window.paAnalyticsQueue ?? []),
      { name, params: normalizedParams },
    ].slice(-20);
    return;
  }

  const pagePath =
    typeof normalizedParams.page_path === "string"
      ? normalizedParams.page_path
      : undefined;
  applyAnalyticsPageContext(pagePath);
  window.gtag("event", name, normalizedParams);
}

export function trackPageView(pagePath: string) {
  if (
    typeof window === "undefined" ||
    !isAnalyticsAllowedPath(window.location.pathname) ||
    !isAnalyticsAllowedPath(pagePath)
  ) {
    return;
  }

  const pageContext = currentAnalyticsPageContext(pagePath);
  applyAnalyticsPageContext(pageContext.page_path);
  trackFunnelEvent("page_view", pageContext);
}

export function openCookiePreferences() {
  window.dispatchEvent(new Event(COOKIE_CONSENT_OPEN_EVENT));
}
