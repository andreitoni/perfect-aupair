import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { LegalFooter } from "@/components/layout/LegalFooter";
import {
  ProfileSearchCard,
  type SearchCardProfile,
} from "@/components/search/ProfileSearchCard";
import { ProfilePagination } from "@/components/search/ProfilePagination";
import { redirectAdminToDashboard } from "@/lib/admin/access";
import { getServerTranslator } from "@/lib/i18n/server";
import {
  getPrimaryProfilePhotoUrl,
  getProfilePhotoUrl,
} from "@/lib/profile/photos";
import { filterBlockedProfilesForViewer } from "@/lib/profile/blocks";
import { PROFILE_PAGE_SIZE } from "@/lib/profiles/pagination";
import { createClient } from "@/lib/supabase/server";

type NotificationKind = "views" | "saved";

type ViewerProfile = {
  account_type: "family" | "au_pair" | null;
  onboarding_completed: boolean | null;
};

type NotificationProfileRow = Omit<SearchCardProfile, "photoUrl"> & {
  notification_at: string | null;
  interaction_count: number | null;
  created_at?: string | null;
  primary_photo_path?: string | null;
};

function getCopyKeys(kind: NotificationKind) {
  return kind === "views"
    ? {
        title: "notifications.viewersTitle" as const,
        subtitle: "notifications.viewersSubtitle" as const,
        emptyTitle: "notifications.noViewersTitle" as const,
        emptyBody: "notifications.noViewersBody" as const,
      }
    : {
        title: "notifications.saversTitle" as const,
        subtitle: "notifications.saversSubtitle" as const,
        emptyTitle: "notifications.noSaversTitle" as const,
        emptyBody: "notifications.noSaversBody" as const,
      };
}

function getRpcName(kind: NotificationKind) {
  return kind === "views"
    ? "get_profile_viewer_cards"
    : "get_profile_saver_cards";
}

const MAX_PROFILE_VIEWERS = 100;

function parseViewerPage(value?: string) {
  const parsedPage = Number.parseInt(value ?? "1", 10);
  const maximumPage = Math.ceil(MAX_PROFILE_VIEWERS / PROFILE_PAGE_SIZE);

  if (!Number.isFinite(parsedPage) || parsedPage < 1) {
    return 1;
  }

  return Math.min(parsedPage, maximumPage);
}

