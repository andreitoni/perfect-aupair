import { Header } from "@/components/layout/Header";
import {
  LandingSearchFilterButton,
  LandingSearchFilters,
} from "@/components/home/LandingSearchFilters";
import { LegalFooter } from "@/components/layout/LegalFooter";
import { GuestProfileAccessPrompt } from "@/components/search/GuestProfileAccessPrompt";
import { ProfilePagination } from "@/components/search/ProfilePagination";
import { ProfileSearchCard } from "@/components/search/ProfileSearchCard";
import { ProfileVerificationBadge } from "@/components/profile/ProfileVerificationBadge";
import { StoriesRail } from "@/components/search/StoriesRail";
import { getProfilePhotoUrl } from "@/lib/profile/photos";
import {
  createClosedPublicCatalogResult,
  loadBoundedPublicProfileCards,
  loadBoundedPublicStoryCards,
  reservePublicCatalogRequest,
} from "@/lib/profile/public-catalog";
import { groupLatestStoryByProfile } from "@/lib/stories/group-story-cards";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseSessionCookie } from "@/lib/supabase/has-session-cookie";
import { redirect } from "next/navigation";
import { getServerTranslator } from "@/lib/i18n/server";
import {
  createTranslator,
  formatFamilyStoryDisplayName,
  getDictionary,
} from "@/lib/i18n/translations";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import type { LanguageCode } from "@/lib/i18n/config";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { isLikelyDesktopRequest } from "@/lib/browser/request-viewport";

const HOME_DESCRIPTION =
  "Perfect AuPair helps au pairs and host families find each other in Germany, the UK, the US, and worldwide. Browse profiles and start matching today.";
const LANDING_PROFILE_PAGE_SIZE = 8;
const LANDING_CATALOG_FETCH_SIZE = LANDING_PROFILE_PAGE_SIZE * 2;
const LANDING_GUEST_PAGE_LIMIT = 2;
const LANDING_PROFILE_MIX: SearchProfile["account_type"][] = [
  "au_pair",
  "family",
  "au_pair",
  "family",
  "au_pair",
  "family",
  "au_pair",
  "au_pair",
];

type SearchProfile = {
  id: string;
  public_slug?: string | null;
  created_at?: string | null;
  account_type: "au_pair" | "family";
  full_name: string | null;
  first_name?: string | null;
  country: string | null;
  city: string | null;
  nationality?: string | null;
  preferred_host_countries?: string[] | null;
  mother_tongue?: string | null;
  fluent_languages?: string[] | null;
  basic_languages?: string[] | null;
  age?: number | null;
  smoking_status?: string | null;
  gender?: string | null;
  religion?: string | null;
  already_in_germany?: boolean | null;
  childcare_experience?: string | null;
  has_drivers_license?: boolean | null;
  has_childcare_experience?: boolean | null;
  has_infant_experience?: boolean | null;
  has_first_aid?: boolean | null;
  will_care_for_elderly?: boolean | null;
  will_care_for_pets?: boolean | null;
  children_info?: string | null;
  au_pair_allowance_amount?: number | null;
  au_pair_allowance_currency?: string | null;
  availability_start?: string | null;
  availability_start_from?: string | null;
  availability_start_to?: string | null;
  duration?: string | null;
  duration_min_months?: number | null;
  duration_max_months?: number | null;
  bio?: string | null;
  expectations?: string | null;
  primary_photo_path?: string | null;
  photo_count?: number | null;
  activity_status?: string | null;
  verification_status?: string | null;
  has_story?: boolean | null;
  has_video?: boolean | null;
};

type ActiveStory = {
  id: string;
  profile_id?: string | null;
  full_name: string | null;
  account_type: "family" | "au_pair";
  city: string | null;
  country: string | null;
  primary_photo_path?: string | null;
  storage_path?: string | null;
  created_at?: string | null;
};

