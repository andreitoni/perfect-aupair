import { Header } from "@/components/layout/Header";
import { LegalFooter } from "@/components/layout/LegalFooter";
import Link from "next/link";
import { redirectAdminToDashboard } from "@/lib/admin/access";
import { ProfileSearchCard } from "@/components/search/ProfileSearchCard";
import { ProfilePagination } from "@/components/search/ProfilePagination";
import { getServerTranslator } from "@/lib/i18n/server";
import {
  getPrimaryProfilePhotoUrl,
  getProfilePhotoUrl,
} from "@/lib/profile/photos";
import { PROFILE_PAGE_SIZE } from "@/lib/profiles/pagination";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Saved Profiles",
  description: "View your saved Perfect AuPair profiles.",
  robots: { index: false, follow: false },
};

type Favorite = {
  id: string;
  public_slug?: string | null;
  profile_id: string;
  created_at: string;
};

type PublicProfile = {
  id: string;
  public_slug?: string | null;
  account_type: "family" | "au_pair";
  full_name: string | null;
  country: string | null;
  city: string | null;
  nationality: string | null;
  preferred_host_countries: string[] | null;
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
  will_care_for_elderly: boolean | null;
  will_care_for_pets: boolean | null;
  age: number | null;
  bio: string | null;
  children_info: string | null;
  au_pair_allowance_amount: number | null;
  au_pair_allowance_currency: string | null;
  accommodation_info: string | null;
  expectations: string | null;
  mother_tongue: string | null;
  primary_photo_path: string | null;
  photo_count: number | null;
  activity_status: string | null;
  verification_status?: string | null;
};

type SavedPublicProfile = {
  favorite: Favorite;
  profile: PublicProfile;
};

type SavedPublicProfilesPage = {
  items?: SavedPublicProfile[];
  total?: number;
  offset?: number;
};

const MAX_SAVED_PROFILES = 500;

function parseSavedProfilesPage(value?: string) {
  const parsedPage = Number.parseInt(value ?? "1", 10);
  const maximumPage = Math.ceil(MAX_SAVED_PROFILES / PROFILE_PAGE_SIZE);

  if (!Number.isFinite(parsedPage) || parsedPage < 1) {
    return 1;
  }

  return Math.min(parsedPage, maximumPage);
}