export async function NotificationProfilesPage({
  kind,
  page,
}: {
  kind: NotificationKind;
  page?: string;
}) {
  const supabase = await createClient();
  const { locale, t } = await getServerTranslator();
  const copy = getCopyKeys(kind);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  redirectAdminToDashboard(user);

  const [{ data: viewerProfile }, viewerProfilePhotoUrl] = await Promise.all([
    supabase
      .from("profiles")
      .select("account_type, onboarding_completed")
      .eq("id", user.id)
      .maybeSingle<ViewerProfile>(),
    getPrimaryProfilePhotoUrl(supabase, user.id),
  ]);

  if (!viewerProfile) {
    redirect("/login");
  }

  if (!viewerProfile.onboarding_completed) {
    redirect("/onboarding");
  }

  const requestedPage = kind === "views" ? parseViewerPage(page) : 1;
  const requestedOffset = (requestedPage - 1) * PROFILE_PAGE_SIZE;
  const profileCardsQuery = supabase.rpc(
    getRpcName(kind),
    {},
    kind === "views" ? { count: "exact" } : undefined,
  );
  const { data, error, count } =
    kind === "views"
      ? await profileCardsQuery.range(
          requestedOffset,
          requestedOffset + PROFILE_PAGE_SIZE - 1,
        )
      : await profileCardsQuery;

  const totalItems =
    kind === "views" && typeof count === "number"
      ? Math.min(count, MAX_PROFILE_VIEWERS)
      : ((data ?? []) as NotificationProfileRow[]).length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PROFILE_PAGE_SIZE));

  if (!error && kind === "views" && requestedPage > totalPages) {
    redirect(
      totalPages > 1
        ? `/notifications/views?page=${totalPages}`
        : "/notifications/views",
    );
  }

  if (!error) {
    const { error: markReadError } = await supabase.rpc(
      "mark_profile_activity_notifications_read",
      { p_kind: kind },
    );

    if (markReadError) {
      console.warn(
        `Could not mark ${kind} notifications as read.`,
        markReadError,
      );
    }
  }

  const profileRows = await filterBlockedProfilesForViewer(
    supabase,
    user.id,
    ((data ?? []) as NotificationProfileRow[]).filter(
      (profile) =>
        profile.account_type === "family" || profile.account_type === "au_pair",
    ),
  );
  const profileIds = profileRows.map((profile) => profile.id);

  const [{ data: savedRows }, { data: videoRows }] =
    profileIds.length > 0
      ? await Promise.all([
          supabase
            .from("profile_favorites")
            .select("profile_id")
            .eq("user_id", user.id)
            .in("profile_id", profileIds),
          supabase
            .from("profile_videos")
            .select("profile_id")
            .in("profile_id", profileIds),
        ])
      : [{ data: [] }, { data: [] }];

  const savedProfileIds = new Set(
    ((savedRows ?? []) as Array<{ profile_id?: string | null }>)
      .map((row) => row.profile_id)
      .filter((profileId): profileId is string => Boolean(profileId)),
  );
  const videoProfileIds = new Set(
    ((videoRows ?? []) as Array<{ profile_id?: string | null }>)
      .map((row) => row.profile_id)
      .filter((profileId): profileId is string => Boolean(profileId)),
  );
  const browseHref =
    viewerProfile.account_type === "family" ? "/search-aupair" : "/search-family";

  const profiles = profileRows.map((profile) => ({
    ...profile,
    account_type: profile.account_type as "family" | "au_pair",
    photoUrl: getProfilePhotoUrl(supabase, profile.primary_photo_path),
  }));

  return (
    <main className="min-h-screen bg-[var(--background)] text-[#25302d]">
      <Header
        subtitle="nav.notifications"
        authState="authenticated"
        accountType={viewerProfile.account_type}
        initialProfilePhotoUrl={viewerProfilePhotoUrl}
      />

      <section className="mx-auto w-full max-w-[68rem] px-4 py-4 sm:px-6 sm:py-7">
        <div className="mb-4 rounded-[1.15rem] bg-white px-4 py-4 shadow-[0_10px_28px_rgba(38,63,69,0.06)] ring-1 ring-[#d6dee4] sm:px-5 sm:py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-normal sm:text-3xl">
                {t(copy.title)}
              </h1>
              <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-[#25302d]/58">
                {t(copy.subtitle)}
              </p>
            </div>

            <Link
              href={browseHref}
              prefetch={false}
              className="inline-flex h-10 w-fit items-center justify-center rounded-full bg-[var(--pa-header-button-bg)] px-4 text-sm font-black text-[var(--pa-header-button-text)] shadow-sm ring-1 ring-[#c7d1d6]/70 transition hover:bg-[var(--pa-header-button-hover)]"
            >
              {t("nav.findProfiles")}
            </Link>
          </div>
        </div>

        {error ? (
          <div className="rounded-[1.25rem] bg-red-50 p-5 text-sm font-semibold text-red-700">
            {t("notifications.loadFailed")}
          </div>
        ) : profiles.length > 0 ? (
          <>
            <ul className="grid gap-4">
              {profiles.map((profile) => (
                <li key={profile.id}>
                  <ProfileSearchCard
                    profile={profile}
                    locale={locale}
                    isAuthenticated
                    isSaved={savedProfileIds.has(profile.id)}
                    hasVideo={videoProfileIds.has(profile.id)}
                  />
                </li>
              ))}
            </ul>

            {kind === "views" ? (
              <ProfilePagination
                basePath="/notifications/views"
                currentPage={requestedPage}
                totalPages={totalPages}
                searchParams={{ page }}
                labels={{
                  previous: t("pagination.previous"),
                  next: t("pagination.next"),
                  page: t("pagination.page"),
                  currentPage: t("pagination.currentPage"),
                  pageOf: t("pagination.pageOf"),
                }}
              />
            ) : null}
          </>
        ) : (
          <div className="rounded-[1.5rem] bg-white p-8 text-center shadow-sm ring-1 ring-[#d6dee4]">
            <h2 className="text-xl font-black tracking-normal">
              {t(copy.emptyTitle)}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-[#25302d]/58">
              {t(copy.emptyBody)}
            </p>
            <Link
              href={browseHref}
              prefetch={false}
              className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-[var(--pa-primary)] px-5 text-sm font-black text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)]"
            >
              {t("nav.findProfiles")}
            </Link>
          </div>
        )}
      </section>

      <LegalFooter />
    </main>
  );
}
