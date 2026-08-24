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
import {
  formatCountryName,
  formatGender as formatLocalizedGender,
  formatLanguageName,
  formatSmoking,
} from "@/lib/i18n/translations";
import { languageOptions } from "@/lib/profile-options";
import {
  AU_PAIR_SOCIAL_PREVIEW_ALT,
  AU_PAIR_SOCIAL_PREVIEW_PATH,
  SITE_NAME,
  SITE_URL,
} from "@/lib/site";
import { redirectAdminToDashboard } from "@/lib/admin/access";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { isLikelyDesktopRequest } from "@/lib/browser/request-viewport";

export const metadata: Metadata = {
  title: "Find an Au Pair | Browse Profiles, No Contact Fees",
  description:
    "Browse current au pair profiles by country, language, experience, availability and duration. Send messages to suitable candidates with no contact fee.",
  alternates: {
    canonical: `${SITE_URL}/search-aupair`,
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "Find an Au Pair | Browse Profiles, No Contact Fees | Perfect AuPair",
    description:
      "Compare current au pair profiles and contact suitable candidates directly without a contact fee.",
    url: `${SITE_URL}/search-aupair`,
    images: [
      {
        url: AU_PAIR_SOCIAL_PREVIEW_PATH,
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: AU_PAIR_SOCIAL_PREVIEW_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Find an Au Pair | Browse Profiles, No Contact Fees | Perfect AuPair",
    description:
      "Compare current au pair profiles and contact suitable candidates directly without a contact fee.",
    images: [
      {
        url: AU_PAIR_SOCIAL_PREVIEW_PATH,
        alt: AU_PAIR_SOCIAL_PREVIEW_ALT,
      },
    ],
  },
};

type AuPairCard = {
  id: string;
  public_slug?: string | null;
  created_at?: string | null;
  full_name: string | null;
  first_name?: string | null;
  country: string | null;
  city: string | null;
  nationality: string | null;
  preferred_host_countries: string[] | null;
  mother_tongue: string | null;
  fluent_languages: string[] | null;
  basic_languages: string[] | null;
  availability_start: string | null;
  availability_start_from: string | null;
  availability_start_to: string | null;
  duration: string | null;
  duration_min_months: number | null;
  duration_max_months: number | null;
  smoking_status: string | null;
  gender: string | null;
  religion: string | null;
  already_in_germany: boolean | null;
  childcare_experience: string | null;
  has_drivers_license: boolean | null;
  has_childcare_experience: boolean | null;
  has_infant_experience: boolean | null;
  has_first_aid: boolean | null;
  will_care_for_elderly: boolean | null;
  will_care_for_pets: boolean | null;
  age: number | null;
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
  filters: Awaited<Parameters<typeof SearchAuPairPage>[0]["searchParams"]>,
) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, String(value));
  });

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export default async function SearchAuPairPage({
  searchParams,
}: {
  searchParams: Promise<{
    country?: string;
    language?: string;
    startFrom?: string;
    startTo?: string;
    durationMin?: string;
    durationMax?: string;
    smoking?: string;
    gender?: string;
    ageMin?: string;
    ageMax?: string;
    activity?: string;
    alreadyInGermany?: string;
    willCareForElderly?: string;
    willCareForPets?: string;
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
  const showCanonicalSeoContent = Object.entries(resolvedSearchParams).every(
    ([key, value]) =>
      !value ||
      (key === "page" && value === "1") ||
      (key === "sort" && value === "recommended"),
  );
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

    if (viewerProfile.account_type !== "family") {
      redirect("/search-family");
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
      ? loadBoundedPublicProfileCards<AuPairCard>({
          accountType: "au_pair",
          filters,
          viewerId: user?.id ?? null,
          sort: selectedSort,
          page: filters.page,
          guestPageLimit: user ? null : 2,
        })
      : Promise.resolve(
          createClosedPublicCatalogResult<AuPairCard>({
            message: catalogBudget.unavailable
              ? "Catalog rate limiter unavailable"
              : "Catalog request limit exceeded",
            page: filters.page,
          }),
        ),
    catalogBudget.allowed
      ? loadBoundedPublicStoryCards<ActiveStory>("au_pair", user?.id ?? null)
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

  const visibleAuPairs = profileRows.map((profile) => ({
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
    user && visibleAuPairs.length > 0
      ? supabase
          .from("profile_favorites")
          .select("profile_id")
          .eq("user_id", user.id)
          .in(
            "profile_id",
            visibleAuPairs.map((profile) => profile.id),
          )
      : Promise.resolve({ data: [] as Array<{ profile_id: string }> }),
  ]);
  const isGuestPageBlocked = !user && catalog.currentPage > 2;
  const catalogTotalLabel = formatCatalogResultCount(
    catalog.totalItems,
    catalog.totalIsCapped,
  );
  const returnTo = buildSearchReturnTo("/search-aupair", filters);
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
      title: t("common.languages"),
      key: "language",
      options: languageOptions.map((language) => ({
        label: formatLanguageName(language, locale),
        value: language,
      })),
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
      title: t("common.alreadyInGermany"),
      key: "alreadyInGermany",
      options: [{ label: t("common.yes"), value: "1" }],
    },
    {
      title: t("common.elderlyCare"),
      key: "willCareForElderly",
      options: [{ label: t("common.yes"), value: "1" }],
    },
    {
      title: t("common.petCare"),
      key: "willCareForPets",
      options: [{ label: t("common.yes"), value: "1" }],
    },
    {
      title: t("common.gender"),
      key: "gender",
      options: [
        {
          label: formatLocalizedGender("female", locale) ?? "Female",
          value: "female",
        },
        {
          label: formatLocalizedGender("male", locale) ?? "Male",
          value: "male",
        },
      ],
    },
    {
      title: t("common.smoking"),
      key: "smoking",
      options: [
        { label: formatSmoking("non_smoker", locale), value: "non_smoker" },
        { label: formatSmoking("smoker", locale), value: "smoker" },
      ],
    },
  ];

  const storyItems = groupedStoryProfiles.map((story) => ({
    id: story.id,
    name: story.full_name ?? t("common.profile"),
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
    console.error("Could not load au pair search profiles.", catalog.error);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[#25302d]">
      <Header
        authState={authState}
        accountType={viewerAccountType}
        initialProfilePhotoUrl={viewerProfilePhotoUrl}
      />

      <h1 className="sr-only">{t("search.browseAuPairs")}</h1>

      <ProfileDiscoverySearch
        isAuthenticated={Boolean(user)}
        targetType="au_pair"
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
          title={t("search.findAuPair")}
          initialDesktopViewport={initialDesktopViewport}
          groups={filterGroups}
          currentFilters={filters}
          targetType="au_pair"
          initialResultCount={catalog.totalItems}
          initialResultCountCapped={catalog.totalIsCapped}
          tone="au_pair"
          showAgeFilter
          className="order-2 min-w-0 max-w-full lg:order-1"
          mobileHeader={{
            title: t("search.browseAuPairs"),
            description: t("search.profilesShown", {
              visible: visibleAuPairs.length,
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
                  basePath: "/search-aupair",
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
              basePath="/search-aupair"
              filters={filters}
              resultSummary={t("search.profilesShown", {
                visible: visibleAuPairs.length,
                total: catalogTotalLabel,
              })}
              sort={selectedSort}
              labels={sortLabels}
            />
          ) : null}

          <ActiveFilterChips
            basePath="/search-aupair"
            filters={filters}
            locale={locale}
            title={t("search.browseAuPairs")}
            resultSummary={t("search.profilesShown", {
              visible: visibleAuPairs.length,
              total: catalogTotalLabel,
            })}
          />

          {catalog.error ? (
            <div className="rounded-[1.5rem] bg-red-50 p-5 text-sm font-semibold text-red-700">
              {t("common.errorTryAgain")}
            </div>
          ) : isGuestPageBlocked ? (
            <GuestProfileAccessPrompt autoOpen returnTo={returnTo} />
          ) : visibleAuPairs.length > 0 ? (
            <div className="grid gap-3 lg:gap-4">
              {visibleAuPairs.map((profile, index) => {
                const profileStory = storyByProfileId.get(profile.id);

                return (
                  <ProfileSearchCard
                    key={profile.id}
                    profile={{ ...profile, account_type: "au_pair" }}
                    locale={locale}
                    isAuthenticated={Boolean(user)}
                    isSaved={favoriteProfileIds.has(profile.id)}
                    hasStory={profile.has_story === true}
                    hasVideo={profile.has_video === true}
                    storyHref={profileStory?.href ?? null}
                    storyId={profileStory?.id ?? null}
                    imagePriority={index === 0}
                    headingLevel={2}
                  />
                );
              })}

            </div>
          ) : (
            <div className="rounded-[1.5rem] bg-[#f8fbfc] p-8 text-center shadow-[0_10px_28px_rgba(38,63,69,0.05)] ring-1 ring-[#cddbe2]">
              <h2 className="text-2xl font-bold">{t("search.noMatchingAuPairs")}</h2>
              <p className="mt-2 text-sm font-semibold text-[#25302d]/70">
                {t("search.tryChangingFilters")}
              </p>
            </div>
          )}

          <ProfilePagination
            basePath="/search-aupair"
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

      {showCanonicalSeoContent ? (
        <section className="mx-auto w-full max-w-[88.5rem] px-4 pb-8 sm:px-8">
          <div className="rounded-[1.25rem] bg-white p-5 shadow-sm ring-1 ring-[#d8e0e6] sm:p-6">
            <h2 className="text-2xl font-black tracking-tight text-[#25302d]">
              {t("search.seoAuPairTitle")}
            </h2>
            <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-[#52636a]">
              {t("search.seoAuPairIntro")}
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {([
                ["search.seoCompareTitle", "search.seoCompareText"],
                ["search.seoContactTitle", "search.seoContactText"],
                ["search.seoSafetyTitle", "search.seoSafetyText"],
              ] as const).map(([titleKey, textKey]) => (
                <div
                  key={titleKey}
                  className="rounded-[1rem] bg-[#f4f8f8] p-4 ring-1 ring-[#dde7e8]"
                >
                  <h3 className="font-black text-[#25302d]">{t(titleKey)}</h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[#52636a]">
                    {t(textKey)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <LegalFooter />
    </main>
  );
}
