"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LogoMark } from "@/components/brand/LogoMark";
import {
  saveLanguage,
  useLocale,
  useTranslations,
} from "@/components/i18n/I18nProvider";
import {
  LANGUAGES,
  type LanguageCode,
} from "@/lib/i18n/config";

export type PublicSimpleHeaderMode = "login" | "register";

type PublicSimpleHeaderProps = {
  mode?: PublicSimpleHeaderMode;
  onSwitchMode?: (nextMode: PublicSimpleHeaderMode) => void;
};

export function PublicSimpleHeader({
  mode,
  onSwitchMode,
}: PublicSimpleHeaderProps) {
  const router = useRouter();
  const t = useTranslations();
  const languageCode = useLocale();
  const [, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
  }

  function chooseLanguage(nextLanguageCode: LanguageCode) {
    saveLanguage(nextLanguageCode);
    closeMenu();
    startTransition(() => {
      router.refresh();
    });
  }

  function chooseMode(nextMode: PublicSimpleHeaderMode) {
    closeMenu();

    if (onSwitchMode) {
      onSwitchMode(nextMode);
      return;
    }

    router.push(`/login?mode=${nextMode}`);
  }

  const infoLinks = [
    { href: "/about", label: t("common.aboutUs") },
    { href: "/safety", label: t("common.safetyCenter") },
    { href: "/guides", label: t("common.countryGuides") },
    { href: "/contact", label: t("common.contact") },
    { href: "/privacy", label: t("legal.privacy") },
    { href: "/terms", label: t("legal.terms") },
  ];
  const modeButtonClass =
    "flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-black transition";
  const desktopModeButtonClass =
    "hidden h-11 min-w-28 items-center justify-center rounded-full px-5 text-sm font-black shadow-sm ring-1 ring-[#c7d1d6]/70 transition lg:inline-flex";

  function modeButtonState(nextMode: PublicSimpleHeaderMode) {
    return mode === nextMode
      ? "bg-[var(--pa-primary)] text-[var(--pa-primary-ink)]"
      : "bg-[var(--pa-header-button-bg)] text-[var(--pa-header-button-text)] hover:bg-[var(--pa-header-button-hover)]";
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[#d7e1e6]/80 bg-white/96 shadow-[0_1px_14px_rgba(38,63,69,0.06)] backdrop-blur">
      <div className="pa-page-chrome flex items-center justify-between py-2 sm:py-4">
        <Link
          href="/"
          prefetch={false}
          aria-label={t("common.perfectAuPair")}
          className="flex min-w-0 items-center gap-3 rounded-full pr-3"
        >
          <LogoMark
            decorative
            className="h-11 w-11 bg-white shadow-sm ring-2 ring-[#bfd6df]/80 sm:h-[3.25rem] sm:w-[3.25rem]"
          />
          <span className="truncate text-lg font-black tracking-tight text-[#172426] sm:text-[1.35rem] sm:leading-7">
            Perfect AuPair
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2" data-i18n-skip>
          <button
            type="button"
            onClick={() => chooseMode("register")}
            className={`${desktopModeButtonClass} ${modeButtonState("register")}`}
          >
            {t("nav.register")}
          </button>
          <button
            type="button"
            onClick={() => chooseMode("login")}
            className={`${desktopModeButtonClass} ${modeButtonState("login")}`}
          >
            {t("nav.login")}
          </button>

          <div className="relative">
            <button
              type="button"
              aria-label={t("nav.menu")}
              aria-expanded={menuOpen}
              aria-controls="public-simple-header-menu"
              title={t("nav.menu")}
              onClick={() => setMenuOpen((current) => !current)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--pa-header-button-bg)] text-[var(--pa-header-button-text)] shadow-sm ring-1 ring-[#c7d1d6]/70 transition hover:bg-[var(--pa-header-button-hover)] focus:outline-none focus:ring-2 focus:ring-[#6f8793]/30"
            >
              {menuOpen ? (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="2.4"
                >
                  <path d="M6 6l12 12" />
                  <path d="M18 6L6 18" />
                </svg>
              ) : (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="2.4"
                >
                  <path d="M4 7h16" />
                  <path d="M4 12h16" />
                  <path d="M4 17h16" />
                </svg>
              )}
            </button>

            {menuOpen ? (
              <div
                id="public-simple-header-menu"
                className="absolute right-0 top-[calc(100%+0.75rem)] w-[min(calc(100vw-2rem),22rem)] overflow-hidden rounded-[1.25rem] border border-black/10 bg-white p-3 shadow-2xl shadow-[#25302d]/12"
              >
                <div className="grid grid-cols-2 gap-2 lg:hidden">
                  <button
                    type="button"
                    onClick={() => chooseMode("register")}
                    className={`${modeButtonClass} ${modeButtonState("register")}`}
                  >
                    {t("nav.register")}
                  </button>
                  <button
                    type="button"
                    onClick={() => chooseMode("login")}
                    className={`${modeButtonClass} ${modeButtonState("login")}`}
                  >
                    {t("nav.login")}
                  </button>
                </div>

                <div className="border-black/8 pt-1 lg:pt-0 max-lg:mt-4 max-lg:border-t max-lg:pt-4">
                  <p className="px-1 text-xs font-black uppercase tracking-[0.14em] text-[#25302d]/45">
                    {t("language.menuTitle")}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {LANGUAGES.map((language) => (
                      <button
                        key={language.code}
                        type="button"
                        onClick={() => chooseLanguage(language.code)}
                        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${
                          language.code === languageCode
                            ? "bg-[#e7f1f5] text-[#25302d] ring-1 ring-[#9ebbc7]/70"
                            : "bg-white text-[#25302d]/68 hover:bg-[var(--background)] hover:text-[#25302d]"
                        }`}
                      >
                        <span className="text-lg" aria-hidden="true">
                          {language.flag}
                        </span>
                        <span className="truncate">{language.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <nav className="mt-4 grid gap-1 border-t border-black/8 pt-3">
                  {infoLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      prefetch={false}
                      onClick={closeMenu}
                      className="rounded-xl px-3 py-2 text-sm font-bold text-[#25302d]/72 transition hover:bg-[var(--background)] hover:text-[#25302d]"
                    >
                      {link.label}
                    </Link>
                  ))}
                </nav>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
