"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MessagesNavLink } from "@/components/messages/MessagesNavLink";
import { NotificationsNavButton } from "@/components/notifications/NotificationsNavButton";
import {
  OPEN_PROFILE_DISCOVERY_SEARCH_EVENT,
  OPEN_PROFILE_DISCOVERY_SEARCH_ON_LOAD_KEY,
} from "@/lib/search/profile-discovery-events";
import { useTranslations } from "@/components/i18n/I18nProvider";
import { getProfilePhotoVariantUrl } from "@/lib/images/optimization";
import { getProfilePhotoUrl } from "@/lib/profile/photos";

type AccountType = "family" | "au_pair";

type MobileAppNavProps = {
  accountType?: AccountType | null;
  initialProfilePhotoUrl?: string | null;
};

type NavProfile = {
  account_type: AccountType | null;
  onboarding_completed: boolean | null;
};

type HeaderProfilePhoto = {
  storage_path: string | null;
};

let cachedProfilePhotoUrl: string | null = null;
let cachedAccountType: AccountType | null = null;

function shouldHideInitialNav(pathname: string | null) {
  return (
    pathname === "/onboarding" ||
    pathname?.startsWith("/onboarding/") ||
    pathname === "/profile/photos"
  );
}

function HomeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.25"
    >
      <path d="M3 11.2 12 3l9 8.2" />
      <path d="M5.5 10.2V21h13V10.2" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.35"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.35"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21a7 7 0 0 1 14 0" />
    </svg>
  );
}

function navItemClass(active: boolean) {
  return [
    "relative inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95",
    active
      ? "bg-[#e9f3f6] text-[#101817] ring-1 ring-[#bdd8e2]"
      : "text-[#101817]",
  ].join(" ");
}

