"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LanguageMenu } from "@/components/layout/LanguageMenu";
import {
  useHasTranslationKey,
  useLocale,
  useTranslations,
} from "@/components/i18n/I18nProvider";
import { LogoMark } from "@/components/brand/LogoMark";
import { BookmarkIcon } from "@/components/icons/BookmarkIcon";
import type { I18nKey } from "@/lib/i18n/translations";

const AccountMenu = dynamic(() =>
  import("@/components/layout/AccountMenu").then((module) => module.AccountMenu),
);
const FindProfilesNavLink = dynamic(() =>
  import("@/components/layout/FindProfilesNavLink").then(
    (module) => module.FindProfilesNavLink,
  ),
);
const MobileAppNav = dynamic(() =>
  import("@/components/layout/MobileAppNav").then(
    (module) => module.MobileAppNav,
  ),
);
const MessagesNavLink = dynamic(() =>
  import("@/components/messages/MessagesNavLink").then(
    (module) => module.MessagesNavLink,
  ),
);
const NotificationsNavButton = dynamic(() =>
  import("@/components/notifications/NotificationsNavButton").then(
    (module) => module.NotificationsNavButton,
  ),
);
const ProfileDiscoverySearch = dynamic(() =>
  import("@/components/search/ProfileDiscoverySearch").then(
    (module) => module.ProfileDiscoverySearch,
  ),
);

type HeaderProps = {
  subtitle?: I18nKey | string;
  authState?: "public" | "authenticated" | "admin";
  accountType?: "family" | "au_pair" | null;
  initialProfilePhotoUrl?: string | null;
  showPublicActions?: boolean;
  showLanguageMenu?: boolean;
  showMobileNavigation?: boolean;
  width?: "default" | "full";
};

function LogOutIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 sm:h-4 sm:w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
    >
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M13 4h5a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-5" />
    </svg>
  );
}

