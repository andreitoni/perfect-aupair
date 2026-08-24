"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useTranslations } from "@/components/i18n/I18nProvider";
import { GuestProfileLoginPrompt } from "@/components/profile/GuestProfileLoginPrompt";
import {
  readSeenStoryIds,
  SEEN_STORIES_CHANGED_EVENT,
} from "@/lib/stories/seen-story-storage";
import {
  getProfilePhotoVariantUrl,
  shouldBypassImageOptimization,
} from "@/lib/images/optimization";

type Story = {
  id: string;
  name: string;
  imageUrl?: string | null;
  href?: string;
  locked?: boolean;
};

type StoriesRailProps = {
  stories?: Story[];
  ownStory?: Story | null;
  initialSeenStoryIds?: string[];
  className?: string;
  addHref?: string;
  variant?: "rail" | "compact" | "responsive";
};

const EMPTY_STORY_IDS: string[] = [];

function StoryEmptyIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-12 w-12"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <rect x="3" y="5" width="14" height="14" rx="2.5" />
      <path d="m7 14 2.2-2.2a1.4 1.4 0 0 1 2 0L15 15.6" />
      <circle cx="8" cy="9" r="1.2" />
      <circle cx="18" cy="17" r="3.5" fill="white" />
      <path d="M18 15.4v3.2" />
      <path d="M16.4 17h3.2" />
    </svg>
  );
}

