"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useTranslations } from "@/components/i18n/I18nProvider";
import {
  getProfilePhotoVariantUrl,
  shouldBypassImageOptimization,
} from "@/lib/images/optimization";
import {
  readSeenStoryIds,
  SEEN_STORIES_CHANGED_EVENT,
} from "@/lib/stories/seen-story-storage";

type ProfileStoryIndicatorProps = {
  href: string;
  imageUrl: string | null;
  locked: boolean;
  storyId: string;
  variant?: "card" | "profile";
};

export function ProfileStoryIndicator({
  href,
  imageUrl,
  locked,
  storyId,
  variant = "profile",
}: ProfileStoryIndicatorProps) {
  const t = useTranslations();
  const [isSeen, setIsSeen] = useState(false);

  useEffect(() => {
    if (locked || !storyId) {
      return;
    }

    function refreshSeenState() {
      setIsSeen(readSeenStoryIds().has(storyId));
    }

    refreshSeenState();
    window.addEventListener("storage", refreshSeenState);
    window.addEventListener(SEEN_STORIES_CHANGED_EVENT, refreshSeenState);

    return () => {
      window.removeEventListener("storage", refreshSeenState);
      window.removeEventListener(SEEN_STORIES_CHANGED_EVENT, refreshSeenState);
    };
  }, [locked, storyId]);

  const isProfileVariant = variant === "profile";
  const avatarPhotoUrl = imageUrl
    ? getProfilePhotoVariantUrl(imageUrl, 96)
    : null;

  return (
    <Link
      href={href}
      prefetch={false}
      data-profile-story-indicator={variant}
      className={[
        "group absolute z-10 block rounded-full leading-none transition duration-200 hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/90",
        isProfileVariant
          ? "right-1 top-1 lg:right-2 lg:top-2"
          : "right-2 top-2",
      ].join(" ")}
      aria-label={
        locked ? t("stories.loginToViewStory") : t("stories.open")
      }
    >
      <span
        className={`relative block rounded-full p-[3px] shadow-[0_5px_18px_rgba(37,48,45,0.2)] ${
          isSeen
            ? "bg-[#b8bec3]"
            : "bg-[linear-gradient(135deg,#f9ce34_0%,#ee2a7b_48%,#6228d7_100%)]"
        }`}
      >
        <span className="block rounded-full bg-white p-[2px]">
          <span
            className={[
              "relative block overflow-hidden rounded-full bg-[#e7f1f4]",
              isProfileVariant
                ? "h-7 w-7 sm:h-9 sm:w-9 lg:h-14 lg:w-14"
                : "h-10 w-10 sm:h-11 sm:w-11 lg:h-14 lg:w-14",
            ].join(" ")}
          >
            {avatarPhotoUrl ? (
              <Image
                src={avatarPhotoUrl}
                alt=""
                fill
                draggable={false}
                unoptimized={shouldBypassImageOptimization(avatarPhotoUrl)}
                sizes="(min-width: 1024px) 56px, 44px"
                className={`pa-protected-media object-cover transition duration-200 group-hover:scale-[1.04] ${
                  locked ? "scale-110 blur-[2px]" : ""
                }`}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xs font-black text-[#26556b]">
                PA
              </span>
            )}

            {locked ? (
              <span className="absolute inset-0 bg-black/10" />
            ) : null}
          </span>
        </span>
      </span>
    </Link>
  );
}
