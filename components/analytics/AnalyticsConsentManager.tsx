"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Script from "next/script";
import {
  Analytics as VercelAnalytics,
  type BeforeSendEvent as VercelAnalyticsEvent,
} from "@vercel/analytics/next";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslations } from "@/components/i18n/I18nProvider";
import {
  COOKIE_CONSENT_OPEN_EVENT,
  type CookieConsentChoice,
  flushQueuedAnalyticsEvents,
  readCookieConsentChoice,
  saveCookieConsentChoice,
} from "@/lib/analytics/client";
import { isAnalyticsAllowedPath } from "@/lib/analytics/route-privacy";
import { isSessionReplayAllowedPath } from "@/lib/analytics/session-replay-routes";
import {
  genericMonitoringPageTitle,
  sanitizedMonitoringPath,
  sanitizedMonitoringUrl,
} from "@/lib/privacy/safe-monitoring-url";

const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";
const enableHeatmapTools =
  process.env.NEXT_PUBLIC_ENABLE_HEATMAP_TOOLS === "true";
const configuredClarityProjectId =
  process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim() ?? "";
const configuredHotjarSiteId =
  process.env.NEXT_PUBLIC_HOTJAR_SITE_ID?.trim() ?? "";
const configuredHotjarSiteIdNumber = Number(configuredHotjarSiteId);
const hasValidConfiguredHotjarSiteId =
  Boolean(configuredHotjarSiteId) &&
  Number.isFinite(configuredHotjarSiteIdNumber);
const hasConfiguredSessionReplayTools =
  enableHeatmapTools &&
  Boolean(configuredClarityProjectId || hasValidConfiguredHotjarSiteId);
const configuredHotjarVersion = Number(
  process.env.NEXT_PUBLIC_HOTJAR_VERSION?.trim() || "6",
);
const hotjarVersion = Number.isFinite(configuredHotjarVersion)
  ? configuredHotjarVersion
  : 6;

function filterVercelAnalyticsEvent(event: VercelAnalyticsEvent) {
  let eventUrl: URL;

  try {
    eventUrl = new URL(event.url, window.location.origin);
  } catch {
    return null;
  }

  if (
    !isAnalyticsAllowedPath(window.location.pathname) ||
    !isAnalyticsAllowedPath(eventUrl.pathname) ||
    !isSessionReplayAllowedPath(window.location.pathname) ||
    !isSessionReplayAllowedPath(eventUrl.pathname)
  ) {
    return null;
  }

  const safeUrl = sanitizedMonitoringUrl(eventUrl.toString());

  return safeUrl ? { ...event, url: safeUrl } : null;
}

function denyClarityConsent() {
  window.clarity?.("consentv2", {
    ad_Storage: "denied",
    analytics_Storage: "denied",
  });
  // Microsoft documents this call as the way to erase Clarity cookies and
  // prevent further tracking until consent is granted again.
  window.clarity?.("consent", false);
}

function denyOptionalAnalyticsConsent() {
  window.gtag?.("consent", "update", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  denyClarityConsent();
}

function AnalyticsScripts({
  enableHeatmaps,
  clarityProjectId,
  hotjarSiteId,
  initialPagePath,
}: {
  enableHeatmaps: boolean;
  clarityProjectId: string;
  hotjarSiteId: string;
  initialPagePath: string;
}) {
  const hotjarSiteIdNumber = Number(hotjarSiteId);
  const hasValidHotjarSiteId =
    Boolean(hotjarSiteId) && Number.isFinite(hotjarSiteIdNumber);
  const safeInitialPagePath = sanitizedMonitoringPath(initialPagePath);
  const safeInitialPageTitle = genericMonitoringPageTitle(safeInitialPagePath);
  const serializedGaMeasurementId = JSON.stringify(gaMeasurementId);
  const serializedInitialPagePath = JSON.stringify(safeInitialPagePath);
  const serializedInitialPageTitle = JSON.stringify(safeInitialPageTitle);

  useEffect(() => {
    window.paExternalTelemetryLoaded = true;

    if (enableHeatmaps) {
      window.paSessionReplayLoaded = true;
    }
  }, [enableHeatmaps]);

  return (
    <>
      <VercelAnalytics beforeSend={filterVercelAnalyticsEvent} />

      {gaMeasurementId ? (
        <>
          <Script
            id="pa-google-analytics-init"
            strategy="lazyOnload"
            onReady={flushQueuedAnalyticsEvents}
          >
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){window.dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('consent', 'default', {
                analytics_storage: 'granted',
                ad_storage: 'denied',
                ad_user_data: 'denied',
                ad_personalization: 'denied'
              });
              gtag('set', 'ads_data_redaction', true);
              gtag('js', new Date());
              var paInitialPagePath = ${serializedInitialPagePath};
              var paInitialPageContext = {
                page_path: paInitialPagePath,
                page_location: window.location.origin + paInitialPagePath,
                page_referrer: '',
                page_title: ${serializedInitialPageTitle}
              };
              gtag('set', paInitialPageContext);
              gtag('config', ${serializedGaMeasurementId}, {
                send_page_view: false,
                anonymize_ip: true,
                allow_google_signals: false,
                allow_ad_personalization_signals: false,
                ...paInitialPageContext
              });
            `}
          </Script>
          <Script
            id="pa-google-analytics-src"
            src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
            strategy="lazyOnload"
          />
        </>
      ) : null}

      {enableHeatmaps && clarityProjectId ? (
        <Script id="pa-clarity-init" strategy="lazyOnload">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${clarityProjectId}");
            window.clarity("consentv2", {
              ad_Storage: "denied",
              analytics_Storage: "granted"
            });
          `}
        </Script>
      ) : null}

      {enableHeatmaps && hasValidHotjarSiteId ? (
        <Script id="pa-hotjar-init" strategy="lazyOnload">
          {`
            (function(h,o,t,j,a,r){
              h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
              h._hjSettings={hjid:${hotjarSiteIdNumber},hjsv:${hotjarVersion}};
              a=o.getElementsByTagName('head')[0];
              r=o.createElement('script');r.async=1;
              r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
              a.appendChild(r);
            })(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');
          `}
        </Script>
      ) : null}
    </>
  );
}

