"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LogoMark } from "@/components/brand/LogoMark";
import { useTranslations } from "@/components/i18n/I18nProvider";
import { loginHref } from "@/lib/auth/return-to";
import {
  getProfilePhotoVariantUrl,
  PROFILE_PHOTO_PREVIEW_WIDTH,
  shouldBypassImageOptimization,
} from "@/lib/images/optimization";

type GuestProfileLoginPromptProps = {
  profileName?: string;
  profilePhotoUrl?: string | null;
  title?: string;
  text?: string;
  returnTo?: string | null;
  onClose: () => void;
};

export function GuestProfileLoginPrompt({
  profileName = "Perfect AuPair",
  profilePhotoUrl,
  title,
  text,
  returnTo,
  onClose,
}: GuestProfileLoginPromptProps) {
  const t = useTranslations();
  const avatarPhotoUrl = profilePhotoUrl
    ? getProfilePhotoVariantUrl(profilePhotoUrl, 192)
    : null;
  const overlayRef = useRef<HTMLDivElement>(null);
  const loginLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      loginLinkRef.current?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = Array.from(
        overlayRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (!firstElement || !lastElement) {
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-[#101312]/62 px-5 py-8 backdrop-blur-[1px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="absolute right-4 top-4 inline-flex h-12 w-12 items-center justify-center rounded-full text-white transition hover:bg-white/10 sm:right-6 sm:top-6"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-8 w-8"
          aria-hidden="true"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-profile-login-title"
        aria-describedby="guest-profile-login-description"
        className="w-full max-w-[390px] rounded-[2rem] bg-white px-6 py-7 text-[#25302d] shadow-2xl sm:max-w-[440px] sm:px-8 sm:py-8"
      >
        <div className="relative mx-auto h-24 w-24 overflow-hidden rounded-full bg-[#bfe8ff] ring-1 ring-black/5">
          {avatarPhotoUrl ? (
            <Image
              src={avatarPhotoUrl}
              alt=""
              width={96}
              height={96}
              unoptimized={shouldBypassImageOptimization(avatarPhotoUrl)}
              draggable={false}
              className="pa-protected-media h-full w-full object-cover"
            />
          ) : (
            <LogoMark decorative className="h-full w-full" />
          )}
        </div>

        <h2
          id="guest-profile-login-title"
          className="mt-7 text-3xl font-black leading-[0.98] tracking-[-0.04em]"
        >
          {title ?? t("profileGuestPrompt.title")}
        </h2>

        <p
          id="guest-profile-login-description"
          className="mt-3 text-base font-semibold leading-6 text-[#25302d]/72"
        >
          {text ?? t("profileGuestPrompt.text", { name: profileName })}
        </p>

        <div className="mt-7 space-y-3">
          <a
            ref={loginLinkRef}
            href={loginHref(returnTo)}
            className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-[var(--pa-primary)] px-5 text-base font-black text-[var(--pa-primary-ink)] shadow-sm transition hover:bg-[var(--pa-primary-hover)]"
          >
            {t("nav.login")}
          </a>

          <a
            href={loginHref(returnTo, "register")}
            className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-[#25302d]/20 bg-[#f2f4f7] px-5 text-base font-black text-[#25302d] transition hover:bg-[#e2e5e9]"
          >
            {t("nav.register")}
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type GuestProfilePhotoPromptProps = {
  imageUrl: string;
  imageClassName: string;
  profileName: string;
  profilePhotoUrl?: string | null;
  sizes?: string;
  preload?: boolean;
  returnTo?: string | null;
};

export function GuestProfilePhotoPrompt({
  imageUrl,
  imageClassName,
  profileName,
  profilePhotoUrl,
  sizes = "(min-width: 1024px) 340px, (min-width: 640px) 420px, calc(100vw - 32px)",
  preload = false,
  returnTo,
}: GuestProfilePhotoPromptProps) {
  const t = useTranslations();
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const previewImageUrl = getProfilePhotoVariantUrl(
    imageUrl,
    PROFILE_PHOTO_PREVIEW_WIDTH,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setIsPromptOpen(true)}
        onContextMenu={(event) => event.preventDefault()}
        className="relative block h-full w-full cursor-zoom-in overflow-hidden"
        aria-label={t("profile.openPhoto")}
      >
        <Image
          src={previewImageUrl}
          alt=""
          fill
          preload={preload}
          sizes={sizes}
          unoptimized={shouldBypassImageOptimization(previewImageUrl)}
          draggable={false}
          className={`pa-protected-media block ${imageClassName}`}
        />
      </button>

      {isPromptOpen ? (
        <GuestProfileLoginPrompt
          profileName={profileName}
          profilePhotoUrl={profilePhotoUrl}
          returnTo={returnTo}
          onClose={() => setIsPromptOpen(false)}
        />
      ) : null}
    </>
  );
}
