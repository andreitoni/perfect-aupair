"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { LanguageMenu } from "@/components/layout/LanguageMenu";
import { useTranslations } from "@/components/i18n/I18nProvider";
import { createClient } from "@/lib/supabase/client";
import { formatFamilyDisplayName } from "@/lib/i18n/formatters";
import { getProfilePhotoVariantUrl } from "@/lib/images/optimization";
import { getProfilePhotoUrl } from "@/lib/profile/photos";

type AccountType = "family" | "au_pair";

type HeaderProfile = {
  id: string;
  account_type: AccountType | null;
  full_name: string | null;
  primary_photo_path: string | null;
};

type HeaderProfilePhoto = {
  storage_path: string | null;
};

type AccountMenuProps = {
  accountType?: AccountType | null;
  initialProfilePhotoUrl?: string | null;
  showLanguageMenu?: boolean;
};

function UserIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21a7 7 0 0 1 14 0" />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
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

function ChevronDownIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="hidden h-5 w-5 shrink-0 lg:block"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ProfileAvatar({
  photoUrl,
  className,
  iconClassName = "h-5 w-5",
}: {
  photoUrl?: string | null;
  className: string;
  iconClassName?: string;
}) {
  if (photoUrl) {
    const avatarPhotoUrl = getProfilePhotoVariantUrl(photoUrl, 96);

    return (
      <span className={className}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarPhotoUrl}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          className="h-full w-full rounded-full object-cover"
        />
      </span>
    );
  }

  return (
    <span className={className}>
      <UserIcon className={iconClassName} />
    </span>
  );
}

export function AccountMenu({
  accountType = null,
  initialProfilePhotoUrl = null,
  showLanguageMenu = true,
}: AccountMenuProps) {
  const t = useTranslations();
  const menuRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);
  const [isOpen, setIsOpen] = useState(false);
  const [profile, setProfile] = useState<HeaderProfile | null>(null);
  const [loadedProfilePhotoUrl, setLoadedProfilePhotoUrl] = useState<
    string | null
  >(null);

  useEffect(() => {
    const hasProfilePhoto = Boolean(
      initialProfilePhotoUrl ?? loadedProfilePhotoUrl,
    );

    if (profile || (!isOpen && hasProfilePhoto)) {
      return;
    }

    let isMounted = true;

    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const [profileResult, photoResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, account_type, full_name")
          .eq("id", user.id)
          .maybeSingle<Omit<HeaderProfile, "primary_photo_path">>(),
        hasProfilePhoto
          ? Promise.resolve({ data: null })
          : supabase
              .from("profile_photos")
              .select("storage_path")
              .eq("profile_id", user.id)
              .order("is_primary", { ascending: false })
              .order("sort_order", { ascending: true })
              .limit(1)
              .maybeSingle<HeaderProfilePhoto>(),
      ]);

      if (!isMounted) return;

      const nextProfilePhotoUrl = getProfilePhotoUrl(
        supabase,
        photoResult.data?.storage_path ?? null,
      );

      if (nextProfilePhotoUrl) {
        setLoadedProfilePhotoUrl(nextProfilePhotoUrl);
      }

      setProfile(
        profileResult.data
          ? {
              ...profileResult.data,
              primary_photo_path: photoResult.data?.storage_path ?? null,
            }
          : null,
      );
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [
    initialProfilePhotoUrl,
    isOpen,
    loadedProfilePhotoUrl,
    profile,
    supabase,
  ]);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (menuRef.current?.contains(event.target)) return;

      setIsOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const resolvedAccountType = profile?.account_type ?? accountType;
  const formattedProfileName =
    resolvedAccountType === "family"
      ? formatFamilyDisplayName(profile?.full_name, t)
      : profile?.full_name?.trim();
  const profileName = formattedProfileName || t("nav.account");
  const profilePhotoUrl =
    getProfilePhotoUrl(supabase, profile?.primary_photo_path) ??
    initialProfilePhotoUrl ??
    loadedProfilePhotoUrl;

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label={t("nav.account")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={t("nav.account")}
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--pa-header-button-bg)] px-0 text-xs font-bold leading-none text-[var(--pa-header-button-text)] shadow-sm ring-1 ring-[#c7d1d6]/70 transition hover:-translate-y-0.5 hover:bg-[var(--pa-header-button-hover)] hover:shadow-md sm:h-12 sm:w-12 lg:w-auto lg:gap-2 lg:px-3 lg:text-sm"
      >
        <ProfileAvatar
          photoUrl={profilePhotoUrl}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-[#415861] ring-1 ring-[#c7d1d6] sm:h-9 sm:w-9"
          iconClassName="h-6 w-6"
        />
        <span className="hidden lg:inline">{t("nav.account")}</span>
        <ChevronDownIcon />
      </button>

      {isOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-[1.25rem] bg-white p-2 shadow-[0_18px_55px_rgba(31,47,53,0.18)] ring-1 ring-[#cfd9de]"
        >
          <Link
            href="/account"
            prefetch={false}
            role="menuitem"
            onClick={() => setIsOpen(false)}
            className="flex min-w-0 items-center gap-3 rounded-[1rem] bg-[#f3f7f8] p-3 text-[#172426] ring-1 ring-[#dce7eb] transition hover:bg-[#e7f1f5]"
          >
            <ProfileAvatar
              photoUrl={profilePhotoUrl}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-[#415861] shadow-sm ring-1 ring-[#c7d1d6]"
            />
            <span className="min-w-0">
              <span className="block truncate text-base font-black">
                {profileName}
              </span>
              <span className="mt-0.5 block text-xs font-bold text-[#5d727a]">
                {t("account.yourAccount")}
              </span>
            </span>
          </Link>

          <div className="my-2 h-px bg-[#d8e2e6]" />

          {showLanguageMenu ? (
            <>
              <LanguageMenu
                variant="menu"
                onLanguageChosen={() => setIsOpen(false)}
              />

              <div className="my-2 h-px bg-[#d8e2e6]" />
            </>
          ) : null}

          <form action="/auth/signout" method="post">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-3 rounded-[1rem] px-3 py-3 text-left text-sm font-black text-[#25302d] transition hover:bg-[#fff0e9] hover:text-[#8f3e28]"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eef4f6] text-[#415861]">
                <LogOutIcon />
              </span>
              <span>{t("nav.logout")}</span>
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
