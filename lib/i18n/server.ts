import { cookies, headers } from "next/headers";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE_NAME,
  LANGUAGE_PREFERENCE_VERSION,
  LANGUAGE_PREFERENCE_VERSION_KEY,
  ROUTE_LOCALE_HEADER,
  createTranslator,
  getLanguage,
} from "@/lib/i18n/translations";

export async function getServerLocale() {
  try {
    const requestHeaders = await headers();
    const routeLocale = getLanguage(
      requestHeaders.get(ROUTE_LOCALE_HEADER),
    );

    if (requestHeaders.has(ROUTE_LOCALE_HEADER)) {
      return routeLocale;
    }

    const cookieStore = await cookies();
    if (
      cookieStore.get(LANGUAGE_PREFERENCE_VERSION_KEY)?.value !==
      LANGUAGE_PREFERENCE_VERSION
    ) {
      return DEFAULT_LANGUAGE;
    }

    return getLanguage(cookieStore.get(LANGUAGE_COOKIE_NAME)?.value);
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export async function getServerTranslator() {
  const locale = await getServerLocale();
  return {
    locale,
    t: createTranslator(locale),
  };
}