const loadCachedLandingContent = unstable_cache(
  async () => {
    const [auPairCatalog, familyCatalog, auPairStories, familyStories] =
      await Promise.all([
        loadBoundedPublicProfileCards<SearchProfile>({
          accountType: "au_pair",
          pageSize: LANDING_CATALOG_FETCH_SIZE,
        }),
        loadBoundedPublicProfileCards<SearchProfile>({
          accountType: "family",
          pageSize: LANDING_CATALOG_FETCH_SIZE,
        }),
        loadBoundedPublicStoryCards<ActiveStory>("au_pair", null),
        loadBoundedPublicStoryCards<ActiveStory>("family", null),
      ]);

    if (auPairCatalog.error || familyCatalog.error) {
      throw new Error("Landing catalog unavailable");
    }

    return {
      auPairCatalog,
      familyCatalog,
      auPairStories: auPairStories.data,
      familyStories: familyStories.data,
    };
  },
  ["public-landing-content-v2"],
  { revalidate: 60 },
);

function asArray<T>(value: T[] | null | undefined) {
  return Array.isArray(value) ? value : [];
}

function normalizeLandingPage(value?: string | string[] | null) {
  const scalarValue = Array.isArray(value) ? value[0] : value;
  const parsedPage = Number.parseInt(scalarValue ?? "1", 10);

  return Number.isFinite(parsedPage) && parsedPage > 0
    ? Math.min(100, parsedPage)
    : 1;
}

function mixLandingProfiles(
  auPairs: SearchProfile[],
  families: SearchProfile[],
) {
  const profilesByType = {
    au_pair: auPairs,
    family: families,
  };
  const offsets = { au_pair: 0, family: 0 };
  const mixedProfiles: SearchProfile[] = [];

  while (
    offsets.au_pair < auPairs.length ||
    offsets.family < families.length
  ) {
    for (const preferredType of LANDING_PROFILE_MIX) {
      const fallbackType = preferredType === "au_pair" ? "family" : "au_pair";
      const selectedType =
        offsets[preferredType] < profilesByType[preferredType].length
          ? preferredType
          : fallbackType;
      const profile = profilesByType[selectedType][offsets[selectedType]];

      if (profile) {
        mixedProfiles.push(profile);
        offsets[selectedType] += 1;
      }

      if (
        offsets.au_pair >= auPairs.length &&
        offsets.family >= families.length
      ) {
        return mixedProfiles;
      }
    }
  }

  return mixedProfiles;
}

function selectLandingStories(
  auPairStories: ActiveStory[],
  familyStories: ActiveStory[],
  limit = 8,
) {
  const auPairTarget = Math.ceil(limit * 0.6);
  const familyTarget = limit - auPairTarget;
  const selected = [
    ...auPairStories.slice(0, auPairTarget),
    ...familyStories.slice(0, familyTarget),
  ];

  if (selected.length < limit) {
    const selectedIds = new Set(selected.map((story) => story.id));
    selected.push(
      ...[...auPairStories, ...familyStories]
        .filter((story) => !selectedIds.has(story.id))
        .slice(0, limit - selected.length),
    );
  }

  return selected
    .sort(
      (firstStory, secondStory) =>
        new Date(secondStory.created_at ?? 0).getTime() -
        new Date(firstStory.created_at ?? 0).getTime(),
    )
    .slice(0, limit);
}

function SafetyTrustIcon() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-[#31a36d]"
    >
      <svg viewBox="0 0 32 28" className="h-full w-full">
        <path
          d="M16 2.3 26 6.1v7.1c0 5.7-3.7 10.4-10 12.5C9.7 23.6 6 18.9 6 13.2V6.1l10-3.8Z"
          fill="currentColor"
        />
        <path
          d="m11.3 14.1 3 3 6.4-6.6"
          fill="none"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.8"
        />
      </svg>
    </span>
  );
}

function CountryGuidanceIcon() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-[1.35rem] leading-none"
    >
      🌎
    </span>
  );
}

