import {
  sanitizedMonitoringPath,
  sanitizedMonitoringUrl,
} from "@/lib/privacy/safe-monitoring-url";
import { isAdminAnalyticsPath } from "@/lib/analytics/route-privacy";

type SentryEventLike = {
  breadcrumbs?: Array<{
    message?: string | null;
    data?: Record<string, unknown> | null;
  }> | null;
  contexts?: {
    browser?: {
      name?: string | null;
      [key: string]: unknown;
    } | null;
    [key: string]: unknown;
  } | null;
  exception?: {
    values?: Array<{
      value?: string | null;
      stacktrace?: {
        frames?: Array<{
          abs_path?: string | null;
          filename?: string | null;
          function?: string | null;
        }> | null;
      } | null;
    }> | null;
  } | null;
  request?: {
    url?: string | null;
    headers?: Record<string, unknown> | null;
    cookies?: unknown;
    data?: unknown;
    query_string?: unknown;
  } | null;
  extra?: Record<string, unknown> | null;
  tags?: Record<string, unknown> | null;
  transaction?: string;
  user?: {
    email?: string | null;
    ip_address?: string | null;
    username?: string | null;
    [key: string]: unknown;
  } | null;
};

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-debug-secret",
  "x-cron-secret",
  "x-maintenance-secret",
  "cf-connecting-ip",
  "forwarded",
  "next-url",
  "referer",
  "x-invoke-path",
  "x-forwarded-for",
  "x-matched-path",
  "x-original-url",
  "x-real-ip",
  "x-rewrite-url",
  "x-vercel-forwarded-for",
]);
const SENSITIVE_HEADER_PREFIXES = ["cf-ip", "x-vercel-ip-"] as const;
const SENSITIVE_DATA_KEY_PATTERN =
  /(?:authorization|birth|cookie|email|message[_-]?body|password|phone|postal|query|request[_-]?body|response[_-]?body|secret|street|token)/i;
const IDENTIFIER_DATA_KEY_PATTERN =
  /(?:conversation|profile|recipient|sender|user)[_-]?id$/i;