type AnalyticsConsentManagerProps = {
  clarityFeatureEnabled?: boolean;
  hotjarFeatureEnabled?: boolean;
  initialConsentChoice?: CookieConsentChoice | null;
};

type ConsentView = "closed" | "banner" | "preferences";

function ConsentToggle({
  checked,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`relative mt-0.5 h-8 w-14 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25302d] ${
        checked ? "bg-[#5bd4b1]" : "bg-[#d9dedc]"
      } ${disabled ? "cursor-not-allowed opacity-80" : "cursor-pointer"}`}
    >
      <span
        className={`absolute left-0 top-1 size-6 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-7" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export function AnalyticsConsentManager({
  clarityFeatureEnabled = false,
  hotjarFeatureEnabled = false,
  initialConsentChoice = null,
}: AnalyticsConsentManagerProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const clarityProjectId =
    enableHeatmapTools && clarityFeatureEnabled ? configuredClarityProjectId : "";
  const hotjarSiteId =
    enableHeatmapTools && hotjarFeatureEnabled ? configuredHotjarSiteId : "";
  const hasOptionalTools = true;
  const [choice, setChoice] = useState<CookieConsentChoice | null>(
    initialConsentChoice,
  );
  const [view, setView] = useState<ConsentView>(
    initialConsentChoice ? "closed" : "banner",
  );
  const [analyticsSelected, setAnalyticsSelected] = useState(
    initialConsentChoice === "all",
  );
  const bannerRef = useRef<HTMLDivElement>(null);
  const analyticsAllowed = isAnalyticsAllowedPath(pathname);
  const isMessagesPath =
    pathname === "/messages" || pathname.startsWith("/messages/");
  const enableOptionalAnalytics = choice === "all" && analyticsAllowed;
  const sessionReplayAllowed = isSessionReplayAllowedPath(pathname);
  const hasEnabledSessionReplayTool =
    Boolean(clarityProjectId) ||
    (Boolean(hotjarSiteId) && Number.isFinite(Number(hotjarSiteId)));
  const enableHeatmaps =
    enableOptionalAnalytics &&
    sessionReplayAllowed &&
    hasEnabledSessionReplayTool;

  useEffect(() => {
    if (!hasOptionalTools) return;

    function openPreferences() {
      const savedChoice = readCookieConsentChoice();
      setAnalyticsSelected(savedChoice === "all");
      setView("preferences");
    }

    window.addEventListener(COOKIE_CONSENT_OPEN_EVENT, openPreferences);

    return () => {
      window.removeEventListener(COOKIE_CONSENT_OPEN_EVENT, openPreferences);
    };
  }, [hasOptionalTools]);

  useEffect(() => {
    if (view !== "preferences") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setView(choice ? "closed" : "banner");
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [choice, view]);

  useEffect(() => {
    if (!enableOptionalAnalytics) return;

    const timeout = window.setTimeout(flushQueuedAnalyticsEvents, 0);

    return () => window.clearTimeout(timeout);
  }, [enableOptionalAnalytics]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const bannerElement = bannerRef.current;

    if (view !== "banner" || !bannerElement) {
      root.style.removeProperty("--pa-cookie-consent-clearance");
      return;
    }

    function updateClearance() {
      const bannerTop = bannerRef.current?.getBoundingClientRect().top;
      if (bannerTop === undefined) return;

      const clearance = Math.max(0, window.innerHeight - bannerTop);

      root.style.setProperty(
        "--pa-cookie-consent-clearance",
        `${Math.ceil(clearance)}px`,
      );
    }

    updateClearance();

    const resizeObserver = new ResizeObserver(updateClearance);
    resizeObserver.observe(bannerElement);
    window.addEventListener("resize", updateClearance);
    window.visualViewport?.addEventListener("resize", updateClearance);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateClearance);
      window.visualViewport?.removeEventListener("resize", updateClearance);
      root.style.removeProperty("--pa-cookie-consent-clearance");
    };
  }, [pathname, view]);

  useLayoutEffect(() => {
    if (!sessionReplayAllowed) {
      document.body.removeAttribute("data-clarity-unmask");
      document.body.setAttribute("data-clarity-mask", "true");
      document.body.setAttribute("data-hj-suppress", "");

      denyClarityConsent();

      // Replay scripts cannot be unloaded after an SPA transition. Reload the
      // private route once so the new document never initializes Clarity or
      // Hotjar and cannot retain the preceding recording session.
      if (
        window.paSessionReplayLoaded ||
        typeof window.clarity === "function" ||
        typeof window.hj === "function"
      ) {
        window.location.reload();
      }

      return;
    }

    document.body.removeAttribute("data-clarity-unmask");
    document.body.removeAttribute("data-clarity-mask");
    document.body.removeAttribute("data-hj-suppress");
  }, [sessionReplayAllowed]);

  useLayoutEffect(() => {
    if (analyticsAllowed) return;

    window.paAnalyticsQueue = [];
    denyOptionalAnalyticsConsent();

    // A direct admin entry never initializes optional analytics. If an admin
    // route is reached through client navigation after third-party scripts
    // were already loaded, replace that document once so those scripts cannot
    // remain active inside the private admin area.
    if (
      window.paExternalTelemetryLoaded ||
      typeof window.gtag === "function" ||
      typeof window.clarity === "function" ||
      typeof window.hj === "function"
    ) {
      window.location.reload();
    }
  }, [analyticsAllowed]);

  useEffect(() => {
    return () => {
      document.body.removeAttribute("data-clarity-unmask");
      document.body.removeAttribute("data-clarity-mask");
      document.body.removeAttribute("data-hj-suppress");
    };
  }, []);

  const saveChoice = useCallback(
    (nextChoice: CookieConsentChoice) => {
      const previousChoice = choice;
      const effectiveChoice = saveCookieConsentChoice(nextChoice);

      setChoice(effectiveChoice);
      setAnalyticsSelected(effectiveChoice === "all");
      setView("closed");

      if (
        hasConfiguredSessionReplayTools &&
        previousChoice !== "all" &&
        effectiveChoice === "all"
      ) {
        router.refresh();
      }

      if (previousChoice === "all" && effectiveChoice === "necessary") {
        denyOptionalAnalyticsConsent();
        window.setTimeout(() => window.location.reload(), 50);
      }
    },
    [choice, router],
  );

  if (!hasOptionalTools || !analyticsAllowed) {
    return null;
  }

  return (
    <>
      {enableOptionalAnalytics ? (
        <AnalyticsScripts
          enableHeatmaps={enableHeatmaps}
          clarityProjectId={clarityProjectId}
          hotjarSiteId={hotjarSiteId}
          initialPagePath={pathname}
        />
      ) : null}

      {view === "banner" ? (
        <div
          ref={bannerRef}
          className={[
            "pa-cookie-consent-banner pointer-events-none fixed inset-x-0 z-[90] flex justify-center px-3 py-2 sm:p-6",
            isMessagesPath
              ? "pa-cookie-consent-banner--messages bottom-auto top-[calc(4rem+env(safe-area-inset-top))] sm:top-20"
              : "pa-cookie-consent-banner--bottom bottom-[calc(0.75rem+env(safe-area-inset-bottom))] sm:bottom-0",
          ].join(" ")}
        >
          <section
            role="dialog"
            aria-live="polite"
            aria-label={t("cookieConsent.title")}
            className="pointer-events-auto w-full max-w-3xl rounded-2xl border border-[#d6e2e8] bg-white p-3 text-[#25302d] shadow-[0_18px_60px_rgba(38,63,69,0.22)] sm:p-5"
          >
            <div className="sm:flex sm:items-center sm:gap-6">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black tracking-tight text-[#25302d] sm:text-lg">
                  {t("cookieConsent.title")}
                </h2>
                <p className="mt-0.5 text-xs font-semibold leading-4 text-[#52666a] sm:mt-1 sm:text-sm sm:leading-5">
                  {t("cookieConsent.prompt")}{" "}
                  <Link
                    href="/cookie-policy"
                    className="whitespace-nowrap font-black text-[var(--pa-primary)] underline decoration-[var(--pa-primary)]/35 underline-offset-2 transition hover:decoration-[var(--pa-primary)]"
                  >
                    {t("cookieConsent.policyLink")}
                  </Link>
                </p>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-0 sm:w-[22rem] sm:shrink-0 sm:gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setAnalyticsSelected(false);
                    setView("preferences");
                  }}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-[#9eb3bd] bg-white px-3 text-sm font-black text-[#25302d] transition hover:border-[var(--pa-primary)] hover:bg-[var(--pa-primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-primary-focus-ring)] focus-visible:ring-offset-2 sm:min-h-12 sm:px-4"
                >
                  {t("cookieConsent.letMeChoose")}
                </button>
                <button
                  type="button"
                  onClick={() => saveChoice("all")}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--pa-primary)] px-3 text-sm font-black text-[var(--pa-primary-ink)] shadow-sm transition hover:bg-[var(--pa-primary-hover)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-primary-focus-ring)] focus-visible:ring-offset-2 sm:min-h-12 sm:px-4"
                >
                  {t("cookieConsent.acceptAll")}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {view === "preferences" ? (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/55 p-4">
          <div className="flex min-h-full items-center justify-center">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="cookie-preferences-title"
              className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white text-[#25302d] shadow-xl shadow-black/25"
            >
              <div className="p-5 sm:p-6">
                <button
                  type="button"
                  aria-label={t("cookieConsent.close")}
                  onClick={() => setView(choice ? "closed" : "banner")}
                  className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full text-2xl font-light leading-none text-[#25302d]/70 transition hover:bg-black/5 hover:text-[#25302d] sm:right-4 sm:top-4"
                >
                  <span aria-hidden="true">×</span>
                </button>

                <h2
                  id="cookie-preferences-title"
                  className="max-w-[90%] text-2xl font-black tracking-tight sm:text-3xl"
                >
                  {t("cookieConsent.preferencesTitle")}
                </h2>
                <p className="mt-4 max-w-xl text-sm font-semibold leading-5 text-[#25302d]/70 sm:leading-6">
                  {t("cookieConsent.preferencesBody")}
                </p>
              </div>

              <div className="border-y border-black/15 px-5 sm:px-6">
                <div className="flex gap-3 border-b border-black/10 py-4">
                  <ConsentToggle
                    checked
                    disabled
                    label={t("cookieConsent.necessaryTitle")}
                  />
                  <div>
                    <h3 className="font-black">
                      {t("cookieConsent.necessaryTitle")}{" "}
                      <span className="text-sm font-bold text-[#25302d]/55">
                        ({t("cookieConsent.alwaysRequired")})
                      </span>
                    </h3>
                    <p className="mt-1.5 text-sm font-semibold leading-5 text-[#25302d]/65">
                      {t("cookieConsent.necessaryDescription")}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 py-4">
                  <ConsentToggle
                    checked={analyticsSelected}
                    label={t("cookieConsent.analyticsTitle")}
                    onChange={setAnalyticsSelected}
                  />
                  <div>
                    <h3 className="font-black">
                      {t("cookieConsent.analyticsTitle")}
                    </h3>
                    <p className="mt-1.5 text-sm font-semibold leading-5 text-[#25302d]/65">
                      {t("cookieConsent.analyticsDescription")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2.5 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <button
                  type="button"
                  onClick={() =>
                    saveChoice(analyticsSelected ? "all" : "necessary")
                  }
                  className="inline-flex h-11 items-center justify-center rounded-xl border-2 border-[#9eb3bd] bg-white px-5 text-sm font-black text-[#25302d] transition hover:border-[var(--pa-primary)] hover:bg-[var(--pa-primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-primary-focus-ring)] focus-visible:ring-offset-2"
                >
                  {t("cookieConsent.acceptSelected")}
                </button>
                <button
                  type="button"
                  onClick={() => saveChoice("all")}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--pa-primary)] px-5 text-sm font-black text-[var(--pa-primary-ink)] shadow-sm transition hover:bg-[var(--pa-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-primary-focus-ring)] focus-visible:ring-offset-2"
                >
                  {t("cookieConsent.acceptAll")}
                </button>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
}
