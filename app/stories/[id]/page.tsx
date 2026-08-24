import { StoryCloseButton } from "@/components/stories/StoryCloseButton";
import { StoryKeyboardControls } from "@/components/stories/StoryKeyboardControls";
import { StorySeenMarker } from "@/components/stories/StorySeenMarker";
import { isAdminEmail } from "@/lib/admin/access";
import { getServerTranslator } from "@/lib/i18n/server";
import {
  formatCountryName,
  formatFamilyStoryDisplayName,
  type Translate,
} from "@/lib/i18n/translations";
import { getSignedStoryPhotoUrl } from "@/lib/images/storage";
import {
  getStoryPhotoVariantUrl,
  shouldBypassImageOptimization,
  STORY_PHOTO_VIEW_WIDTH,
} from "@/lib/images/optimization";
import { isProfilePairBlocked } from "@/lib/profile/blocks";
import { buildStoryHref, getSafeStoryReturnTo } from "@/lib/stories/story-links";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

type PublicStory = {
  id: string;
  profile_id: string;
  full_name: string | null;
  account_type: "family" | "au_pair";
  city: string | null;
  country: string | null;
  storage_path: string;
  created_at: string;
  expires_at: string;
};

type StoryPageItem = {
  id: string;
  storage_path: string;
  created_at: string;
  expires_at: string;
};

type OwnStoryRow = StoryPageItem & {
  profile_id: string;
};

type OwnStoryProfile = {
  full_name: string | null;
  account_type: "family" | "au_pair" | null;
  city: string | null;
  country: string | null;
  onboarding_completed: boolean | null;
  suspended_at: string | null;
  deletion_requested_at: string | null;
  is_admin: boolean | null;
};

