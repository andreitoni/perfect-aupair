"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "@/components/i18n/I18nProvider";

type TargetType = "au_pair" | "family";
type AccountType = "au_pair" | "family";

type FindProfilesNavLinkProps = {
  accountType?: AccountType | null;
  variant?: "header" | "mobileNav";
};

const TARGET_TYPE_STORAGE_KEY = "pa_find_profiles_target_type";

function getTargetTypeFromPathname(pathname: string | null): TargetType | null {
  if (pathname === "/search-aupair") return "au_pair";
  if (pathname === "/search-family") return "family";

  return null;
}

function getTargetTypeFromAccountType(
  accountType: AccountType | null | undefined,
): TargetType | null {
  if (accountType === "au_pair") return "family";
  if (accountType === "family") return "au_pair";

  return null;
}

function isTargetType(value: string | null): value is TargetType {
  return value === "au_pair" || value === "family";
}

function readCachedTargetType(): TargetType | null {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(TARGET_TYPE_STORAGE_KEY);

    return isTargetType(value) ? value : null;
  } catch {
    return null;
  }
}

function writeCachedTargetType(targetType: TargetType) {
  try {
    window.localStorage.setItem(TARGET_TYPE_STORAGE_KEY, targetType);
  } catch {
    // Storage can be unavailable in private contexts; the server/client lookup still works.
  }
}

function HomeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
    >
      <path d="M3 11.2 12 3l9 8.2" />
      <path d="M5.5 10.2V21h13V10.2" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

export function FindProfilesNavLink({
  accountType = null,
  variant = "header",
}: FindProfilesNavLinkProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const pathTargetType = getTargetTypeFromPathname(pathname);
  const initialTargetType = getTargetTypeFromAccountType(accountType);
  const [loadedTargetType, setLoadedTargetType] = useState<TargetType | null>(
    null,
  );
  const isSearchPage = pathTargetType !== null;

  useEffect(() => {
    if (initialTargetType) {
      writeCachedTargetType(initialTargetType);
    }
  }, [initialTargetType]);

  useEffect(() => {
    if (isSearchPage || initialTargetType) return;

    let isMounted = true;

    async function loadHref() {
      await Promise.resolve();

      if (!isMounted) return;

      const cachedTargetType = readCachedTargetType();

      if (cachedTargetType) {
        setLoadedTargetType(cachedTargetType);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", user.id)
        .maybeSingle();

      if (!isMounted) return;

      const nextTargetType = getTargetTypeFromAccountType(profile?.account_type);

      if (!nextTargetType) return;

      setLoadedTargetType(nextTargetType);
      writeCachedTargetType(nextTargetType);
    }

    loadHref();

    return () => {
      isMounted = false;
    };
  }, [initialTargetType, isSearchPage, supabase]);

  if (isSearchPage) {
    return null;
  }

  const targetType = pathTargetType ?? initialTargetType ?? loadedTargetType;

  if (!targetType) {
    const placeholderClass =
      variant === "mobileNav"
        ? "inline-flex h-12 w-12 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[var(--pa-header-button-bg)] px-0 text-xs font-black leading-none text-[var(--pa-header-button-text)] opacity-0 shadow-sm ring-1 ring-[#c7d1d6]/70 min-[390px]:w-auto min-[390px]:max-w-[9rem] min-[390px]:px-3"
        : "inline-flex h-12 w-12 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[var(--pa-header-button-bg)] px-0 text-xs font-bold leading-none text-[var(--pa-header-button-text)] opacity-0 shadow-sm ring-1 ring-[#c7d1d6]/70 min-[420px]:w-auto min-[420px]:max-w-[9rem] min-[420px]:px-3 sm:h-12 sm:w-[8.75rem] sm:max-w-none sm:gap-2 sm:px-3.5 sm:text-sm";
    const placeholderMobileLabelClass =
      variant === "mobileNav"
        ? "hidden min-w-0 truncate whitespace-nowrap min-[390px]:inline"
        : "hidden min-w-0 truncate whitespace-nowrap min-[420px]:inline sm:hidden";

    return (
      <span
        aria-hidden="true"
        className={placeholderClass}
      >
        <HomeIcon />
        <span className={placeholderMobileLabelClass}>
          {t("nav.findProfiles")}
        </span>
        <span className="hidden sm:inline">{t("landing.findFamily")}</span>
      </span>
    );
  }

  const href = targetType === "family" ? "/search-family" : "/search-aupair";
  const label =
    targetType === "family"
      ? t("landing.findFamily")
      : targetType === "au_pair"
        ? t("landing.findAuPair")
        : t("nav.findProfiles");
  const mobileLabel = variant === "mobileNav" ? label : t("nav.findProfiles");
  const toneClass =
    targetType === "family"
      ? "bg-[var(--pa-family-cta)] text-[var(--pa-family-cta-text)] ring-[#c7dce6] hover:bg-[var(--pa-family-cta-hover)]"
      : targetType === "au_pair"
        ? "bg-[var(--pa-aupair-cta)] text-[var(--pa-aupair-cta-text)] ring-[var(--pa-aupair-cta-soft)] hover:bg-[var(--pa-aupair-cta-hover)]"
        : "bg-[var(--pa-header-button-bg)] text-[var(--pa-header-button-text)] ring-[#c7d1d6]/70 hover:bg-[var(--pa-header-button-hover)]";
  const linkClass =
    variant === "mobileNav"
      ? `inline-flex h-12 w-12 shrink-0 items-center justify-center gap-1.5 rounded-full px-0 text-xs font-black leading-none shadow-sm ring-1 transition active:scale-95 min-[390px]:w-auto min-[390px]:max-w-[9rem] min-[390px]:px-3 ${toneClass}`
      : `inline-flex h-12 w-12 shrink-0 items-center justify-center gap-1.5 rounded-full px-0 text-xs font-bold leading-none shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md min-[420px]:w-auto min-[420px]:max-w-[9rem] min-[420px]:px-3 sm:h-12 sm:w-auto sm:max-w-none sm:gap-2 sm:px-3.5 sm:text-sm ${toneClass}`;
  const mobileLabelClass =
    variant === "mobileNav"
      ? "hidden min-w-0 truncate whitespace-nowrap min-[390px]:inline"
      : "hidden min-w-0 truncate whitespace-nowrap min-[420px]:inline sm:hidden";

  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={label}
      title={label}
      className={linkClass}
    >
      <HomeIcon />
      <span className={mobileLabelClass}>{mobileLabel}</span>
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