const EMAIL_VALUE_PATTERN =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const UUID_VALUE_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const ABSOLUTE_URL_PATTERN = /https?:\/\/[^\s"'<>)}]+/gi;
const RELATIVE_URL_PATTERN = /(^|[\s(\[])(\/[^\s"'<>),;]+)/g;

const INSTAGRAM_NATIVE_BRIDGE_ERROR =
  "undefined is not an object (evaluating 'window.webkit.messageHandlers')";
const INSTAGRAM_NATIVE_BRIDGE_FUNCTIONS = new Set([
  "sendDataToNative",
  "sendPageHideMessage",
]);
const HUAWEI_WEB_TRANSLATION_HOST = "searchaggr-dra.dt.dbankcloud.com";
const HUAWEI_WEB_TRANSLATION_PATH = "/search/api/v1/webtranslation_detect";
const FACEBOOK_ANDROID_BRIDGE_ERROR =
  "Error invoking postMessage: Java object is gone";
const FACEBOOK_ANDROID_BRIDGE_SOURCE =
  "app://navigation_performance_logger_android";
const FACEBOOK_ANDROID_BRIDGE_FUNCTIONS = new Set([
  "sendBeforeUnloadMessage",
  "sendJsBlockingTimeMessage",
  "sendPageHideMessage",
]);
const RESIZE_OBSERVER_ERRORS = new Set([
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications.",
]);
const SAFARI_REACT_DOM_REMOVAL_ERROR = "The object can not be found here.";

type SentryClientContext = {
  currentPath?: string | null;
  userAgent?: string | null;
};

function isSafariBrowser(
  event: SentryEventLike,
  clientContext?: SentryClientContext,
) {
  const browserName = event.contexts?.browser?.name;
  if (browserName === "Safari" || browserName === "Mobile Safari") return true;

  const userAgent = clientContext?.userAgent ?? "";
  return (
    userAgent.includes("Safari/") &&
    !/(?:Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPiOS)\//.test(userAgent)
  );
}

function isInterruptedSafariMessagesNavigation(
  event: SentryEventLike,
  clientContext?: SentryClientContext,
) {
  const referencesMessages =
    referencesMessagesRoute(event.transaction) ||
    referencesMessagesRoute(event.request?.url);
  if (!isSafariBrowser(event, clientContext) || !referencesMessages) return false;

  return Boolean(
    event.exception?.values?.some((exception) => {
      if (exception.value !== "Load failed") return false;

      return (exception.stacktrace?.frames?.length ?? 0) === 0;
    }),
  );
}

function isSafariReactDomRemovalNoise(
  event: SentryEventLike,
  clientContext?: SentryClientContext,
) {
  const referencesPublicDiscovery =
    referencesPublicDiscoveryRoute(event.transaction) ||
    referencesPublicDiscoveryRoute(event.request?.url);
  if (!isSafariBrowser(event, clientContext) || !referencesPublicDiscovery) {
    return false;
  }

  return Boolean(
    event.exception?.values?.some((exception) => {
      if (exception.value !== SAFARI_REACT_DOM_REMOVAL_ERROR) return false;

      const frames = exception.stacktrace?.frames ?? [];
      const functions = new Set(
        frames
          .map((frame) => frame.function)
          .filter((name): name is string => Boolean(name)),
      );
      const hasOnlyReactDomOrNativeFrames =
        frames.length > 0 &&
        frames.every((frame) => {
          const source = frame.filename ?? frame.abs_path ?? "";
          return (
            source.includes("/next/dist/compiled/react-dom/") ||
            source === "[native code]" ||
            (!source && frame.function === "removeChild")
          );
        });

      return (
        hasOnlyReactDomOrNativeFrames &&
        functions.has("commitDeletionEffectsOnFiber") &&
        functions.has("removeChild")
      );
    }),
  );
}

function isInjectedFacebookAndroidBridgeError(event: SentryEventLike) {
  return Boolean(
    event.exception?.values?.some((exception) => {
      if (exception.value !== FACEBOOK_ANDROID_BRIDGE_ERROR) return false;

      const bridgeFrames = (exception.stacktrace?.frames ?? []).filter((frame) => {
        const source = frame.filename ?? frame.abs_path ?? "";
        return source.startsWith(FACEBOOK_ANDROID_BRIDGE_SOURCE);
      });
      const bridgeFunctions = new Set(
        bridgeFrames
          .map((frame) => frame.function)
          .filter((name): name is string => Boolean(name)),
      );

      return (
        bridgeFunctions.has("sendDataToNative") &&
        [...FACEBOOK_ANDROID_BRIDGE_FUNCTIONS].some((name) =>
          bridgeFunctions.has(name),
        )
      );
    }),
  );
}

function isStacklessResizeObserverNotification(event: SentryEventLike) {
  return Boolean(
    event.exception?.values?.some((exception) => {
      if (!exception.value || !RESIZE_OBSERVER_ERRORS.has(exception.value)) {
        return false;
      }

      const frames = exception.stacktrace?.frames ?? [];
      return frames.every((frame) => {
        const source = frame.filename ?? frame.abs_path ?? "";
        return !source || source === "app:///" || source.startsWith("app:///:");
      });
    }),
  );
}

function isInjectedInstagramNativeBridgeError(event: SentryEventLike) {
  return Boolean(
    event.exception?.values?.some((exception) => {
      if (exception.value !== INSTAGRAM_NATIVE_BRIDGE_ERROR) return false;

      const frames = exception.stacktrace?.frames ?? [];
      const hasInjectedAppFrame = frames.some((frame) => {
        const source = frame.filename ?? frame.abs_path ?? "";
        return source === "app:///" || source.startsWith("app:///:");
      });
      const hasNativeBridgeFunction = frames.some((frame) =>
        frame.function
          ? INSTAGRAM_NATIVE_BRIDGE_FUNCTIONS.has(frame.function)
          : false,
      );

      return hasInjectedAppFrame && hasNativeBridgeFunction;
    }),
  );
}

function isInjectedHuaweiWebTranslationError(event: SentryEventLike) {
  return Boolean(
    event.exception?.values?.some((exception) => {
      if (
        !exception.value ||
        !referencesExactHuaweiTranslationEndpoint(exception.value)
      ) {
        return false;
      }

      const frameFunctions = new Set(
        (exception.stacktrace?.frames ?? [])
          .map((frame) => frame.function)
          .filter((name): name is string => Boolean(name)),
      );

      return (
        frameFunctions.has("ajax") &&
        [...frameFunctions].some(
          (name) => name === "checkLanguage" || name.endsWith(".checkLanguage"),
        )
      );
    }),
  );
}

function referencesExactHuaweiTranslationEndpoint(value: string) {
  const urlCandidates = value.match(ABSOLUTE_URL_PATTERN) ?? [];

  return urlCandidates.some((candidate) => {
    try {
      const url = new URL(candidate);

      return (
        url.protocol === "https:" &&
        url.hostname === HUAWEI_WEB_TRANSLATION_HOST &&
        url.port === "" &&
        url.username === "" &&
        url.password === "" &&
        url.pathname === HUAWEI_WEB_TRANSLATION_PATH
      );
    } catch {
      return false;
    }
  });
}

function referencesAdminRoute(value?: string | null) {
  if (!value) return false;

  if (
    /(?:^|[^A-Za-z0-9_-])\/admin(?:[/?#)\]\s]|$)/.test(value) ||
    /(?:^|[/\\(\s])admin(?:[/\\?#)\]\s]|$)/.test(value)
  ) {
    return true;
  }

  try {
    return isAdminAnalyticsPath(
      new URL(value, "https://perfectaupair.example").pathname,
    );
  } catch {
    return false;
  }
}

function sanitizedTelemetryString(value: string) {
  const withoutAbsoluteUrlDetails = value.replace(
    ABSOLUTE_URL_PATTERN,
    (url) => sanitizedMonitoringUrl(url) ?? "[redacted-url]",
  );
  const withoutRelativeUrlDetails = withoutAbsoluteUrlDetails.replace(
    RELATIVE_URL_PATTERN,
    (_match, prefix: string, url: string) =>
      `${prefix}${sanitizedMonitoringPath(url)}`,
  );

  return withoutRelativeUrlDetails
    .replace(EMAIL_VALUE_PATTERN, "[redacted-email]")
    .replace(UUID_VALUE_PATTERN, "[redacted-id]");
}

function sanitizeSentryRecord(record: Record<string, unknown>, depth = 0) {
  if (depth > 4) return;

  for (const [key, value] of Object.entries(record)) {
    if (
      SENSITIVE_DATA_KEY_PATTERN.test(key) ||
      IDENTIFIER_DATA_KEY_PATTERN.test(key)
    ) {
      delete record[key];
      continue;
    }

    if (typeof value === "string") {
      record[key] = sanitizedTelemetryString(value);
      continue;
    }

    if (Array.isArray(value)) {
      record[key] = value.map((item) => {
        if (typeof item === "string") return sanitizedTelemetryString(item);
        if (!item || typeof item !== "object") return item;

        sanitizeSentryRecord(item as Record<string, unknown>, depth + 1);
        return item;
      });
      continue;
    }

    if (value && typeof value === "object") {
      sanitizeSentryRecord(value as Record<string, unknown>, depth + 1);
    }
  }
}

function breadcrumbReferencesAdmin(
  breadcrumb: NonNullable<SentryEventLike["breadcrumbs"]>[number],
) {
  if (referencesAdminRoute(breadcrumb.message)) return true;

  return Object.values(breadcrumb.data ?? {}).some((value) =>
    typeof value === "string" ? referencesAdminRoute(value) : false,
  );
}

function requestHeadersReferenceAdmin(headers?: Record<string, unknown> | null) {
  if (!headers) return false;

  return Object.entries(headers).some(([key, value]) => {
    if (typeof value !== "string") return false;

    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey !== "referer" &&
      normalizedKey !== "next-url" &&
      normalizedKey !== "x-invoke-path" &&
      normalizedKey !== "x-matched-path"
    ) {
      return false;
    }

    return referencesAdminRoute(value);
  });
}

function referencesMessagesRoute(value?: string | null) {
  if (!value) return false;

  if (/(?:^|[^A-Za-z0-9_-])\/messages(?:[/?#)\]\s]|$)/.test(value)) {
    return true;
  }

  try {
    const pathname = new URL(value, "https://perfectaupair.example").pathname;
    return pathname === "/messages" || pathname.startsWith("/messages/");
  } catch {
    return false;
  }
}

function referencesPublicDiscoveryRoute(value?: string | null) {
  if (!value) return false;

  if (
    /(?:^|[^A-Za-z0-9_-])\/(?:search-aupair|search-family|profile\/[^/?#)\]\s]+)(?:[/?#)\]\s]|$)/.test(
      value,
    )
  ) {
    return true;
  }

  try {
    const pathname = new URL(value, "https://perfectaupair.example").pathname;
    return (
      pathname === "/search-aupair" ||
      pathname === "/search-family" ||
      pathname === "/profile/[id]" ||
      pathname.startsWith("/profile/")
    );
  } catch {
    return false;
  }
}

function isAdminTelemetryEvent(event: SentryEventLike) {
  return (
    referencesAdminRoute(event.request?.url) ||
    referencesAdminRoute(event.transaction) ||
    requestHeadersReferenceAdmin(event.request?.headers) ||
    Boolean(event.breadcrumbs?.some(breadcrumbReferencesAdmin))
  );
}

function sanitizeSentryEventWithClientContext<T extends SentryEventLike>(
  event: T,
  clientContext?: SentryClientContext,
) {
  if (
    isAdminAnalyticsPath(clientContext?.currentPath) ||
    isAdminTelemetryEvent(event)
  ) {
    return null;
  }

  // Instagram's iOS in-app browser injects this app:/// bridge code. It is not
  // served by Perfect AuPair, so discard only its exact error signature.
  if (isInjectedInstagramNativeBridgeError(event)) return null;

  // Huawei Browser injects its web-translation detector and calls Huawei's
  // dbankcloud endpoint. A failed detector request is not an application error.
  if (isInjectedHuaweiWebTranslationError(event)) return null;

  // Facebook's Android in-app browser injects this navigation bridge. Sentry
  // wraps its beforeunload callback before the window error guard can contain
  // the detached Java-object failure, so discard only the injected stack.
  if (isInjectedFacebookAndroidBridgeError(event)) return null;

  // Browsers surface ResizeObserver delivery limits as global errors without
  // an application stack. Keep any matching error that points into app code.
  if (isStacklessResizeObserverNotification(event)) return null;

  // Safari reports interrupted Next.js RSC navigation requests as a handled,
  // stackless `Load failed`. This happens when users switch conversations while
  // an older navigation/refresh is still in flight; the succeeding request
  // completes normally. Keep every other network failure observable.
  if (isInterruptedSafariMessagesNavigation(event, clientContext)) return null;

  // Mobile Safari can sporadically report a handled DOM NotFoundError while
  // React removes an already-detached node during public profile navigation.
  // Discard only the exact React reconciler stack; app frames and other DOM
  // failures remain observable.
  if (isSafariReactDomRemovalNoise(event, clientContext)) return null;

  if (event.user) {
    for (const key of Object.keys(event.user)) {
      delete event.user[key];
    }
  }

  if (event.request?.url) {
    event.request.url = sanitizedMonitoringUrl(event.request.url);
  }

  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
  }

  if (event.request?.headers) {
    for (const key of Object.keys(event.request.headers)) {
      const normalizedKey = key.toLowerCase();

      if (
        SENSITIVE_HEADER_NAMES.has(normalizedKey) ||
        SENSITIVE_HEADER_PREFIXES.some((prefix) =>
          normalizedKey.startsWith(prefix),
        )
      ) {
        delete event.request.headers[key];
      }
    }
  }

  if (event.transaction) {
    event.transaction = sanitizedTelemetryString(event.transaction);
  }

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) {
      exception.value = sanitizedTelemetryString(exception.value);
    }
  }

  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.message) {
      breadcrumb.message = sanitizedTelemetryString(breadcrumb.message);
    }

    if (breadcrumb.data) {
      sanitizeSentryRecord(breadcrumb.data);
    }
  }

  if (event.extra) {
    sanitizeSentryRecord(event.extra);
  }

  if (event.tags) {
    sanitizeSentryRecord(event.tags);
  }

  return event;
}

export function sanitizeSentryEvent<T extends SentryEventLike>(event: T) {
  return sanitizeSentryEventWithClientContext(event);
}

export function sanitizeBrowserSentryEvent<T extends SentryEventLike>(
  event: T,
  userAgent?: string | null,
  currentPath?: string | null,
) {
  return sanitizeSentryEventWithClientContext(event, {
    currentPath,
    userAgent,
  });
}
