"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_CHANGE_EVENT,
  LANGUAGE_COOKIE_NAME,
  LANGUAGE_PREFERENCE_VERSION,
  LANGUAGE_PREFERENCE_VERSION_KEY,
  LANGUAGE_STORAGE_KEY,
  type LanguageCode,
} from "@/lib/i18n/config";
import {
  createDictionaryTranslator,
  hasDictionaryKey,
} from "@/lib/i18n/client-translator";
import type {
  Dictionary,
  I18nKey,
  Translate,
} from "@/lib/i18n/translations";

type I18nContextValue = {
  locale: LanguageCode;
  hasKey: (value: string) => value is I18nKey;
  t: Translate;
};

const I18nContext = createContext<I18nContextValue | null>(null);
const stableDictionaries = new Map<LanguageCode, Dictionary>();

function getStableDictionary(locale: LanguageCode, dictionary: Dictionary) {
  const cachedDictionary = stableDictionaries.get(locale);

  if (cachedDictionary) return cachedDictionary;

  stableDictionaries.set(locale, dictionary);
  return dictionary;
}

export function saveLanguage(language: LanguageCode) {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  window.localStorage.setItem(
    LANGUAGE_PREFERENCE_VERSION_KEY,
    LANGUAGE_PREFERENCE_VERSION,
  );
  document.cookie = `${LANGUAGE_COOKIE_NAME}=${language}; path=/; max-age=31536000; SameSite=Lax`;
  document.cookie = `${LANGUAGE_PREFERENCE_VERSION_KEY}=${LANGUAGE_PREFERENCE_VERSION}; path=/; max-age=31536000; SameSite=Lax`;
  window.dispatchEvent(
    new CustomEvent(LANGUAGE_CHANGE_EVENT, {
      detail: { language },
    }),
  );
}

function syncBrowserLanguage(language: LanguageCode) {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  window.localStorage.setItem(
    LANGUAGE_PREFERENCE_VERSION_KEY,
    LANGUAGE_PREFERENCE_VERSION,
  );
  document.cookie = `${LANGUAGE_COOKIE_NAME}=${language}; path=/; max-age=31536000; SameSite=Lax`;
  document.cookie = `${LANGUAGE_PREFERENCE_VERSION_KEY}=${LANGUAGE_PREFERENCE_VERSION}; path=/; max-age=31536000; SameSite=Lax`;
}

export function I18nProvider({
  children,
  dictionary,
  initialLocale = DEFAULT_LANGUAGE,
  preferInitialLocale = false,
}: {
  children: ReactNode;
  dictionary: Dictionary;
  initialLocale?: LanguageCode;
  preferInitialLocale?: boolean;
}) {
  useEffect(() => {
    const previousDocumentLanguage = document.documentElement.lang;
    const animationFrame = window.requestAnimationFrame(() => {
      if (!preferInitialLocale) {
        syncBrowserLanguage(initialLocale);
      }
      document.documentElement.lang = initialLocale;
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (preferInitialLocale) {
        document.documentElement.lang = previousDocumentLanguage;
      }
    };
  }, [initialLocale, preferInitialLocale]);

  const stableDictionary = getStableDictionary(initialLocale, dictionary);
  const value = useMemo(
    () => ({
      locale: initialLocale,
      hasKey: (value: string): value is I18nKey =>
        hasDictionaryKey(stableDictionary, value),
      t: createDictionaryTranslator(stableDictionary),
    }),
    [initialLocale, stableDictionary],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useLocale must be used inside I18nProvider.");
  }
  return context.locale;
}

export function useHasTranslationKey() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useHasTranslationKey must be used inside I18nProvider.");
  }
  return context.hasKey;
}

export function useTranslations() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslations must be used inside I18nProvider.");
  }
  return context.t;
}