export function StoriesRail({
  stories = [],
  ownStory = null,
  initialSeenStoryIds = EMPTY_STORY_IDS,
  className,
  addHref,
  variant = "rail",
}: StoriesRailProps) {
  const t = useTranslations();
  const [lockedStory, setLockedStory] = useState<Story | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [seenStoryIds, setSeenStoryIds] = useState<Set<string>>(
    () => new Set(initialSeenStoryIds),
  );
  const isCompact = variant === "compact";
  const isResponsive = variant === "responsive";
  const usesCompactMobileLayout = isCompact || isResponsive;
  const hasMobileContent = stories.length > 0 || Boolean(addHref || ownStory);
  const ownStorySeen = ownStory ? seenStoryIds.has(ownStory.id) : false;
  const orderedStories = useMemo(
    () =>
      stories
        .map((story, index) => ({
          story,
          index,
          isSeen: seenStoryIds.has(story.id),
        }))
        .sort((firstStory, secondStory) => {
          if (firstStory.isSeen !== secondStory.isSeen) {
            return firstStory.isSeen ? 1 : -1;
          }

          return firstStory.index - secondStory.index;
        })
        .map(({ story }) => story),
    [seenStoryIds, stories],
  );

  function startNavigationFeedback(
    event: ReactMouseEvent<HTMLAnchorElement>,
    href: string,
  ) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    setPendingHref(href);
  }

  useEffect(() => {
    function refreshSeenStories() {
      const locallySeenStoryIds = readSeenStoryIds();
      setSeenStoryIds(
        (currentSeenStoryIds) =>
          new Set([
            ...currentSeenStoryIds,
            ...initialSeenStoryIds,
            ...locallySeenStoryIds,
          ]),
      );
    }

    refreshSeenStories();
    window.addEventListener("storage", refreshSeenStories);
    window.addEventListener(SEEN_STORIES_CHANGED_EVENT, refreshSeenStories);

    return () => {
      window.removeEventListener("storage", refreshSeenStories);
      window.removeEventListener(SEEN_STORIES_CHANGED_EVENT, refreshSeenStories);
    };
  }, [initialSeenStoryIds]);

  useEffect(() => {
    if (!pendingHref) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPendingHref(null);
    }, 10_000);

    return () => window.clearTimeout(timeoutId);
  }, [pendingHref]);

  if (isCompact && stories.length === 0 && !addHref && !ownStory) {
    return null;
  }

  return (
    <>
      <aside
        className={[
          isCompact
            ? "h-fit w-full min-w-0 max-w-full overflow-hidden px-0 py-1"
            : isResponsive
              ? `h-fit w-full min-w-0 max-w-full overflow-hidden px-0 py-1 lg:sticky lg:top-24 lg:rounded-[0.95rem] lg:bg-white lg:p-5 lg:shadow-[0_10px_26px_rgba(38,63,69,0.05)] lg:ring-1 lg:ring-[#d8e0e6] ${
                  hasMobileContent ? "" : "hidden lg:block"
                }`
              : "h-fit w-full min-w-0 max-w-full overflow-hidden rounded-[0.95rem] bg-white p-5 shadow-[0_10px_26px_rgba(38,63,69,0.05)] ring-1 ring-[#d8e0e6] lg:sticky lg:top-24",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {usesCompactMobileLayout ? (
          <p className={isResponsive ? "sr-only lg:hidden" : "sr-only"}>
            {t("common.stories")}
          </p>
        ) : null}

        {!isCompact ? (
          <div
            className={[
              "items-center justify-between gap-3",
              isResponsive ? "hidden lg:flex" : "flex",
            ].join(" ")}
          >
            <h2 className="text-lg font-black tracking-normal text-[#101817]">
              {t("common.stories")}
            </h2>
            {addHref ? (
              <Link
                href={addHref}
                prefetch={false}
                aria-busy={pendingHref === addHref || undefined}
                onClick={(event) => startNavigationFeedback(event, addHref)}
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[0.45rem] px-1 text-sm font-black text-[var(--pa-primary)] transition hover:bg-[var(--pa-primary-soft)] aria-busy:pointer-events-none aria-busy:opacity-65"
              >
                {pendingHref === addHref ? (
                  <span
                    aria-hidden="true"
                    className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
                  />
                ) : (
                  <span aria-hidden="true" className="text-base leading-none">
                    +
                  </span>
                )}
                {t("stories.add")}
              </Link>
            ) : null}
          </div>
        ) : null}

        {stories.length > 0 || ownStory ||
        (usesCompactMobileLayout && addHref) ? (
          <div
            className={
              isCompact
                ? "pa-scrollbar-none flex max-w-full gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1 pt-1"
                : isResponsive
                  ? "pa-scrollbar-none flex max-w-full gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1 pt-1 lg:mt-5 lg:block lg:space-y-3 lg:overflow-visible lg:px-0 lg:pb-0 lg:pt-0"
                  : "mt-5 flex max-w-full gap-3 overflow-x-auto overscroll-x-contain pb-1 lg:block lg:space-y-3 lg:overflow-visible lg:pb-0"
            }
          >
            {usesCompactMobileLayout && addHref ? (
              <Link
                href={addHref}
                prefetch={false}
                aria-busy={pendingHref === addHref || undefined}
                onClick={(event) => startNavigationFeedback(event, addHref)}
                className={`group relative block w-14 shrink-0 overflow-visible text-center transition hover:opacity-85 aria-busy:pointer-events-none aria-busy:opacity-65 ${
                  isResponsive ? "lg:hidden" : ""
                }`}
              >
                <div className="flex min-w-0 flex-col items-center text-center">
                  <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--pa-primary)] text-xl font-black text-[var(--pa-primary-ink)] ring-2 ring-[#adc9d4] ring-offset-2 ring-offset-[var(--background)] transition group-hover:scale-[1.03]">
                    {pendingHref === addHref ? (
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
                      />
                    ) : (
                      "+"
                    )}
                  </div>
                  <p className="mt-1.5 w-full truncate text-[10.5px] font-black leading-none text-[#25302d]">
                    {t("stories.add")}
                  </p>
                </div>
              </Link>
            ) : null}

            {ownStory ? (
              <Link
                href={ownStory.href ?? `/stories/${ownStory.id}`}
                prefetch={false}
                aria-busy={
                  pendingHref === (ownStory.href ?? `/stories/${ownStory.id}`) ||
                  undefined
                }
                onClick={(event) =>
                  startNavigationFeedback(
                    event,
                    ownStory.href ?? `/stories/${ownStory.id}`,
                  )
                }
                className={
                  isCompact
                    ? "group relative block w-14 shrink-0 overflow-visible text-center transition hover:opacity-85"
                    : isResponsive
                      ? "group relative block w-14 shrink-0 overflow-visible text-center transition hover:opacity-85 aria-busy:pointer-events-none aria-busy:opacity-65 lg:w-full lg:min-w-0 lg:overflow-hidden lg:rounded-[0.8rem] lg:bg-white lg:p-3 lg:text-left lg:ring-1 lg:ring-[#d8e0e6] lg:hover:bg-[#f7fafb]"
                      : "group relative block min-w-[180px] overflow-hidden rounded-[0.8rem] bg-white p-3 text-left ring-1 ring-[#d8e0e6] transition hover:bg-[#f7fafb] lg:w-full lg:min-w-0"
                }
              >
                <div
                  className={
                    isCompact
                      ? "flex min-w-0 flex-col items-center text-center"
                      : isResponsive
                        ? "flex min-w-0 flex-col items-center text-center lg:flex-row lg:gap-3 lg:text-left"
                        : "flex items-center gap-3"
                  }
                >
                  <div
                    className={[
                      "relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[#bfd6df] ring-2 transition group-hover:scale-[1.03]",
                      ownStorySeen ? "ring-[#c8cdd3]" : "ring-[var(--pa-accent)]",
                      usesCompactMobileLayout
                        ? "ring-offset-2 ring-offset-[var(--background)] lg:ring-offset-0"
                        : "",
                    ].join(" ")}
                  >
                    {ownStory.imageUrl ? (
                      <Image
                        src={getProfilePhotoVariantUrl(ownStory.imageUrl, 96)}
                        alt=""
                        width={48}
                        height={48}
                        draggable={false}
                        loading="lazy"
                        decoding="async"
                        fetchPriority="low"
                        unoptimized={shouldBypassImageOptimization(
                          getProfilePhotoVariantUrl(ownStory.imageUrl, 96),
                        )}
                        className="pa-protected-media h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-base font-black text-[#26556b]">
                        {ownStory.name.slice(0, 1)}
                      </div>
                    )}
                    {pendingHref ===
                    (ownStory.href ?? `/stories/${ownStory.id}`) ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                        <span
                          aria-hidden="true"
                          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
                        />
                      </span>
                    ) : null}
                  </div>
                  {isCompact ? (
                    <p className="mt-1.5 w-full truncate text-[10.5px] font-black leading-none text-[#25302d]">
                      {t("stories.yourStory")}
                    </p>
                  ) : isResponsive ? (
                    <div className="w-full min-w-0 lg:w-auto">
                      <p className="mt-1.5 w-full truncate text-[10.5px] font-black leading-none text-[#25302d] lg:mt-0 lg:text-sm lg:leading-normal">
                        {t("stories.yourStory")}
                      </p>
                      <p className="hidden truncate text-xs font-semibold text-[#25302d]/50 lg:block">
                        {t("stories.active")}
                      </p>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black">
                        {t("stories.yourStory")}
                      </p>
                      <p className="truncate text-xs font-semibold text-[#25302d]/50">
                        {t("stories.active")}
                      </p>
                    </div>
                  )}
                </div>
              </Link>
            ) : null}

            {orderedStories.map((story) => {
              const isSeen = seenStoryIds.has(story.id);
              const storyHref = story.href ?? `/stories/${story.id}`;
              const isPending = pendingHref === storyHref;
              const content = (
                <div
                  className={
                    isCompact
                      ? "flex min-w-0 flex-col items-center text-center"
                      : isResponsive
                        ? "flex min-w-0 flex-col items-center text-center lg:flex-row lg:gap-3 lg:text-left"
                        : "flex items-center gap-3"
                  }
                >
                  <div
                    className={[
                      "relative shrink-0 overflow-hidden rounded-full bg-[#bfd6df] ring-2",
                      isSeen ? "ring-[#c8cdd3]" : "ring-[var(--pa-accent)]",
                      isCompact
                        ? "h-12 w-12 ring-offset-2 ring-offset-[var(--background)]"
                        : isResponsive
                          ? "h-12 w-12 ring-offset-2 ring-offset-[var(--background)] lg:ring-offset-0"
                          : "h-12 w-12",
                    ].join(" ")}
                  >
                    {story.imageUrl ? (
                      <Image
                        src={getProfilePhotoVariantUrl(story.imageUrl, 96)}
                        alt=""
                        width={48}
                        height={48}
                        draggable={false}
                        loading="lazy"
                        decoding="async"
                        fetchPriority="low"
                        unoptimized={shouldBypassImageOptimization(
                          getProfilePhotoVariantUrl(story.imageUrl, 96),
                        )}
                        className={`pa-protected-media h-full w-full object-cover ${
                          story.locked ? "scale-110 blur-[3px]" : ""
                        }`}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-black text-[#26556b]">
                        {story.name.slice(0, 1)}
                      </div>
                    )}

                    {story.locked ? (
                      <div className="absolute inset-0 bg-black/10" />
                    ) : null}
                    {isPending ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                        <span
                          aria-hidden="true"
                          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
                        />
                      </span>
                    ) : null}
                  </div>

                  {isCompact ? (
                    <p className="mt-1.5 w-full truncate text-[10.5px] font-black leading-none text-[#25302d]">
                      {story.name}
                    </p>
                  ) : isResponsive ? (
                    <div className="w-full min-w-0 lg:w-auto">
                      <p className="mt-1.5 w-full truncate text-[10.5px] font-black leading-none text-[#25302d] lg:mt-0 lg:text-sm lg:leading-normal">
                        {story.name}
                      </p>
                      <p className="hidden truncate text-xs font-semibold text-[#25302d]/45 lg:block">
                        {story.locked
                          ? t("stories.loginToView")
                          : t("stories.active")}
                      </p>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{story.name}</p>
                      <p className="truncate text-xs font-semibold text-[#25302d]/45">
                        {story.locked
                          ? t("stories.loginToView")
                          : t("stories.active")}
                      </p>
                    </div>
                  )}
                </div>
              );

              const className =
                isCompact
                  ? "group relative block w-14 shrink-0 overflow-visible text-center transition hover:opacity-85"
                  : isResponsive
                    ? "group relative block w-14 shrink-0 overflow-visible text-center transition hover:opacity-85 aria-busy:pointer-events-none aria-busy:opacity-65 lg:w-full lg:min-w-0 lg:overflow-hidden lg:rounded-[0.8rem] lg:bg-white lg:p-3 lg:text-left lg:ring-1 lg:ring-[#d8e0e6] lg:hover:bg-[#f7fafb]"
                    : "group relative block min-w-[180px] overflow-hidden rounded-[0.8rem] bg-white p-3 text-left ring-1 ring-[#d8e0e6] transition hover:bg-[#f7fafb] lg:w-full lg:min-w-0";

              return story.locked ? (
                <button
                  key={story.id}
                  type="button"
                  onClick={() => setLockedStory(story)}
                  className={className}
                >
                  {content}
                </button>
              ) : (
                <Link
                  key={story.id}
                  href={storyHref}
                  prefetch={false}
                  aria-busy={isPending || undefined}
                  onClick={(event) =>
                    startNavigationFeedback(event, storyHref)
                  }
                  className={className}
                >
                  {content}
                </Link>
              );
            })}
          </div>
        ) : (
          <div
            className={
              isCompact
                ? "sr-only"
                : isResponsive
                  ? "hidden py-7 text-center lg:block"
                  : "py-7 text-center"
            }
          >
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#f1f4f6] text-[#8799a1]">
              <StoryEmptyIcon />
            </div>
            <p className="mt-5 text-sm font-black text-[#25302d]/72">
              {t("stories.noActive")}
            </p>
            <p className="mt-2 text-sm font-semibold leading-5 text-[#25302d]/70">
              {t("stories.stayVisible")}
            </p>
          </div>
        )}

        {isResponsive && addHref && stories.length === 0 && !ownStory ? (
          <div className="hidden py-7 text-center lg:block">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#f1f4f6] text-[#8799a1]">
              <StoryEmptyIcon />
            </div>
            <p className="mt-5 text-sm font-black text-[#25302d]/72">
              {t("stories.noActive")}
            </p>
            <p className="mt-2 text-sm font-semibold leading-5 text-[#25302d]/70">
              {t("stories.stayVisible")}
            </p>
          </div>
        ) : null}
      </aside>

      {lockedStory ? (
        <GuestProfileLoginPrompt
          profileName={lockedStory.name}
          profilePhotoUrl={lockedStory.imageUrl}
          onClose={() => setLockedStory(null)}
        />
      ) : null}
    </>
  );
}
