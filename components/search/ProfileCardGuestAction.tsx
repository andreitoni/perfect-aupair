"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { BookmarkIcon } from "@/components/icons/BookmarkIcon";
import { MessageIcon } from "@/components/icons/MessageIcon";
import { useTranslations } from "@/components/i18n/I18nProvider";
import { GuestProfileLoginPrompt } from "@/components/profile/GuestProfileLoginPrompt";

type ProfileCardGuestActionProps = {
  profileName: string;
  profilePhotoUrl?: string | null;
  variant: "save" | "message" | "custom";
  ariaLabel?: string;
  children?: ReactNode;
  className?: string;
  returnTo?: string | null;
  title?: string;
};

export function ProfileCardGuestAction({
  ariaLabel,
  children,
  className,
  profileName,
  profilePhotoUrl,
  returnTo,
  title,
  variant,
}: ProfileCardGuestActionProps) {
  const t = useTranslations();
  const [isPromptOpen, setIsPromptOpen] = useState(false);

  return (
    <>
      {variant === "custom" ? (
        <button
          type="button"
          onClick={() => setIsPromptOpen(true)}
          aria-label={ariaLabel}
          title={title}
          className={className}
        >
          {children}
        </button>
      ) : variant === "save" ? (
        <button
          type="button"
          onClick={() => setIsPromptOpen(true)}
          aria-label={t("common.saveProfile")}
          title={t("common.saveProfile")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.55rem] bg-white text-[#25302d] transition hover:bg-[#f2f6f8]"
        >
          <BookmarkIcon className="h-[24px] w-[24px]" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsPromptOpen(true)}
          className={
            className ??
            "inline-flex h-11 min-w-0 cursor-pointer items-center justify-center gap-1.5 truncate whitespace-nowrap rounded-[0.55rem] bg-[var(--pa-primary)] px-3 text-[0.92rem] font-black text-[var(--pa-primary-ink)] shadow-sm transition hover:bg-[var(--pa-primary-hover)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-primary-focus-ring)] focus-visible:ring-offset-2 sm:gap-2 sm:px-4"
          }
        >
          <MessageIcon
            className={
              className ? "h-4 w-4 shrink-0 lg:h-5 lg:w-5" : "h-5 w-5 shrink-0"
            }
          />
          {t("common.message")}
        </button>
      )}

      {isPromptOpen ? (
        <GuestProfileLoginPrompt
          profileName={profileName}
          profilePhotoUrl={profilePhotoUrl}
          returnTo={returnTo}
          title={t("profileGuestPrompt.title")}
          text={t("profiles.loginBlockerText")}
          onClose={() => setIsPromptOpen(false)}
        />
      ) : null}
    </>
  );
}