export async function PublicLandingPage({
  searchParams,
  localeOverride,
  basePath = "/",
}: {
  searchParams: Promise<{ page?: string | string[] }>;
  localeOverride?: LanguageCode;
  basePath?: "/" | "/de";
}) {
  const translator = localeOverride
    ? {
        locale: localeOverride,
        t: createTranslator(localeOverride),
      }
    : await getServerTranslator();
  const [
    supabase,
    { locale, t },
    resolvedSearchParams,
    hasSessionCookie,
    requestHeaders,
  ] = await Promise.all([
    createClient(),
    Promise.resolve(translator),
    searchParams,
    hasSupabaseSessionCookie(),
    headers(),
  ]);
  const requestedPage = normalizeLandingPage(resolvedSearchParams.page);
  const initialDesktopViewport = isLikelyDesktopRequest(requestHeaders);
  const websiteStructuredData = {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    alternateName: ["PerfectAuPair", "Perfect Au Pair"],
    url: `${SITE_URL}/`,
    description: HOME_DESCRIPTION,
    inLanguage: ["en", "de"],
    publisher: {
      "@id": `${SITE_URL}/#organization`,
    },
  };
  const landingPageUrl = localeOverride
    ? `${SITE_URL}${basePath}`
    : `${SITE_URL}/`;
  const webPageStructuredData = {
    "@type": "WebPage",
    "@id": `${landingPageUrl}#webpage`,
    url: landingPageUrl,
    name:
      localeOverride === "de"
        ? "Perfect AuPair | Au-pairs und Gastfamilien finden"
        : "Perfect AuPair | Find Au Pairs and Host Families",
    description:
      localeOverride === "de"
        ? "Perfect AuPair verbindet Au-pairs und Gastfamilien in Deutschland und weltweit."
        : HOME_DESCRIPTION,
    inLanguage: localeOverride === "de" ? "de" : "en",
    isPartOf: {
      "@id": `${SITE_URL}/#website`,
    },
    about: {
      "@id": `${SITE_URL}/#organization`,
    },
  };

  const user = hasSessionCookie
    ? (await supabase.auth.getUser()).data.user
    : null;

  if (user) {
    redirect("/auth/home");
  }

  const catalogBudget = await reservePublicCatalogRequest("landing");
  const closedCatalog = createClosedPublicCatalogResult<SearchProfile>({
    message: catalogBudget.unavailable
      ? "Catalog rate limiter unavailable"
      : "Catalog request limit exceeded",
    pageSize: LANDING_CATALOG_FETCH_SIZE,
  });

  let auPairCatalog = closedCatalog;
  let familyCatalog = createClosedPublicCatalogResult<SearchProfile>({
    message: closedCatalog.error?.message ?? "Catalog unavailable",
    pageSize: LANDING_CATALOG_FETCH_SIZE,
  });
  let auPairStories: ActiveStory[] | null = null;
  let familyStories: ActiveStory[] | null = null;

  // If the DB limiter itself times out, a warm public cache can still serve
  // the guest landing page without opening the catalog to fresh DB traffic.
  if (catalogBudget.allowed || catalogBudget.unavailable) {
    try {
      const landingContent = await loadCachedLandingContent();
      auPairCatalog = landingContent.auPairCatalog;
      familyCatalog = landingContent.familyCatalog;
      auPairStories = landingContent.auPairStories;
      familyStories = landingContent.familyStories;
    } catch {
      // Keep the page shell usable. A failed load is never cached.
    }
  }

  const catalogUnavailable = Boolean(
    auPairCatalog.error || familyCatalog.error,
  );
  const totalPages = Math.max(
    1,
    Math.ceil(
      (auPairCatalog.totalItems + familyCatalog.totalItems) /
        LANDING_PROFILE_PAGE_SIZE,
    ),
  );
  const currentPage = Math.min(requestedPage, totalPages);
  const isGuestPageBlocked = requestedPage > LANDING_GUEST_PAGE_LIMIT;
  const pageStart = (requestedPage - 1) * LANDING_PROFILE_PAGE_SIZE;
  const featuredProfiles = mixLandingProfiles(
    auPairCatalog.data,
    familyCatalog.data,
  ).slice(pageStart, pageStart + LANDING_PROFILE_PAGE_SIZE);

  const groupedAuPairStories = groupLatestStoryByProfile(
    asArray(auPairStories as ActiveStory[] | null),
  );
  const groupedFamilyStories = groupLatestStoryByProfile(
    asArray(familyStories as ActiveStory[] | null),
  );
  const recentStories = selectLandingStories(
    groupedAuPairStories,
    groupedFamilyStories,
  );
  const storyByProfileId = new Map(
    [...groupedAuPairStories, ...groupedFamilyStories].flatMap((story) =>
      story.profile_id
        ? ([
            [
              story.profile_id,
              { id: story.id, href: "/login" },
            ] as const,
          ])
        : [],
    ),
  );
  const recentStoryItems = recentStories.map((story) => ({
    id: story.id,
    name:
      story.account_type === "family"
        ? formatFamilyStoryDisplayName(story.full_name, locale) ??
          t("common.profile")
        : story.full_name ?? t("common.profile"),
    // The landing page is guest-only. Show the public profile photo as the
    // avatar without delivering the locked story asset.
    imageUrl: getProfilePhotoUrl(
      supabase,
      story.primary_photo_path ?? null,
    ),
    href: "/login",
    locked: true,
  }));
  const content = (
    <main className="min-h-screen bg-[var(--background)] text-[#25302d]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [websiteStructuredData, webPageStructuredData],
          }),
        }}
      />
      <Header
        subtitle="app.subtitle"
        authState="public"
        showLanguageMenu={!localeOverride}
      />

      <section className="pa-profile-feed-layout pa-profile-feed-layout--search">
        <StoriesRail
          stories={recentStoryItems}
          variant="responsive"
          className="order-1 min-w-0 max-w-full lg:order-3"
        />

        <LandingSearchFilters
          countries={{
            au_pair: auPairCatalog.countries,
            family: familyCatalog.countries,
          }}
          initialDesktopViewport={initialDesktopViewport}
          initialResultCounts={{
            au_pair: auPairCatalog.totalItems,
            family: familyCatalog.totalItems,
          }}
          initialResultCountsCapped={{
            au_pair: auPairCatalog.totalIsCapped,
            family: familyCatalog.totalIsCapped,
          }}
          className="absolute h-0 overflow-visible lg:order-1 lg:h-fit"
          idPrefixBase="landing-sidebar"
          showMobileTrigger={false}
        />

        <div
          id="profiles"
          className="order-3 min-w-0 lg:order-2"
        >
          <div className="mb-3 rounded-[1.25rem] bg-white px-4 py-3 shadow-sm ring-1 ring-[#d8e0e6] sm:mb-5 sm:px-5 sm:py-4">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <p className="min-w-0 truncate text-[0.7rem] font-black uppercase tracking-[0.18em] text-[#52636a]">
                {t("landing.featuredProfiles")}
              </p>

              <LandingSearchFilterButton className="shrink-0 lg:hidden" />
            </div>

            <h1 className="mt-1 text-[1.45rem] font-black leading-[1.08] tracking-normal sm:text-3xl">
              {t("landing.featuredTitle")}
            </h1>
          </div>

          {localeOverride === "de" ? (
            <section
              aria-labelledby="german-cost-calculator-promo"
              className="mb-3 overflow-hidden rounded-[1.25rem] bg-[#25302d] px-5 py-5 text-white shadow-sm sm:mb-5 sm:px-6"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#bed8d1]">
                Kostenloses Planungstool
              </p>
              <h2
                id="german-cost-calculator-promo"
                className="mt-1 text-xl font-black sm:text-2xl"
              >
                Was kostet ein Au-pair in Deutschland?
              </h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[#e4eeeb]">
                Taschengeld, Sprachkurs, Versicherung, Fahrtkosten und
                Verpflegung individuell eintragen – die monatlichen und
                gesamten Kosten werden sofort berechnet.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/de/au-pair-kosten-deutschland"
                  className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-[#25302d] transition hover:bg-[#eef5f3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bed8d1]"
                >
                  Kosten kostenlos berechnen
                </Link>
                <Link
                  href="/de/au-pair-voraussetzungen-deutschland"
                  className="rounded-full px-5 py-2.5 text-sm font-black text-white ring-1 ring-[#76928a] transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bed8d1]"
                >
                  Voraussetzungen prüfen
                </Link>
              </div>
            </section>
          ) : null}

          {catalogUnavailable ? (
            <div className="rounded-[1.5rem] bg-red-50 p-5 text-sm font-semibold text-red-700 ring-1 ring-red-100">
              {t("common.errorTryAgain")}
            </div>
          ) : isGuestPageBlocked ? (
            <GuestProfileAccessPrompt autoOpen />
          ) : featuredProfiles.length > 0 ? (
            <div className="grid gap-3 lg:gap-4">
              {featuredProfiles.map((profile, index) => {
                const photoUrl = getProfilePhotoUrl(
                  supabase,
                  profile.primary_photo_path ?? null,
                );
                const profileStory = storyByProfileId.get(profile.id);

                return (
                  <ProfileSearchCard
                    key={`${profile.account_type}-${profile.id}`}
                    profile={{ ...profile, photoUrl }}
                    locale={locale}
                    isAuthenticated={false}
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
            <div className="rounded-[1.5rem] bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
              <h2 className="text-xl font-black">
                {t("landing.noProfilesTitle")}
              </h2>
              <p className="mt-2 text-sm font-bold text-[#25302d]/70">
                {t("landing.noProfilesText")}
              </p>
            </div>
          )}

          <ProfilePagination
            basePath={basePath}
            currentPage={currentPage}
            totalPages={totalPages}
            searchParams={{ page: String(requestedPage) }}
            lockPagesAfterFirst
            freePageCount={LANDING_GUEST_PAGE_LIMIT}
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

      <section className="mx-auto hidden w-full max-w-[96rem] px-2 pb-6 sm:px-8 lg:block lg:max-w-[88.5rem] lg:px-8">
        <div className="grid grid-cols-3 overflow-hidden rounded-[1.25rem] border border-[#d8e0e6] bg-white shadow-[0_1px_3px_rgba(37,48,45,0.08)]">
          {[
            {
              title: t("landing.trustVerifiedTitle"),
              text: t("landing.trustVerifiedText"),
              icon: "verified",
              href: "/about",
            },
            {
              title: t("landing.trustSafetyTitle"),
              text: t("landing.trustSafetyText"),
              icon: "safety",
              href: "/safety",
            },
            {
              title: t("landing.trustGuidesTitle"),
              text: t("landing.trustGuidesText"),
              icon: "guidance",
              href: localeOverride === "de" ? "/de/ratgeber" : "/guides",
            },
          ].map((item, index) => (
            <div
              key={item.title}
              className={[
                "flex min-w-0 flex-col items-center gap-1.5 px-1.5 py-3 text-center sm:flex-row sm:items-start sm:gap-3 sm:px-4 sm:text-left",
                index > 0 ? "border-l border-[#d6dee4]" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef4f6] sm:mt-0.5">
                {item.icon === "verified" ? (
                  <ProfileVerificationBadge
                    status="verified"
                    label={t("verification.verified")}
                    compact
                    className="h-6 w-6"
                  />
                ) : null}
                {item.icon === "safety" ? <SafetyTrustIcon /> : null}
                {item.icon === "guidance" ? <CountryGuidanceIcon /> : null}
              </span>

              {item.href ? (
                <Link
                  href={item.href}
                  className="min-w-0 rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#6f929f]"
                >
                  <h2 className="text-[0.7rem] font-black leading-4 text-[#25302d] sm:text-sm sm:leading-5">
                    {item.title}
                  </h2>
                  <p className="mt-0.5 hidden line-clamp-2 text-xs font-bold leading-5 text-[#25302d]/70 sm:block">
                    {item.text}
                  </p>
                </Link>
              ) : (
                <div className="min-w-0">
                  <h2 className="text-[0.7rem] font-black leading-4 text-[#25302d] sm:text-sm sm:leading-5">
                    {item.title}
                  </h2>
                  <p className="mt-0.5 hidden line-clamp-2 text-xs font-bold leading-5 text-[#25302d]/70 sm:block">
                    {item.text}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <LegalFooter />
    </main>
  );

  return (
    <I18nProvider
      initialLocale={locale}
      dictionary={getDictionary(locale)}
      preferInitialLocale={Boolean(localeOverride)}
    >
      {content}
    </I18nProvider>
  );
}
