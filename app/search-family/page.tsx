import { Header } from "@/components/layout/Header";
import { LegalFooter } from "@/components/layout/LegalFooter";
import { ActiveFilterChips } from "@/components/search/ActiveFilterChips";
import { GuestProfileAccessPrompt } from "@/components/search/GuestProfileAccessPrompt";
import { ProfileSearchCard } from "@/components/search/ProfileSearchCard";
import { ProfileDiscoverySearch } from "@/components/search/ProfileDiscoverySearch";
import { SearchFilters } from "@/components/search/SearchFilters";
import { ProfilePagination } from "@/components/search/ProfilePagination";
import { SearchResultsToolbar } from "@/components/search/SearchResultsToolbar";
import { StoriesRail } from "@/components/search/StoriesRail";
import { getProfilePhotoUrl } from "@/lib/profile/photos";
import {
  createClosedPublicCatalogResult,
  loadBoundedPublicStoryCards,
  loadBoundedPublicProfileCards,
  reservePublicCatalogRequest,
} from "@/lib/profile/public-catalog";
import { normalizeProfileSearchSort } from "@/lib/profiles/pagination";
import { groupLatestStoryByProfile } from "@/lib/stories/group-story-cards";
import { buildNewStoryHref, buildStoryHref } from "@/lib/stories/story-links";
import { loadViewedStoryIds } from "@/lib/stories/viewed-story-ids";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseSessionCookie } from "@/lib/supabase/has-session-cookie";
import { redirect } from "next/navigation";
import { getServerTranslator } from "@/lib/i18n/server";
import { normalizeSearchMonthFilters } from "@/lib/search/normalize-search-month-filters";
import {
  buildSearchFiltersStateKey,
  formatCatalogResultCount,
} from "@/lib/search/catalog-ui";
import { childrenOptions } from "@/lib/profile-options";
import {
  formatChildrenInfo,
  formatCountryName,
  formatFamilyStoryDisplayName,
} from "@/lib/i18n/translations";
import {
  FAMILY_SOCIAL_PREVIEW_ALT,
  FAMILY_SOCIAL_PREVIEW_PATH,
  SITE_NAME,
  SITE_URL,
} from "@/lib/site";
import { redirectAdminToDashboard } from "@/lib/admin/access";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { isLikelyDesktopRequest } from "@/lib/browser/request-viewport";

export const metadata: Metadata = {
  title: "Find a Host Family",
  description:
    "Browse host family profiles by country, availability, duration, children, allowance, activity, stories, and intro videos.",
  alternates: {
    canonical: `${SITE_URL}/search-family`,
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "Find a Host Family | Perfect AuPair",
    description:
      "Create your au pair profile, browse host families and start chatting for free. No fees or payments.",
    url: `${SITE_URL}/search-family`,
    images: [
      {
        url: FAMILY_SOCIAL_PREVIEW_PATH,
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: FAMILY_SOCIAL_PREVIEW_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Find a Host Family | Perfect AuPair",
    description:
      "Create your au pair profile, browse host families and start chatting for free. No fees or payments.",
    images: [
      {
        url: FAMILY_SOCIAL_PREVIEW_PATH,
        alt: FAMILY_SOCIAL_PREVIEW_ALT,
      },
    ],
  },
};

type FamilyCard = {
  id: string;
  public_slug?: string | null;
  created_at?: string | null;
  full_name: string | null;
  country: string | null;
  city: string | null;
  children_info: string | null;
  au_pair_allowance_amount: number | null;
  au_pair_allowance_currency: string | null;
  availability_start: string | null;
  availability_start_from: string | null;
  availability_start_to: string | null;
  duration: string | null;
  duration_min_months: number | null;
  duration_max_months: number | null;
  accommodation_info: string | null;
  expectations: string | null;
  bio: string | null;
  primary_photo_path: string | null;
  photo_count: number;
  activity_status: string | null;
  verification_status?: string | null;
  has_story?: boolean | null;
  has_video?: boolean | null;
};

type ActiveStory = {
  id: string;
  profile_id?: string | null;
  public_slug?: string | null;
  full_name: string | null;
  storage_path: string;
  primary_photo_path?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
};

type OwnActiveStory = {
  id: string;
  storage_path: string;
  created_at?: string | null;
  expires_at?: string | null;
};

type HeaderProfilePhoto = {
  storage_path: string | null;
};

type FilterOption = {
  label: string;
  value: string;
};

function uniqueOptions(values: Array<string | null | undefined>): FilterOption[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  )
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ label: value, value }));
}

