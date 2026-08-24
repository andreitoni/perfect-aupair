"use client";

import { useTranslations } from "@/components/i18n/I18nProvider";
import { openCookiePreferences } from "@/lib/analytics/client";

export function CookiePreferencesButton() {
  const t = useTranslations();

  return (
    <button
      type="button"
      onClick={openCookiePreferences}
      className="mt-3 inline-flex h-11 items-center justify-center rounded-full bg-[var(--pa-primary)] px-5 text-sm font-black text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)]"
    >
      {t("cookieConsent.changeChoices")}
    </button>
  );
}
