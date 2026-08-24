"use client";

import Image from "next/image";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { removeStoryPhotoFiles } from "@/lib/images/storage";
import { createClient } from "@/lib/supabase/client";
import { useLocale, useTranslations } from "@/components/i18n/I18nProvider";
import { getLocaleTag } from "@/lib/i18n/config";
import { buildNewStoryHref, buildStoryHref } from "@/lib/stories/story-links";
import {
  getStoryPhotoVariantUrl,
  shouldBypassImageOptimization,
  STORY_PHOTO_PREVIEW_WIDTH,
} from "@/lib/images/optimization";

type AccountStory = {
  id: string;
  storage_path: string;
  public_url: string;
  created_at: string;
  expires_at: string;
  content_moderation_status: "pending" | "approved" | "rejected";
};

type AccountStoriesManagerProps = {
  initialStories: AccountStory[];
};

function formatDate(value: string, locale: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

const statusStyles = {
  approved: "bg-[#e8f4ed] text-[#2f6a48]",
  pending: "bg-[#e8f4ed] text-[#2f6a48]",
  rejected: "bg-[#fff0ec] text-[#9d3f2f]",
} as const;

export function AccountStoriesManager({
  initialStories,
}: AccountStoriesManagerProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const supabase = createClient();

  const [stories, setStories] = useState(initialStories);
  const [error, setError] = useState("");

  async function deleteStory(story: AccountStory) {
    setError("");

    const { error: deleteError } = await supabase
      .from("profile_stories")
      .delete()
      .eq("id", story.id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    await removeStoryPhotoFiles(supabase, story.storage_path);

    setStories((current) => current.filter((item) => item.id !== story.id));
    router.refresh();
  }

  return (
    <section
      id="active-stories"
      className="mt-4 scroll-mt-24 rounded-[1.25rem] border border-[#d6e2e8] bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black tracking-normal text-[#172426]">
            {t("stories.yourStories")}
          </h2>
          <p className="mt-1 text-sm font-semibold text-[#25302d]/50">
            {t("stories.accountIntro")}
          </p>
        </div>

        <Link
          href={buildNewStoryHref("/account#active-stories")}
          prefetch={false}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[0.7rem] bg-[#cfe5ec] px-4 text-sm font-black text-[#172426] transition hover:bg-[#bddae3]"
        >
          <span aria-hidden="true" className="text-base leading-none">
            +
          </span>
          {t("stories.add")}
        </Link>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-[#d95f49]/20 bg-[#fff5f2] p-4 text-sm font-semibold text-[#9d3f2f]">
          {error}
        </div>
      ) : null}

      {stories.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,11rem))] gap-3 sm:gap-4">
          {stories.map((story) => (
            <div
              key={story.id}
              className="overflow-hidden rounded-[0.9rem] border border-[#d6e2e8] bg-white shadow-sm"
            >
              <Link
                href={buildStoryHref(story.id, "/account#active-stories")}
                prefetch={false}
                className="relative block aspect-square"
              >
                <Image
                  src={getStoryPhotoVariantUrl(
                    story.public_url,
                    STORY_PHOTO_PREVIEW_WIDTH,
                  )}
                  alt=""
                  fill
                  sizes="176px"
                  unoptimized={shouldBypassImageOptimization(
                    getStoryPhotoVariantUrl(
                      story.public_url,
                      STORY_PHOTO_PREVIEW_WIDTH,
                    ),
                  )}
                  draggable={false}
                  className="pa-protected-media object-cover transition hover:scale-[1.03]"
                />
              </Link>

              <div className="space-y-2 bg-white p-2.5">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-[0.08em] ${statusStyles[story.content_moderation_status]}`}
                >
                  {story.content_moderation_status === "rejected"
                    ? t("stories.statusRejected")
                    : t("stories.statusActive")}
                </span>

                <p className="line-clamp-2 text-xs font-semibold leading-tight text-[#25302d]/45">
                  {t("stories.expires", {
                    date: formatDate(story.expires_at, getLocaleTag(locale)),
                  })}
                </p>

                {story.content_moderation_status === "rejected" ? (
                  <p className="text-xs font-semibold leading-4 text-[#9d3f2f]">
                    {t("stories.rejectedHelp")}
                  </p>
                ) : null}

                <div className="grid gap-2 sm:grid-cols-2">
                  <Link
                    href={buildStoryHref(story.id, "/account#active-stories")}
                    prefetch={false}
                    className="inline-flex min-h-11 items-center justify-center rounded-[0.55rem] border border-[#cbe3ec] bg-[#f7fbfc] px-2 py-1.5 text-center text-xs font-bold leading-tight text-[#2f6578]"
                  >
                    {t("common.view")}
                  </Link>

                  <button
                    type="button"
                    onClick={() => deleteStory(story)}
                    className="min-h-11 rounded-[0.55rem] bg-[#fff2ed] px-2 py-1.5 text-xs font-bold leading-tight text-[#9d3f2f]"
                  >
                    {t("common.delete")}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[0.9rem] border border-[#d6e2e8] bg-[#f7fbfc] p-6 text-center text-sm font-semibold text-[#25302d]/55">
          {t("stories.noStoriesAccount")}
        </div>
      )}
    </section>
  );
}