function buildSearchReturnTo(
  basePath: string,
  filters: Awaited<Parameters<typeof SearchFamilyPage>[0]["searchParams"]>,
) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, String(value));
  });

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export default async function SearchFamilyPage({
  searchParams,
}: {
  searchParams: Promise<{
    country?: string;
    startFrom?: string;
    startTo?: string;
    durationMin?: string;
    durationMax?: string;
    children?: string;
    allowanceMin?: string;
    allowanceCurrency?: string;
    activity?: string;
    has_video?: string;
    has_stories?: string;
    page?: string;
    sort?: string;
  }>;
}) {
  const [
    resolvedSearchParams,
    supabase,
    { locale, t },
    hasSessionCookie,
    requestHeaders,
  ] = await Promise.all([
    searchParams,
    createClient(),
    getServerTranslator(),
    hasSupabaseSessionCookie(),
    headers(),
  ]);
  const filters = normalizeSearchMonthFilters(resolvedSearchParams);
  const selectedSort = normalizeProfileSearchSort(filters.sort);
  const initialDesktopViewport = isLikelyDesktopRequest(requestHeaders);

  const user = hasSessionCookie
    ? (await supabase.auth.getUser()).data.user
    : null;

  redirectAdminToDashboard(user);

  const authState: "public" | "authenticated" = user
    ? "authenticated"
    : "public";
  let viewerAccountType: "family" | "au_pair" | null = null;
  let viewerProfilePhotoUrl: string | null = null;

  if (user) {
    const { data: viewerProfile } = await supabase
      .from("profiles")
      .select("account_type, onboarding_completed")
      .eq("id", user.id)
      .maybeSingle();

    viewerAccountType =
      viewerProfile?.account_type === "family" ||
      viewerProfile?.account_type === "au_pair"
        ? viewerProfile.account_type
        : null;

    if (!viewerProfile?.onboarding_completed) {
      redirect("/onboarding");
    }

    if (viewerProfile.account_type !== "au_pair") {
      redirect("/search-aupair");
    }

  }

  const now = new Date().toISOString();
  const catalogBudgetPromise = reservePublicCatalogRequest("search");
  const viewerPhotoPromise = user
    ? Promise.resolve(
        supabase
          .from("profile_photos")
          .select("storage_path")
          .eq("profile_id", user.id)
          .order("is_primary", { ascending: false })
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle<HeaderProfilePhoto>(),
      )
    : Promise.resolve({ data: null });
  const catalogBudget = await catalogBudgetPromise;
  const [
    { data: viewerPhoto },
    catalog,
    { data: storyProfiles },
    { data: ownActiveStories },
  ] = await Promise.all([
    viewerPhotoPromise,
    catalogBudget.allowed
      ? loadBoundedPublicProfileCards<FamilyCard>({
          accountType: "family",
          filters,
          viewerId: user?.id ?? null,
          sort: selectedSort,
          page: filters.page,
          guestPageLimit: user ? null : 2,
        })
      : Promise.resolve(
          createClosedPublicCatalogResult<FamilyCard>({
            message: catalogBudget.unavailable
              ? "Catalog rate limiter unavailable"
              : "Catalog request limit exceeded",
            page: filters.page,
          }),
        ),
    catalogBudget.allowed
      ? loadBoundedPublicStoryCards<ActiveStory>("family", user?.id ?? null)
      : Promise.resolve({ data: null }),
    user && catalogBudget.allowed
      ? supabase
          .from("profile_stories")
          .select("id, storage_path, created_at, expires_at")
          .eq("profile_id", user.id)
          .gt("expires_at", now)
          .order("created_at", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: null }),
  ]);

  viewerProfilePhotoUrl = getProfilePhotoUrl(
    supabase,
    viewerPhoto?.storage_path ?? null,
  );

  const profileRows = catalog.data;
  const storyRows = (storyProfiles ?? []) as ActiveStory[];

  const visibleFamilies = profileRows.map((profile) => ({
    ...profile,
    photoUrl: getProfilePhotoUrl(supabase, profile.primary_photo_path),
  }));
  // The bounded story RPC already applies bilateral block filtering. Keep the
  // remaining viewer-specific lookups parallel so they do not add serial TTFB.
  const groupedStoryProfiles = groupLatestStoryByProfile(storyRows);
  const [viewedStoryIds, favoriteRows] = await Promise.all([
    user
      ? loadViewedStoryIds(
          supabase,
          groupedStoryProfiles.map((story) => story.id),
        )
      : Promise.resolve([]),
    user && visibleFamilies.length > 0
      ? supabase
          .from("profile_favorites")
          .select("profile_id")
          .eq("user_id", user.id)
          .in(
            "profile_id",
            visibleFamilies.map((profile) => profile.id),
          )
      : Promise.resolve({ data: [] as Array<{ profile_id: string }> }),
  ]);
  const isGuestPageBlocked = !user && catalog.currentPage > 2;
  const catalogTotalLabel = formatCatalogResultCount(
    catalog.totalItems,
    catalog.totalIsCapped,
  );
  const returnTo = buildSearchReturnTo("/search-family", filters);
  const newStoryHref = buildNewStoryHref(returnTo);
  const storyByProfileId = new Map(
    groupedStoryProfiles.flatMap((story) =>
      story.profile_id
        ? ([
            [
              story.profile_id,
              {
                id: story.id,
                href: user ? buildStoryHref(story.id, returnTo) : "/login",
              },
            ] as const,
          ])
        : [],
    ),
  );
  const favoriteProfileIds = new Set(
    (favoriteRows.data ?? []).map((favorite) => favorite.profile_id as string),
  );

  const filterGroups = [
    {
      title: t("common.location"),
      key: "country",
      options: uniqueOptions(catalog.countries).map(
        (option) => ({
          ...option,
          label: formatCountryName(option.value, locale),
        }),
      ),
    },
    {
      title: t("filters.activity"),
      key: "activity",
      options: [
        { label: t("activity.active"), value: "active" },
        {
          label: t("activity.recentlyActive"),
          value: "recently_active",
        },
      ],
    },
    {
      title: t("common.numberOfChildren"),
      key: "children",
      options: childrenOptions.map((value) => ({
        value,
        label: formatChildrenInfo(value, locale) ?? value,
      })),
    },
  ];

  const storyItems = groupedStoryProfiles.map((story) => ({
    id: story.id,
    name:
      formatFamilyStoryDisplayName(story.full_name, locale) ??
      t("common.profile"),
    imageUrl: getProfilePhotoUrl(supabase, story.primary_photo_path),
    href: user ? buildStoryHref(story.id, returnTo) : undefined,
    locked: !user,
  }));
  const ownActiveStory = ((ownActiveStories ?? []) as OwnActiveStory[])[0];
  const ownStoryItem = ownActiveStory
    ? {
        id: ownActiveStory.id,
        name: t("stories.yourStory"),
        imageUrl: viewerProfilePhotoUrl,
        href: buildStoryHref(ownActiveStory.id, returnTo),
      }
    : null;
  const sortLabels = {
    sortBy: t("search.sortBy"),
    recommended: t("search.sortRecommended"),
    newestFirst: t("search.sortNewestFirst"),
    recentlyActive: t("search.sortRecentlyActive"),
    oldestFirst: t("search.sortOldestFirst"),
    updatingResults: t("search.updatingProfiles"),
  };

  if (catalog.error) {
    console.error("Could not load family search profiles.", catalog.error);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[#25302d]">
      <Header
        authState={authState}
        accountType={viewerAccountType}
        initialProfilePhotoUrl={viewerProfilePhotoUrl}
      />

      <h1 className="sr-only">{t("search.browseFamilies")}</h1>

      <ProfileDiscoverySearch
        isAuthenticated={Boolean(user)}
        targetType="family"
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
        className="sm:hidden"
      />

      <section className="pa-profile-feed-layout pa-profile-feed-layout--search">
        <StoriesRail
          stories={storyItems}
          ownStory={ownStoryItem}
          initialSeenStoryIds={viewedStoryIds}
          addHref={user ? newStoryHref : undefined}
          variant="responsive"
          className="order-1 min-w-0 max-w-full lg:order-3"
        />

        <SearchFilters
          key={buildSearchFiltersStateKey(filters)}
          title={t("search.findFamily")}
          initialDesktopViewport={initialDesktopViewport}
          groups={filterGroups}
          currentFilters={filters}
          targetType="family"
          initialResultCount={catalog.totalItems}
          initialResultCountCapped={catalog.totalIsCapped}
          tone="family"
          showAllowanceFilter
          className="order-2 min-w-0 max-w-full lg:order-1"
          mobileHeader={{
            title: t("search.browseFamilies"),
            description: t("search.profilesShown", {
              visible: visibleFamilies.length,
              total: catalogTotalLabel,
            }),
            savedLink: user
              ? {
                  href: "/saved",
                  label: t("common.saved"),
                  ariaLabel: t("nav.savedProfiles"),
                }
              : undefined,
          }}
          mobileSort={
            !isGuestPageBlocked
              ? {
                  basePath: "/search-family",
                  filters,
                  labels: sortLabels,
                  sort: selectedSort,
                }
              : undefined
          }
        />

        <div className="order-3 min-w-0 lg:order-2">
          {!isGuestPageBlocked ? (
            <SearchResultsToolbar
              basePath="/search-family"
              filters={filters}
              resultSummary={t("search.profilesShown", {
                visible: visibleFamilies.length,
                total: catalogTotalLabel,
              })}
              sort={selectedSort}
              labels={sortLabels}
            />
          ) : null}

          <ActiveFilterChips
            basePath="/search-family"
            filters={filters}
            locale={locale}
            title={t("search.browseFamilies")}
            resultSummary={t("search.profilesShown", {
              visible: visibleFamilies.length,
              total: catalogTotalLabel,
            })}
          />

          {catalog.error ? (
            <div className="rounded-[1.5rem] bg-red-50 p-5 text-sm font-semibold text-red-700">
              {t("common.errorTryAgain")}
            </div>
          ) : isGuestPageBlocked ? (
            <GuestProfileAccessPrompt autoOpen returnTo={returnTo} />
          ) : visibleFamilies.length > 0 ? (
            <div className="grid gap-3 lg:gap-4">
              {visibleFamilies.map((profile, index) => {
                const profileStory = storyByProfileId.get(profile.id);

                return (
                  <ProfileSearchCard
                    key={profile.id}
                    profile={{ ...profile, account_type: "family" }}
                    locale={locale}
                    isAuthenticated={Boolean(user)}
                    isSaved={favoriteProfileIds.has(profile.id)}
                    hasStory={profile.has_story === true}
                    hasVideo={profile.has_video === true}
                    storyHref={profileStory?.href ?? null}
                    storyId={profileStory?.id ?? null}
                    imagePriority={index < 2}
                    headingLevel={2}
                  />
                );
              })}

            </div>
          ) : (
            <div className="rounded-[1.5rem] bg-[#f8fbfc] p-8 text-center shadow-[0_10px_28px_rgba(38,63,69,0.05)] ring-1 ring-[#cddbe2]">
              <h2 className="text-2xl font-bold">{t("search.noMatchingFamilies")}</h2>
              <p className="mt-2 text-sm font-semibold text-[#25302d]/70">
                {t("search.tryChangingFilters")}
              </p>
            </div>
          )}

          <ProfilePagination
            basePath="/search-family"
            currentPage={catalog.currentPage}
            totalPages={catalog.totalPages}
            searchParams={filters}
            lockPagesAfterFirst={!user}
            freePageCount={2}
            guestPrompt={{
              title: t("profileGuestPrompt.title"),
              text: t("profiles.loginBlockerText"),
            }}
            labels={{
              previous: t("pagination.previous"),
              next: t("pagination.next"),
              page: t("pagination.page"),
              currentPage: t("pagination.currentPage"),
              pageOf: t("pagination.pageOf"),
            }}
          />
        </div>

      </section>

      <LegalFooter />
    </main>
  );
}