export function MobileAppNav({
  accountType = null,
  initialProfilePhotoUrl = null,
}: MobileAppNavProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const hasCompleteInitialNavData = Boolean(
    accountType && initialProfilePhotoUrl,
  );
  const [canUseApp, setCanUseApp] = useState<boolean | null>(
    hasCompleteInitialNavData ? true : null,
  );
  const [resolvedAccountType, setResolvedAccountType] =
    useState<AccountType | null>(accountType ?? cachedAccountType);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(
    initialProfilePhotoUrl ?? cachedProfilePhotoUrl,
  );
  const visible = !shouldHideInitialNav(pathname) && canUseApp !== false;
  const displayedProfilePhotoUrl =
    initialProfilePhotoUrl ?? profilePhotoUrl ?? cachedProfilePhotoUrl;
  const displayedProfilePhotoAvatarUrl = displayedProfilePhotoUrl
    ? getProfilePhotoVariantUrl(displayedProfilePhotoUrl, 96)
    : null;

  useEffect(() => {
    if (!initialProfilePhotoUrl) return;

    cachedProfilePhotoUrl = initialProfilePhotoUrl;
  }, [initialProfilePhotoUrl]);

  useEffect(() => {
    if (!accountType) return;

    cachedAccountType = accountType;
  }, [accountType]);

  useEffect(() => {
    if (shouldHideInitialNav(pathname)) {
      return;
    }

    if (hasCompleteInitialNavData) {
      return;
    }

    let isMounted = true;

    async function loadProfile() {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (isMounted) setCanUseApp(false);
        return;
      }

      const [{ data: profile }, { count }, { data: photo }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("account_type, onboarding_completed")
            .eq("id", user.id)
            .maybeSingle<NavProfile>(),
          supabase
            .from("profile_photos")
            .select("id", { count: "exact", head: true })
            .eq("profile_id", user.id),
          supabase
            .from("profile_photos")
            .select("storage_path")
            .eq("profile_id", user.id)
            .order("is_primary", { ascending: false })
            .order("sort_order", { ascending: true })
            .limit(1)
            .maybeSingle<HeaderProfilePhoto>(),
        ]);

      if (!isMounted) return;

      const nextAccountType = profile?.account_type ?? accountType ?? null;
      const canUseApp =
        profile?.onboarding_completed === true &&
        (nextAccountType === "family" || nextAccountType === "au_pair") &&
        Number(count ?? 0) > 0;

      const nextProfilePhotoUrl = getProfilePhotoUrl(
        supabase,
        photo?.storage_path ?? null,
      );

      if (nextProfilePhotoUrl) {
        cachedProfilePhotoUrl = nextProfilePhotoUrl;
      }

      if (nextAccountType === "family" || nextAccountType === "au_pair") {
        cachedAccountType = nextAccountType;
      }

      setProfilePhotoUrl(nextProfilePhotoUrl);
      setResolvedAccountType(nextAccountType);
      setCanUseApp(canUseApp);
    }

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [accountType, hasCompleteInitialNavData, pathname]);

  if (!visible) {
    return null;
  }

  const navAccountType = accountType ?? resolvedAccountType;
  const searchTargetType =
    navAccountType === "au_pair" ? "family" : "au_pair";
  const searchHref =
    searchTargetType === "family" ? "/search-family" : "/search-aupair";
  const feedHref = navAccountType ? searchHref : "/auth/home";
  const isHomeActive =
    pathname === "/auth/home" || pathname === feedHref;
  const isMessagesActive = pathname?.startsWith("/messages") ?? false;
  const isNotificationsActive = pathname?.startsWith("/notifications") ?? false;
  const isAccountActive =
    pathname?.startsWith("/account") || pathname?.startsWith("/profile/photos");

  function openCurrentSearch() {
    window.dispatchEvent(
      new CustomEvent(OPEN_PROFILE_DISCOVERY_SEARCH_EVENT, {
        detail: { targetType: searchTargetType },
      }),
    );
  }

  return (
    <nav
      aria-label={t("nav.menu")}
      className="pa-mobile-app-nav fixed inset-x-0 bottom-0 z-40 border-t border-[#d8e0e6] bg-white/96 px-2 pb-[calc(0.2rem+env(safe-area-inset-bottom))] pt-1 shadow-[0_-6px_18px_rgba(31,47,53,0.06)] backdrop-blur sm:hidden"
    >
      <div className="mx-auto flex h-12 max-w-md items-center justify-around gap-1">
        {/* Mobile Safari reports interrupted RSC prefetches as "Load failed".
            Keep persistent nav routes click-loaded; taps still use client navigation. */}
        <Link
          href={feedHref}
          prefetch={false}
          aria-label={t("common.perfectAuPair")}
          title={t("common.perfectAuPair")}
          className={navItemClass(isHomeActive)}
        >
          <HomeIcon />
        </Link>

        {pathname === searchHref ? (
          <button
            type="button"
            aria-label={t("search.profileSearchTitle")}
            title={t("search.profileSearchTitle")}
            onClick={openCurrentSearch}
            className={navItemClass(false)}
          >
            <SearchIcon />
          </button>
        ) : (
          <Link
            href={searchHref}
            prefetch={false}
            aria-label={t("search.profileSearchTitle")}
            title={t("search.profileSearchTitle")}
            onClick={(event) => {
              if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return;
              }

              window.sessionStorage.setItem(
                OPEN_PROFILE_DISCOVERY_SEARCH_ON_LOAD_KEY,
                searchTargetType,
              );
            }}
            className={navItemClass(false)}
          >
            <SearchIcon />
          </Link>
        )}

        <MessagesNavLink variant="mobileNav" active={isMessagesActive} />

        <NotificationsNavButton
          variant="mobileNav"
          active={isNotificationsActive}
        />

        <Link
          href="/account"
          prefetch={false}
          aria-label={t("nav.account")}
          title={t("nav.account")}
          className={navItemClass(Boolean(isAccountActive))}
        >
          {displayedProfilePhotoAvatarUrl ? (
            <span
              className={[
                "relative h-7 w-7 overflow-hidden rounded-full bg-[#edf3f5]",
                isAccountActive
                  ? "ring-2 ring-[#101817]"
                  : "ring-1 ring-[#c7d1d6]",
              ].join(" ")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displayedProfilePhotoAvatarUrl}
                alt=""
                width={28}
                height={28}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                draggable={false}
                className="pa-protected-media h-full w-full object-cover"
              />
            </span>
          ) : (
            <UserIcon />
          )}
        </Link>
      </div>
    </nav>
  );
}
