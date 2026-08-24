import type { Metadata } from "next";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  SUPPORT_EMAIL,
  SOCIAL_PREVIEW_ALT,
  SOCIAL_PREVIEW_PATH,
} from "@/lib/site";
import { AnalyticsConsentManager } from "@/components/analytics/AnalyticsConsentManager";
import { FunnelAnalytics } from "@/components/analytics/FunnelAnalytics";
import { PrivacyAwareSpeedInsights } from "@/components/analytics/PrivacyAwareSpeedInsights";
import { InAppBrowserBridgeErrorGuard } from "@/components/browser/InAppBrowserBridgeErrorGuard";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { NavigationFeedback } from "@/components/navigation/NavigationFeedback";
import { getAnalyticsFeatureFlags } from "@/lib/feature-flags";
import {
  COOKIE_CONSENT_COOKIE_NAME,
  parseCookieConsentChoice,
} from "@/lib/analytics/consent";
import { getServerLocale } from "@/lib/i18n/server";
import {
  createTranslator,
  getDictionary,
} from "@/lib/i18n/translations";
import { cookies } from "next/headers";
import { Suspense } from "react";
import "./globals.css";

const googleSiteVerification =
  process.env.GOOGLE_SITE_VERIFICATION?.trim() ||
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
const enableHeatmapTools =
  process.env.NEXT_PUBLIC_ENABLE_HEATMAP_TOOLS === "true";
const hasConfiguredHeatmapTools = Boolean(
  enableHeatmapTools &&
    (process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim() ||
      process.env.NEXT_PUBLIC_HOTJAR_SITE_ID?.trim()),
);

const organizationStructuredData = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: SITE_NAME,
  alternateName: ["PerfectAuPair", "Perfect Au Pair"],
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  logo: `${SITE_URL}/icon.png`,
  email: SUPPORT_EMAIL,
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: SUPPORT_EMAIL,
    url: `${SITE_URL}/contact`,
    availableLanguage: [
      "English",
      "Spanish",
      "German",
      "French",
      "Dutch",
      "Italian",
    ],
  },
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: "/",
    images: [
      {
        url: SOCIAL_PREVIEW_PATH,
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: SOCIAL_PREVIEW_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: SOCIAL_PREVIEW_PATH,
        alt: SOCIAL_PREVIEW_ALT,
      },
    ],
  },
  icons: {
    icon: "/favicon.ico",
  },
  other: {
    google: "notranslate",
  },
  verification: googleSiteVerification
    ? {
        google: googleSiteVerification,
      }
    : undefined,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, cookieStore] = await Promise.all([
    getServerLocale(),
    cookies(),
  ]);
  const initialConsentChoice = parseCookieConsentChoice(
    cookieStore.get(COOKIE_CONSENT_COOKIE_NAME)?.value,
  );
  const analyticsFeatureFlags =
    hasConfiguredHeatmapTools && initialConsentChoice === "all"
      ? await getAnalyticsFeatureFlags()
      : { clarity: false, hotjar: false };
  const t = createTranslator(locale);
  const dictionary = getDictionary(locale);

  return (
    <html
      lang={locale}
      className="notranslate"
      data-scroll-behavior="smooth"
      translate="no"
    >
      <head>
        <InAppBrowserBridgeErrorGuard />
      </head>
      <body>
        <I18nProvider initialLocale={locale} dictionary={dictionary}>
          <NavigationFeedback />
          <a
            href="#pa-main-content"
            className="fixed left-4 top-4 z-[100001] -translate-y-24 rounded-full bg-[#101817] px-5 py-3 text-sm font-black text-white shadow-xl transition focus:translate-y-0 focus:outline-none focus:ring-4 focus:ring-[#9ebbc7]"
          >
            {t("common.skipToContent")}
          </a>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(organizationStructuredData),
            }}
          />
          <div id="pa-main-content" tabIndex={-1}>
            {children}
          </div>
          <Suspense fallback={null}>
            <FunnelAnalytics />
          </Suspense>
          <AnalyticsConsentManager
            clarityFeatureEnabled={analyticsFeatureFlags.clarity}
            hotjarFeatureEnabled={analyticsFeatureFlags.hotjar}
            initialConsentChoice={initialConsentChoice}
          />
          <PrivacyAwareSpeedInsights />
        </I18nProvider>
      </body>
    </html>
  );
}
