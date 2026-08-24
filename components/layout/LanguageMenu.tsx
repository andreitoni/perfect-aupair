"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveLanguage,
  useLocale,
  useTranslations,
} from "@/components/i18n/I18nProvider";
import {
  LANGUAGES,
  type LanguageCode,
} from "@/lib/i18n/config";

type LanguageMenuProps = {
  variant?: "button" | "menu";
  onLanguageChosen?: () => void;
};

export function LanguageMenu({
  variant = "button",
  onLanguageChosen,
}: LanguageMenuProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const router = useRouter();
  const t = useTranslations();
  const languageCode = useLocale();
  const [, startTransition] = useTransition();

  const currentLanguage =
    LANGUAGES.find((language) => language.code === languageCode) ?? LANGUAGES[0];

  function chooseLanguage(nextLanguageCode: LanguageCode) {
    saveLanguage(nextLanguageCode);
    detailsRef.current?.removeAttribute("open");
    onLanguageChosen?.();
    startTransition(() => {
      router.refresh();
    });
  }

  if (variant === "menu") {
    return (
      <div className="space-y-2" data-i18n-skip>
        <p className="px-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#5d727a]">
          {t("language.menuTitle")}
        </p>

        <div className="grid grid-cols-2 gap-1.5">
          {LANGUAGES.map((language) => (
            <button
              key={language.code}
              type="button"
              onClick={() => chooseLanguage(language.code)}
              className={`flex min-w-0 items-center gap-2 rounded-[0.85rem] px-2.5 py-2 text-left text-sm font-black transition ${
                language.code === languageCode
                  ? "bg-[#e7f1f5] text-[#25302d] ring-1 ring-[#c7dce6]"
                  : "text-[#25302d]/68 hover:bg-[#f3f7f8] hover:text-[#25302d]"
              }`}
            >
              <span className="text-lg" aria-hidden="true">
                {language.flag}
              </span>
              <span className="min-w-0 truncate">{language.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <details ref={detailsRef} className="group relative" data-i18n-skip>
      <summary
        className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full bg-[var(--pa-header-button-bg)] text-lg shadow-sm ring-1 ring-[#c7d1d6]/70 transition hover:-translate-y-0.5 hover:bg-[var(--pa-header-button-hover)] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#6f8793]/30 sm:text-xl [&::-webkit-details-marker]:hidden"
        aria-label={t("language.current", { language: currentLanguage.label })}
        title={t("language.title", { language: currentLanguage.label })}
      >
        <span aria-hidden="true">{currentLanguage.flag}</span>
      </summary>

      <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 hidden min-w-40 overflow-hidden rounded-[1rem] bg-white p-1 shadow-lg ring-1 ring-black/10 group-open:block">
        {LANGUAGES.map((language) => (
          <button
            key={language.code}
            type="button"
            onClick={() => chooseLanguage(language.code)}
            className={`flex w-full items-center gap-3 rounded-[0.8rem] px-3 py-2 text-left text-sm font-black transition ${
              language.code === languageCode
                ? "bg-[#eef4f6] text-[#25302d]"
                : "text-[#25302d]/62 hover:bg-[var(--background)] hover:text-[#25302d]"
            }`}
          >
            <span className="text-xl" aria-hidden="true">
              {language.flag}
            </span>
            <span>{language.label}</span>
          </button>
        ))}
      </div>
    </details>
  );
}