export default async function SavedProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
  }>;
}) {
  const filters = await searchParams;
  const { locale, t } = await getServerTranslator();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  redirectAdminToDashboard(user);

  const [{ data: profile }, viewerProfilePhotoUrl] = await Promise.all([
    supabase
      .from("profiles")
      .select("account_type, onboarding_completed")
      .eq("id", user.id)
      .single(),
    getPrimaryProfilePhotoUrl(supabase, user.id),
  ]);

  if (!profile) {
    redirect("/login");
  }

  if (!profile.onboarding_completed) {
    redirect("/onboarding");
  }

  const requestedPage = parseSavedProfilesPage(filters.page);
  const requestedOffset = (requestedPage - 1) * PROFILE_PAGE_SIZE;
  const { data: savedProfiles, error } = await supabase.rpc(
    "get_saved_public_profiles",
    {
      p_limit: PROFILE_PAGE_SIZE,
      p_offset: requestedOffset,
    },
  );
  const savedPage =
    savedProfiles &&
    typeof savedProfiles === "object" &&
    !Array.isArray(savedProfiles)
      ? (savedProfiles as SavedPublicProfilesPage)
      : null;
  const savedRows = Array.isArray(savedPage?.items) ? savedPage.items : [];
  const totalItems =
    typeof savedPage?.total === "number" &&
    Number.isInteger(savedPage.total) &&
    savedPage.total >= 0
      ? Math.min(savedPage.total, MAX_SAVED_PROFILES)
      : savedRows.length;
  const responseOffset =
    typeof savedPage?.offset === "number" &&
    Number.isInteger(savedPage.offset) &&
    savedPage.offset >= 0
      ? Math.min(savedPage.offset, MAX_SAVED_PROFILES)
      : requestedOffset;
  const totalPages = Math.max(
    1,
    Math.ceil(totalItems / PROFILE_PAGE_SIZE),
  );
  const paginatedFavorites = {
    currentPage: Math.min(
      Math.floor(responseOffset / PROFILE_PAGE_SIZE) + 1,
      totalPages,
    ),
    totalPages,
    totalItems,
    items: savedRows,
  };
  const validSavedItems = paginatedFavorites.items.map((item) => ({
    ...item,
    photoUrl: getProfilePhotoUrl(
      supabase,
      item.profile.primary_photo_path,
    ),
  }));

  if (error) {
    console.error("Could not load saved profiles.", error);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[#25302d]">
      <Header
        subtitle="saved.title"
        authState="authenticated"
        accountType={profile.account_type}
        initialProfilePhotoUrl={viewerProfilePhotoUrl}
      />

      <section className="mx-auto w-full max-w-[58rem] flex-1 px-4 py-3 sm:px-8 sm:py-6">
        <div className="mb-3 w-full rounded-[1.15rem] bg-[#fbfcfd] px-4 py-3 shadow-[0_10px_28px_rgba(38,63,69,0.06)] ring-1 ring-[#d6dee4] sm:mb-4 sm:px-5 sm:py-4">
          <h1 className="truncate text-2xl font-black leading-tight tracking-normal sm:text-3xl">
            {t("saved.title")}
          </h1>

          <p className="mt-1 truncate text-sm font-semibold leading-tight text-[#25302d]/70">
            {t("saved.description")}
          </p>
        </div>

        {error ? (
          <div className="rounded-[1.5rem] bg-red-50 p-5 text-sm font-semibold text-red-700">
            {t("common.errorTryAgain")}
          </div>
        ) : (
          <>
            {validSavedItems.length > 0 ? (
              <>
                {paginatedFavorites.totalPages > 1 ? (
                  <p className="mb-3 px-1 text-sm font-black text-[#25302d]/70">
                    {t("search.profilesShown", {
                      visible: validSavedItems.length,
                      total: paginatedFavorites.totalItems,
                    })}
                  </p>
                ) : null}

                <div className="grid w-full items-start gap-3 lg:gap-4">
                  {validSavedItems.map((item) => (
                    <ProfileSearchCard
                      key={item.favorite.id}
                      profile={{ ...item.profile, photoUrl: item.photoUrl }}
                      locale={locale}
                      isAuthenticated={true}
                      isSaved={true}
                    />
                  ))}
                </div>

                <ProfilePagination
                  basePath="/saved"
                  currentPage={paginatedFavorites.currentPage}
                  totalPages={paginatedFavorites.totalPages}
                  searchParams={filters}
                  labels={{
                    previous: t("pagination.previous"),
                    next: t("pagination.next"),
                    page: t("pagination.page"),
                    currentPage: t("pagination.currentPage"),
                    pageOf: t("pagination.pageOf"),
                  }}
                />
              </>
            ) : (
              <div className="flex min-h-[240px] w-full flex-col items-center justify-center rounded-[1.15rem] bg-[#fbfcfd] p-6 text-center shadow-[0_10px_28px_rgba(38,63,69,0.06)] ring-1 ring-[#d6dee4] sm:p-8">
                <h2 className="text-xl font-black">{t("saved.noneTitle")}</h2>

                <p className="mt-2 text-sm font-semibold text-[#25302d]/55">
                  {t("saved.noneText")}
                </p>

                <Link
                  href={
                    profile.account_type === "family"
                      ? "/search-aupair"
                      : "/search-family"
                  }
                  prefetch={false}
                  className="mt-5 inline-flex rounded-full bg-[var(--pa-primary)] px-5 py-3 text-sm font-bold text-[var(--pa-primary-ink)]"
                >
                  {t("messages.browseProfiles")}
                </Link>
              </div>
            )}
          </>
        )}
      </section>

      <LegalFooter />
    </main>
  );
}
