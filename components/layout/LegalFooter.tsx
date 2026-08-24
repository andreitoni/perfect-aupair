"use client";

import Link from "next/link";
import {
  useLocale,
  useTranslations,
} from "@/components/i18n/I18nProvider";
import { formatCountryName } from "@/lib/i18n/formatters";

const FOOTER_LINKS = [
  { href: "/about", label: "common.aboutUs" },
  { href: "/guides", label: "common.countryGuides" },
  { href: "/cookie-policy", label: "common.cookiePolicy" },
  { href: "/safety", label: "common.safetyCenter" },
  { href: "/privacy", label: "common.privacy" },
  { href: "/terms", label: "common.terms" },
  { href: "/contact", label: "common.contact" },
] as const;

const MULTILINGUAL_GUIDE_LINKS = [
  { href: "/guides/germany", country: "Germany" },
  { href: "/guides/united-kingdom", country: "United Kingdom" },
  { href: "/guides/united-states", country: "United States" },
  { href: "/guides/sweden", country: "Sweden" },
  { href: "/guides/denmark", country: "Denmark" },
] as const;

const GERMAN_GUIDE_LINKS = [
  { href: "/de/ratgeber", country: "Germany" },
  { href: "/de/au-pair-finden-oesterreich", country: "Austria" },
  { href: "/de/au-pair-finden-schweiz", country: "Switzerland" },
  { href: "/guides/sweden", country: "Sweden" },
  { href: "/guides/denmark", country: "Denmark" },
] as const;

export function LegalFooter() {
  const locale = useLocale();
  const t = useTranslations();
  const guideLinks =
    locale === "de" ? GERMAN_GUIDE_LINKS : MULTILINGUAL_GUIDE_LINKS;

  return (
    <footer className="mt-auto shrink-0 border-t border-black/5 bg-[var(--background)]">
      <div className="pa-page-chrome py-2 text-[0.7rem] font-semibold text-[#52636a] sm:py-4 sm:text-sm">
        <div className="flex flex-col gap-1.5 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
            <p>© {new Date().getFullYear()} Perfect AuPair</p>
          </div>

          <nav
            aria-label={t("common.legalLinks")}
            className="flex flex-wrap gap-x-2.5 gap-y-0.5 sm:gap-x-4 sm:gap-y-1"
          >
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                prefetch={false}
                className="inline-flex min-h-9 items-center leading-4 transition hover:text-[#25302d] sm:min-h-6 sm:leading-5"
              >
                {t(link.label)}
              </Link>
            ))}
            {guideLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                prefetch={false}
                className="inline-flex min-h-9 items-center leading-4 transition hover:text-[#25302d] sm:min-h-6 sm:leading-5"
              >
                {formatCountryName(link.country, locale, t)}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