function getTimeAgo(value: string, t: Translate) {
  const createdAt = new Date(value).getTime();
  const now = Date.now();
  const diffInSeconds = Math.max(0, Math.floor((now - createdAt) / 1000));

  const minutes = Math.floor(diffInSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return t("stories.daysAgo", { count: days });
  if (hours > 0) return t("stories.hoursAgo", { count: hours });
  if (minutes > 0) return t("stories.minutesAgo", { count: minutes });

  return t("stories.justNow");
}

function normalizeStoryViewCount(value: unknown) {
  const count = typeof value === "number" ? value : Number(value);

  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
}

function StoryViewsIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M2.3 11a1.9 1.9 0 0 0 0 2C3.5 14.8 7 19 12 19s8.5-4.2 9.7-6a1.9 1.9 0 0 0 0-2C20.5 9.2 17 5 12 5S3.5 9.2 2.3 11Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default async function StoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const { locale, t } = await getServerTranslator();
  const supabase = await createClient();

  /* STORY_GUEST_GUARD_START */
  const {
    data: { user: storyViewer },
  } = await supabase.auth.getUser();

  if (!storyViewer) {
    redirect("/login");
  }
  /* STORY_GUEST_GUARD_END */
  const isAdminViewer = isAdminEmail(storyViewer.email);

  const { data, error } = await supabase.rpc("get_public_story", {
    p_story_id: id,
  });

  if (error) {
    console.error(error);
    notFound();
  }

  let story = ((data ?? []) as PublicStory[])[0] ?? null;

  if (!story) {
    const { data: ownStory } = await supabase
      .from("profile_stories")
      .select("id, profile_id, storage_path, created_at, expires_at")
      .eq("id", id)
      .eq("profile_id", storyViewer.id)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle<OwnStoryRow>();

    if (ownStory) {
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select(
          "full_name, account_type, city, country, onboarding_completed, suspended_at, deletion_requested_at, is_admin",
        )
        .eq("id", storyViewer.id)
        .maybeSingle<OwnStoryProfile>();

      if (
        ownerProfile?.onboarding_completed &&
        !ownerProfile.suspended_at &&
        !ownerProfile.deletion_requested_at &&
        !ownerProfile.is_admin &&
        (ownerProfile.account_type === "family" ||
          ownerProfile.account_type === "au_pair")
      ) {
        story = {
          id: ownStory.id,
          profile_id: ownStory.profile_id,
          full_name: ownerProfile.full_name,
          account_type: ownerProfile.account_type,
          city: ownerProfile.city,
          country: ownerProfile.country,
          storage_path: ownStory.storage_path,
          created_at: ownStory.created_at,
          expires_at: ownStory.expires_at,
        };
      }
    }
  }

  if (!story && isAdminViewer) {
    try {
      const admin = createAdminClient();
      const { data: adminStory } = await admin
        .from("profile_stories")
        .select("id, profile_id, storage_path, created_at, expires_at")
        .eq("id", id)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle<OwnStoryRow>();

      if (adminStory) {
        const { data: ownerProfile } = await admin
          .from("profiles")
          .select(
            "full_name, account_type, city, country, onboarding_completed, suspended_at, deletion_requested_at, is_admin",
          )
          .eq("id", adminStory.profile_id)
          .maybeSingle<OwnStoryProfile>();

        if (
          ownerProfile?.onboarding_completed &&
          !ownerProfile.suspended_at &&
          !ownerProfile.deletion_requested_at &&
          !ownerProfile.is_admin &&
          (ownerProfile.account_type === "family" ||
            ownerProfile.account_type === "au_pair")
        ) {
          story = {
            id: adminStory.id,
            profile_id: adminStory.profile_id,
            full_name: ownerProfile.full_name,
            account_type: ownerProfile.account_type,
            city: ownerProfile.city,
            country: ownerProfile.country,
            storage_path: adminStory.storage_path,
            created_at: adminStory.created_at,
            expires_at: adminStory.expires_at,
          };
        }
      }
    } catch (error) {
      console.error("Could not load story through admin fallback.", {
        storyId: id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!story) {
    notFound();
  }

  if (
    !isAdminViewer &&
    (await isProfilePairBlocked(supabase, storyViewer.id, story.profile_id))
  ) {
    notFound();
  }

  const isOwnStory = story.profile_id === storyViewer.id;
  const shouldRecordStoryView = !isOwnStory && !isAdminViewer;
  let storyViewCount: number | null = null;

  if (isOwnStory) {
    const { data: viewCount, error: viewCountError } = await supabase.rpc(
      "get_own_profile_story_view_count",
      { p_story_id: story.id },
    );

    if (viewCountError) {
      console.error("Could not load profile story view count.", {
        storyId: story.id,
        message: viewCountError.message,
      });
    } else {
      storyViewCount = normalizeStoryViewCount(viewCount);
    }
  }

  // STORY_PROFILE_SLUG_LOOKUP
  const { data: storyProfileData } = await supabase
    .rpc("get_public_profile", { p_profile_id: story.profile_id })
    .maybeSingle();

  const storyProfile = storyProfileData as {
    public_slug?: string | null;
  } | null;
  const storyProfileHref = `/profile/${storyProfile?.public_slug ?? story.profile_id}`;

  const publicUrl = await getSignedStoryPhotoUrl(
    supabase,
    story.storage_path,
    story.expires_at,
  );

  if (!publicUrl) {
    notFound();
  }
  const storyImageUrl = getStoryPhotoVariantUrl(
    publicUrl,
    STORY_PHOTO_VIEW_WIDTH,
  );
  const { data: profileStories } = await supabase
    .from("profile_stories")
    .select("id, storage_path, created_at, expires_at")
    .eq("profile_id", story.profile_id)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });
  const activeStories = ((profileStories ?? []) as StoryPageItem[]).some(
    (profileStory) => profileStory.id === story.id,
  )
    ? ((profileStories ?? []) as StoryPageItem[])
    : [
        {
          id: story.id,
          storage_path: story.storage_path,
          created_at: story.created_at,
          expires_at: story.expires_at,
        },
      ];
  const currentStoryIndex = Math.max(
    0,
    activeStories.findIndex((profileStory) => profileStory.id === story.id),
  );
  const previousStory = activeStories[currentStoryIndex - 1];
  const nextStory = activeStories[currentStoryIndex + 1];
  const storyDisplayName =
    story.account_type === "family"
      ? formatFamilyStoryDisplayName(story.full_name, locale)
      : story.full_name;

  const fallbackHref = getSafeStoryReturnTo(query.returnTo, storyProfileHref);
  const previousStoryHref = previousStory
    ? buildStoryHref(previousStory.id, fallbackHref)
    : null;
  const nextStoryHref = nextStory
    ? buildStoryHref(nextStory.id, fallbackHref)
    : null;

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "#111",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(12px, 4vw, 24px)",
      }}
    >
      <StorySeenMarker
        storyId={story.id}
        shouldRecordView={shouldRecordStoryView}
      />

      <section style={{ width: "min(460px, 100%)" }}>
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRadius: "clamp(24px, 8vw, 36px)",
            background: "#000",
            boxShadow: "0 30px 90px rgba(0,0,0,0.55)",
          }}
        >
          <StoryKeyboardControls
            closeHref={fallbackHref}
            previousHref={previousStoryHref}
            nextHref={nextStoryHref}
          />
          <StoryCloseButton fallbackHref={fallbackHref} />

          <div
            style={{
              position: "relative",
              height: "min(740px, calc(100dvh - 128px))",
              background: "#000",
            }}
          >
            {activeStories.length > 1 ? (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  zIndex: 3,
                  display: "flex",
                  gap: "6px",
                  padding: "8px 14px",
                }}
              >
                {activeStories.map((profileStory, index) => (
                  <span
                    key={profileStory.id}
                    style={{
                      height: "3px",
                      flex: 1,
                      overflow: "hidden",
                      borderRadius: "999px",
                      background: "rgba(255,255,255,0.34)",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        height: "100%",
                        width: index <= currentStoryIndex ? "100%" : "0%",
                        borderRadius: "999px",
                        background: "#fff",
                      }}
                    />
                  </span>
                ))}
              </div>
            ) : null}

            <Image
              src={storyImageUrl}
              alt=""
              fill
              preload
              fetchPriority="high"
              sizes="(min-width: 640px) 460px, calc(100vw - 24px)"
              draggable={false}
              unoptimized={shouldBypassImageOptimization(storyImageUrl)}
              className="pa-protected-media"
              style={{
                objectFit: "contain",
              }}
            />

            {previousStory ? (
              <Link
                href={previousStoryHref ?? "#"}
                aria-hidden="true"
                tabIndex={-1}
                prefetch={false}
                scroll={false}
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  top: "76px",
                  zIndex: 2,
                  width: "45%",
                  color: "transparent",
                  textDecoration: "none",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                {t("stories.previous")}
              </Link>
            ) : null}

            {nextStory ? (
              <Link
                href={nextStoryHref ?? "#"}
                aria-hidden="true"
                tabIndex={-1}
                prefetch={false}
                scroll={false}
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  top: "76px",
                  zIndex: 2,
                  width: "45%",
                  color: "transparent",
                  textDecoration: "none",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                {t("stories.next")}
              </Link>
            ) : null}

            {previousStory ? (
              <Link
                href={previousStoryHref ?? "#"}
                aria-label={t("stories.previous")}
                prefetch={false}
                scroll={false}
                style={{
                  position: "absolute",
                  left: "10px",
                  top: "50%",
                  zIndex: 2,
                  display: "flex",
                  height: "42px",
                  width: "42px",
                  transform: "translateY(-50%)",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "999px",
                  background: "rgba(0,0,0,0.38)",
                  color: "#fff",
                  textDecoration: "none",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: "block",
                    height: "13px",
                    width: "13px",
                    transform: "translateX(2px) rotate(45deg)",
                    borderBottom: "4px solid currentColor",
                    borderLeft: "4px solid currentColor",
                  }}
                />
              </Link>
            ) : null}

            {nextStory ? (
              <Link
                href={nextStoryHref ?? "#"}
                aria-label={t("stories.next")}
                prefetch={false}
                scroll={false}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  zIndex: 2,
                  display: "flex",
                  height: "42px",
                  width: "42px",
                  transform: "translateY(-50%)",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "999px",
                  background: "rgba(0,0,0,0.38)",
                  color: "#fff",
                  textDecoration: "none",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: "block",
                    height: "13px",
                    width: "13px",
                    transform: "translateX(-2px) rotate(-45deg)",
                    borderBottom: "4px solid currentColor",
                    borderRight: "4px solid currentColor",
                  }}
                />
              </Link>
            ) : null}

            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                zIndex: 1,
                padding: "18px 72px 38px 18px",
                backgroundColor: "rgba(0,0,0,0.42)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  minWidth: 0,
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <p
                  style={{
                    minWidth: 0,
                    margin: 0,
                    overflow: "hidden",
                    fontSize: "11px",
                    fontWeight: 800,
                    letterSpacing: "0.18em",
                    textOverflow: "ellipsis",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                    color: "rgba(255,255,255,0.7)",
                  }}
                >
                  {story.account_type === "au_pair"
                    ? t("stories.auPairStory")
                    : t("stories.familyStory")}{" "}
                  · {getTimeAgo(story.created_at, t)}
                </p>

                {isOwnStory && storyViewCount !== null ? (
                  <span
                    role="img"
                    aria-label={t("stories.uniqueViews", {
                      count: storyViewCount,
                    })}
                    title={t("stories.uniqueViews", {
                      count: storyViewCount,
                    })}
                    style={{
                      display: "inline-flex",
                      flexShrink: 0,
                      alignItems: "center",
                      gap: "5px",
                      borderRadius: "999px",
                      background: "rgba(0,0,0,0.42)",
                      padding: "5px 8px",
                      color: "#fff",
                      fontSize: "13px",
                      fontWeight: 800,
                      letterSpacing: 0,
                      lineHeight: 1,
                    }}
                  >
                    <StoryViewsIcon />
                    <span aria-hidden="true">{storyViewCount}</span>
                  </span>
                ) : null}
              </div>

              <h1
                style={{
                  margin: "8px 0 0",
                  fontSize: "clamp(18px, 5vw, 20px)",
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {storyDisplayName ?? t("common.profile")}
              </h1>

              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: "14px",
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.62)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {story.city ? `${story.city}, ` : ""}
                {formatCountryName(story.country, locale)}
              </p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "12px 16px 18px",
              background: "#000",
            }}
          >
            <Link
              href={storyProfileHref}
              prefetch={false}
              style={{
                borderRadius: "999px",
                background: "#fff",
                color: "#25302d",
                padding: "14px 24px",
                fontSize: "15px",
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              {t("common.viewProfile")}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
