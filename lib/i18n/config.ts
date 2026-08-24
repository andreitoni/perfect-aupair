export const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧", locale: "en-US" },
  { code: "es", label: "Español", flag: "🇪🇸", locale: "es-ES" },
  { code: "de", label: "Deutsch", flag: "🇩🇪", locale: "de-DE" },
  { code: "fr", label: "Français", flag: "🇫🇷", locale: "fr-FR" },
  { code: "nl", label: "Nederlands", flag: "🇳🇱", locale: "nl-NL" },
  { code: "it", label: "Italiano", flag: "🇮🇹", locale: "it-IT" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: LanguageCode = "en";
export const LANGUAGE_STORAGE_KEY = "pa_locale";
export const LANGUAGE_COOKIE_NAME = "pa_locale";
export const LANGUAGE_PREFERENCE_VERSION = "2026-08-02-english-default";
export const LANGUAGE_PREFERENCE_VERSION_KEY = "pa_locale_version";
export const LANGUAGE_CHANGE_EVENT = "pa:language-change";
export const ROUTE_LOCALE_HEADER = "x-pa-route-locale";

export function isLanguageCode(value: string): value is LanguageCode {
  return LANGUAGES.some((language) => language.code === value);
}

export function getLanguage(value: string | null | undefined): LanguageCode {
  return value && isLanguageCode(value) ? value : DEFAULT_LANGUAGE;
}

export function getLocaleTag(locale: LanguageCode) {
  return LANGUAGES.find((language) => language.code === locale)?.locale ?? "en-US";
}

export function getRouteLocale(pathname: string): LanguageCode | null {
  const normalizedPathname =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  if (
    normalizedPathname === "/de" ||
    normalizedPathname.startsWith("/de/")
  ) {
    return "de";
  }

  if (normalizedPathname === "/guides/best-au-pair-website") {
    return "en";
  }

  return null;
}