export function Header({
  subtitle = "app.subtitle",
  authState = "public",
  accountType = null,
  initialProfilePhotoUrl = null,
  showPublicActions = true,
  showLanguageMenu = true,
  showMobileNavigation = true,
  width = "default",
}: HeaderProps) {
  const t = useTranslations();
  const hasTranslationKey = useHasTranslationKey();
  const locale = useLocale();
  const pathname = usePathname();
  const [showDesktopAuthenticatedChrome, setShowDesktopAuthenticatedChrome] =
    useState(false);
  const subtitleText = hasTranslationKey(subtitle) ? t(subtitle) : subtitle;
  const isUserAppHeader = authState === "authenticated";
  const isAdminHeader = authState === "admin";
  const hasPublicActions = authState === "public" && showPublicActions;
  const showStandaloneLanguageMenu =
    showLanguageMenu && !isUserAppHeader && !isAdminHeader;
  const profileSearchTarget =
    pathname === "/search-aupair"
      ? "au_pair"
      : pathname === "/search-family"
        ? "family"
        : null;
  const desktopProfileSearchTarget = isUserAppHeader
    ? profileSearchTarget
    : null;
  const authenticatedHomeHref =
    accountType === "family"
      ? "/search-aupair"
      : accountType === "au_pair"
        ? "/search-family"
        : "/auth/home";
  const showMobileAppNav =
    isUserAppHeader &&
    showMobileNavigation &&
    pathname !== "/onboarding" &&
    !pathname?.startsWith("/onboarding/") &&
    pathname !== "/profile/photos";

  useEffect(() => {
    if (!isUserAppHeader) return;

    const desktopViewport = window.matchMedia("(min-width: 640px)");
    const updateDesktopChrome = () => {
      setShowDesktopAuthenticatedChrome(desktopViewport.matches);
    };

    updateDesktopChrome();
    desktopViewport.addEventListener("change", updateDesktopChrome);

    return () => {
      desktopViewport.removeEventListener("change", updateDesktopChrome);
    };
  }, [isUserAppHeader]);
  const brandHref =
    authState === "public"
      ? "/"
      : authState === "admin"
        ? "/admin"
        : authenticatedHomeHref;
  const chromeClass =
    width === "full"
      ? "w-full px-4 sm:px-4 lg:px-5"
      : "pa-page-chrome";
  const headerRowClass = [
    chromeClass,
    hasPublicActions
      ? "flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-3"
      : "flex items-center gap-2 py-1.5 sm:gap-3 sm:py-2",
    isUserAppHeader
      ? "justify-end sm:justify-between"
      : hasPublicActions
        ? ""
        : "justify-between",
  ].join(" ");
  const brandRowClass = hasPublicActions
    ? "flex items-center justify-between gap-2 sm:contents"
    : "contents";
  const brandClass = [
    "group min-w-0 shrink-0 items-center gap-3.5 rounded-full pr-2 transition",
    isUserAppHeader ? "hidden sm:flex" : "flex",
  ].join(" ");
  const publicAuthButtonClass =
    "inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[var(--pa-header-button-bg)] px-3 text-xs font-black leading-none text-[var(--pa-header-button-text)] shadow-sm ring-1 ring-[#c7d1d6]/70 transition hover:bg-[var(--pa-header-button-hover)] sm:h-10 sm:px-4 sm:text-sm";
  const publicFindButtonClass =
    "inline-flex h-10 min-w-0 items-center justify-center rounded-full px-3 text-sm font-black leading-none shadow-sm ring-1 transition sm:h-10 sm:w-auto sm:px-4";

  return (
    <>
      <header
        className={[
          "sticky top-0 z-40 border-b border-[#cfd9de]/80 bg-white/95 shadow-[0_1px_18px_rgba(38,63,69,0.08)] backdrop-blur",
          isUserAppHeader ? "hidden sm:block" : "",
        ].join(" ")}
      >
        <div className={headerRowClass}>
          <div className={brandRowClass}>
            <Link
              href={brandHref}
              prefetch={false}
              aria-label={`${t("common.perfectAuPair")} ${subtitleText}`}
              className={brandClass}
            >
              <LogoMark
                decorative
                className="h-9 w-9 bg-white shadow-sm ring-2 ring-[#bfd6df]/80 transition group-hover:ring-[#adc9d4] sm:h-[3.25rem] sm:w-[3.25rem]"
              />

              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-lg font-black tracking-tight text-[#172426] sm:text-[1.35rem] sm:leading-7">
                  Perfect AuPair
                </p>
                <p className="mt-0.5 inline-flex rounded-full bg-[#e7f1f5] px-2.5 py-0.5 text-sm font-black leading-5 text-[#45636f] ring-1 ring-[#c7dce6]">
                  {subtitleText}
                </p>
              </div>
            </Link>

            {hasPublicActions ? (
              <div className="flex shrink-0 items-center gap-1 sm:hidden">
                <Link
                  href="/login?mode=register"
                  prefetch={false}
                  className={publicAuthButtonClass}
                >
                  {t("nav.register")}
                </Link>
                <Link
                  href="/login?mode=login"
                  prefetch={false}
                  className={publicAuthButtonClass}
                >
                  {t("nav.login")}
                </Link>
                {showLanguageMenu ? <LanguageMenu /> : null}
              </div>
            ) : null}
          </div>

          <div
            className={[
              "flex min-w-0 items-center gap-1 sm:flex-wrap sm:gap-2",
              isUserAppHeader
                ? desktopProfileSearchTarget
                  ? "shrink-0 justify-end"
                  : "w-full justify-between sm:w-auto sm:justify-end"
                : hasPublicActions
                  ? "w-full flex-col items-stretch sm:w-auto sm:flex-row sm:items-center sm:justify-end"
                  : "flex-wrap justify-end",
            ].join(" ")}
          >
            {isUserAppHeader && showDesktopAuthenticatedChrome ? (
              <>
                <div className="flex min-w-0 items-center gap-1 sm:contents">
                  {desktopProfileSearchTarget ? (
                    <div className="hidden w-[15rem] xl:block 2xl:w-[18rem]">
                      <ProfileDiscoverySearch
                        isAuthenticated
                        targetType={desktopProfileSearchTarget}
                        locale={locale}
                        labels={{
                          searchProfiles: t("search.profileSearchTitle"),
                          placeholder: t("search.profileSearchPlaceholder"),
                          hint: t("search.profileSearchHint"),
                          startTyping: t("search.profileSearchStartTyping"),
                          noResults: t("search.profileSearchNoResults"),
                          loading: t("common.loading"),
                          lockedTitle: t("search.profileSearchLockedTitle"),
                          lockedText: t("search.profileSearchLockedText"),
                          login: t("nav.login"),
                          register: t("nav.register"),
                          close: t("common.close"),
                          openProfile: t("common.openProfile"),
                          verified: t("verification.verified"),
                        }}
                        className="w-full"
                        showHint={false}
                      />
                    </div>
                  ) : null}

                  <NotificationsNavButton />

                  <FindProfilesNavLink accountType={accountType} />

                  <MessagesNavLink />

                  <Link
                    href="/saved"
                    prefetch={false}
                    aria-label={t("nav.savedProfiles")}
                    title={t("nav.savedProfiles")}
                    className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--pa-header-button-bg)] text-[var(--pa-header-button-text)] shadow-sm ring-1 ring-[#c7d1d6]/70 transition hover:-translate-y-0.5 hover:bg-[var(--pa-header-button-hover)] hover:shadow-md sm:h-12 sm:w-12"
                  >
                    <BookmarkIcon className="h-5 w-5" />
                  </Link>
                </div>

                <div className="flex shrink-0 items-center gap-1 sm:contents">
                  <AccountMenu
                    accountType={accountType}
                    initialProfilePhotoUrl={initialProfilePhotoUrl}
                    showLanguageMenu={showLanguageMenu}
                  />
                </div>
              </>
            ) : isUserAppHeader ? (
              <div
                data-authenticated-header-fallback="true"
                className="hidden h-12 max-w-[52vw] items-center justify-end gap-2 sm:flex"
              >
                {!desktopProfileSearchTarget ? (
                  <Link
                    href={authenticatedHomeHref}
                    prefetch={false}
                    className="inline-flex h-10 items-center rounded-full bg-[var(--pa-header-button-bg)] px-3 text-sm font-black text-[var(--pa-header-button-text)] ring-1 ring-[#c7d1d6]/70"
                  >
                    {t("nav.findProfiles")}
                  </Link>
                ) : null}
                <Link
                  href="/messages"
                  prefetch={false}
                  className="inline-flex h-10 items-center rounded-full bg-[var(--pa-header-button-bg)] px-3 text-sm font-black text-[var(--pa-header-button-text)] ring-1 ring-[#c7d1d6]/70"
                >
                  {t("nav.messages")}
                </Link>
                <Link
                  href="/saved"
                  prefetch={false}
                  className="hidden h-10 items-center rounded-full bg-[var(--pa-header-button-bg)] px-3 text-sm font-black text-[var(--pa-header-button-text)] ring-1 ring-[#c7d1d6]/70 lg:inline-flex"
                >
                  {t("nav.savedProfiles")}
                </Link>
                <Link
                  href="/account"
                  prefetch={false}
                  className="inline-flex h-10 items-center rounded-full bg-[var(--pa-header-button-bg)] px-3 text-sm font-black text-[var(--pa-header-button-text)] ring-1 ring-[#c7d1d6]/70"
                >
                  {t("nav.account")}
                </Link>
              </div>
            ) : isAdminHeader ? (
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--pa-header-button-bg)] px-3 text-xs font-bold leading-none text-[var(--pa-header-button-text)] shadow-sm ring-1 ring-[#c7d1d6]/70 transition hover:bg-[var(--pa-header-button-hover)] sm:h-10 sm:px-4 sm:text-sm"
                >
                  <LogOutIcon />
                  {t("nav.logout")}
                </button>
              </form>
            ) : showPublicActions ? (
              <>
                <div className="grid w-full grid-cols-2 gap-2 sm:contents">
                  <Link
                    href="/search-aupair"
                    prefetch={false}
                    className={`${publicFindButtonClass} bg-[var(--pa-aupair-cta)] text-[var(--pa-aupair-cta-text)] ring-[var(--pa-aupair-cta-soft)] hover:bg-[var(--pa-aupair-cta-hover)] sm:hover:-translate-y-0.5 sm:hover:shadow-md`}
                  >
                    {t("landing.findAuPair")}
                  </Link>
                  <Link
                    href="/search-family"
                    prefetch={false}
                    className={`${publicFindButtonClass} bg-[var(--pa-family-cta)] text-[var(--pa-family-cta-text)] ring-[var(--pa-family-cta-hover)] hover:bg-[var(--pa-family-cta-hover)] sm:hover:-translate-y-0.5 sm:hover:shadow-md`}
                  >
                    {t("landing.findFamily")}
                  </Link>
                </div>

                <div className="hidden items-center gap-2 sm:contents">
                  <Link
                    href="/login?mode=register"
                    prefetch={false}
                    className={publicAuthButtonClass}
                  >
                    {t("nav.register")}
                  </Link>
                  <Link
                    href="/login?mode=login"
                    prefetch={false}
                    className={publicAuthButtonClass}
                  >
                    {t("nav.login")}
                  </Link>
                </div>
              </>
            ) : null}

            {!showStandaloneLanguageMenu ? null : hasPublicActions ? (
              <div className="hidden sm:block">
                <LanguageMenu />
              </div>
            ) : (
              <LanguageMenu />
            )}
          </div>
        </div>
      </header>
      {showMobileAppNav ? (
        <MobileAppNav
          accountType={accountType}
          initialProfilePhotoUrl={initialProfilePhotoUrl}
        />
      ) : null}
    </>
  );
}
