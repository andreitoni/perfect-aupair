import { AdminLink as Link } from "@/components/admin/AdminLink";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { AdminActionSubmit } from "@/components/admin/AdminActionSubmit";
import {
  AdminProfileEditor,
  type AdminEditableProfile,
} from "@/components/admin/AdminProfileEditor";
import { AdminProfilePhotoUploader } from "@/components/admin/AdminProfilePhotoUploader";
import {
  AdminWorkspace,
  adminAreaHref,
  type AdminArea,
} from "@/components/admin/AdminWorkspace";
import { PasswordField } from "@/components/auth/PasswordField";
import { ProfilePhotoLightbox } from "@/components/profile/ProfilePhotoLightbox";
import {
  deleteProfile,
  deleteProfilePhoto,
  deleteProfileVideo,
  resetProfilePassword,
  sendReportActionTakenNotification,
  suspendProfile,
  setAdminPrimaryProfilePhoto,
  unsuspendProfile,
  updateProfileContentModerationStatus,
  updateProfileVideoModerationStatus,
  updateVerificationRequestStatus,
} from "@/app/admin/actions";
import {
  getProfilePhotoPublicUrl,
  getSignedProfileVideoUrl,
  getSignedVerificationSelfieUrl,
  getSignedStoryPhotoUrl,
} from "@/lib/images/storage";
import { isAdminEmail, requireAdminUser } from "@/lib/admin/access";
import { getProfileContentVersion } from "@/lib/moderation/profile-content-version";
import {
  MODERATION_RULES,
  SUSPENSION_DURATIONS,
} from "@/lib/moderation/rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatAdminDate } from "@/lib/admin/date-format";
import {
  adminBackHref,
  safeAdminReturnTo,
  withAdminNavigationContext,
  withAdminReturnTo,
} from "@/lib/admin/navigation";
import { buildStoryHref } from "@/lib/stories/story-links";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type AdminProfile = {
  id: string;
  email: string | null;
  account_type: "family" | "au_pair";
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  birth_date: string | null;
  gender: string | null;
  phone_country_code: string | null;
  phone_number: string | null;
  street_address: string | null;
  city: string | null;
  country: string | null;
  nationality: string | null;
  preferred_host_countries: string[] | null;
  religion: string | null;
  smoking_status: string | null;
  already_in_germany: boolean | null;
  has_drivers_license: boolean | null;
  has_childcare_experience: boolean | null;
  has_infant_experience: boolean | null;
  has_first_aid: boolean | null;
  will_care_for_elderly: boolean | null;
  will_care_for_pets: boolean | null;
  mother_tongue: string | null;
  fluent_languages: string[] | null;
  basic_languages: string[] | null;
  availability_start: string | null;
  duration: string | null;
  children_info: string | null;
  au_pair_allowance_amount: number | null;
  au_pair_allowance_currency: string | null;
  accommodation_info: string | null;
  expectations: string | null;
  bio: string | null;
  childcare_experience: string | null;
  public_slug: string | null;
  onboarding_completed: boolean;
  suspended_at: string | null;
  suspended_until: string | null;
  suspended_reason: string | null;
  deletion_requested_at: string | null;
  content_moderation_status: "pending" | "approved" | "rejected";
  content_moderation_needs_review: boolean;
  content_moderation_reviewed_at: string | null;
  content_moderation_reason: string | null;
  created_at: string;
  is_admin: boolean | null;
  verification_status: string | null;
  verification_reviewed_at: string | null;
  verification_rejected_reason: string | null;
};

type PhotoRow = {
  id: string;
  storage_path: string;
  is_primary: boolean;
  sort_order: number;
};

type StoryRow = {
  id: string;
  storage_path: string;
  created_at: string;
  expires_at: string;
  content_moderation_status: "pending" | "approved" | "rejected";
  content_moderation_reason: string | null;
};

type ProfileVideoRow = {
  id: string;
  storage_path: string;
  mime_type: string;
  created_at: string;
  content_moderation_status: "pending" | "approved" | "rejected";
  content_moderation_reason: string | null;
};

type ConversationRow = {
  id: string;
  family_id: string;
  au_pair_id: string;
  created_at: string;
  last_message_at: string | null;
};

type ConversationParticipantRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type AccountLoginRow = {
  id: string;
  ip_address: string;
  auth_method: "password" | "google" | "facebook";
  logged_in_at: string;
  login_count: number;
};

type VerificationRequestRow = {
  id: string;
  selfie_path: string;
  status: "pending" | "verified" | "rejected";
  reviewer_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

type VerificationRequestWithUrl = VerificationRequestRow & {
  selfie_url: string | null;
};

type ProfileChangeEventRow = {
  id: string;
  actor_kind: "user" | "service" | "system";
  category:
    | "identity_name"
    | "phone"
    | "location"
    | "search"
    | "text"
    | "verification_sensitive";
  caused_verification_reset: boolean;
  created_at: string;
};

type VerificationPhotoSnapshotRow = {
  id: string;
  verification_request_id: string | null;
  profile_photo_id: string;
  storage_path: string;
  was_primary: boolean;
  captured_at: string;
};

type AdminProfileSection = "profile" | "media" | "verification" | "activity";
type AdminDashboardView = AdminArea;

const PROFILE_SECTIONS: Array<{
  id: AdminProfileSection;
  label: string;
  shortLabel: string;
}> = [
  { id: "profile", label: "Profile", shortLabel: "Profile" },
  { id: "media", label: "Photos, video & stories", shortLabel: "Media" },
  { id: "verification", label: "Verification", shortLabel: "Verify" },
  { id: "activity", label: "Activity", shortLabel: "Activity" },
];

const ADMIN_DASHBOARD_VIEW_ALIASES = new Map<string, AdminDashboardView>([
  ["overview", "overview"],
  ["review", "review"],
  ["members", "members"],
  ["conversations", "conversations"],
  ["system", "system"],
  ["reports", "review"],
  ["controls", "system"],
  ["activity", "system"],
  ["profiles", "members"],
  ["media", "review"],
]);

function firstSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function sanitizeProfileSection(value?: string | string[]): AdminProfileSection {
  const candidate = firstSearchParam(value);

  return PROFILE_SECTIONS.some((section) => section.id === candidate)
    ? (candidate as AdminProfileSection)
    : "profile";
}

function sanitizeDashboardView(value?: string | string[]): AdminDashboardView {
  const candidate = firstSearchParam(value);

  return (candidate && ADMIN_DASHBOARD_VIEW_ALIASES.get(candidate)) || "members";
}

function sectionHref(
  profileId: string,
  section: AdminProfileSection,
  dashboardView: AdminDashboardView,
  returnTo?: string,
  trail?: string | string[],
) {
  const query = new URLSearchParams({ section, view: dashboardView });

  return withAdminNavigationContext(
    `/admin/profiles/${profileId}?${query.toString()}`,
    returnTo,
    trail,
  );
}

const formatDate = formatAdminDate;

function profileLabel(profile: AdminProfile) {
  return profile.full_name || profile.email || profile.id;
}

function yesNo(value?: boolean | null) {
  if (value === null || value === undefined) return null;

  return value ? "Yes" : "No";
}

function allowanceLabel(profile: AdminProfile) {
  if (!profile.au_pair_allowance_amount) return null;

  return [
    profile.au_pair_allowance_amount.toLocaleString("en"),
    profile.au_pair_allowance_currency,
    "per month",
  ]
    .filter(Boolean)
    .join(" ");
}

function verificationImpactDescription(event: ProfileChangeEventRow) {
  if (event.category === "verification_sensitive") {
    return "The verified badge was removed because the user changed their profile photos and none of the photos reviewed for verification are still on the profile.";
  }

  return "The verified badge was removed because identity-sensitive profile information changed after verification.";
}

function verificationImpactActorLabel(event: ProfileChangeEventRow) {
  if (event.actor_kind === "user") return "User change";
  if (event.actor_kind === "service") return "Admin/system change";

  return "System change";
}

function Detail({
  label,
  value,
  className = "",
}: {
  label: string;
  value?: string | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6f8793]">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-[#25302d]/70">
        {value?.trim() ? value : "not set"}
      </p>
    </div>
  );
}

function ContentModerationButton({
  profile,
  expectedVersion,
  status,
  children,
  tone = "default",
  reason = "",
}: {
  profile: AdminProfile;
  expectedVersion: string;
  status: "approved" | "rejected";
  children: React.ReactNode;
  tone?: "default" | "danger";
  reason?: string;
}) {
  return (
    <form action={updateProfileContentModerationStatus} className="contents">
      <input type="hidden" name="profile_id" value={profile.id} />
      <input type="hidden" name="expected_version" value={expectedVersion} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="reason" value={reason} />
      <AdminActionSubmit
        tone={tone}
        confirmation={
          status === "rejected"
            ? {
                title: "Reject and hide this profile?",
                description:
                  "The exact profile content shown now will be rejected and hidden. A newer version will require a fresh review.",
                confirmLabel: "Reject and hide",
              }
            : undefined
        }
        pendingLabel={
          status === "approved"
            ? "Saving review..."
            : status === "rejected"
              ? "Rejecting..."
              : "Saving..."
        }
      >
        {children}
      </AdminActionSubmit>
    </form>
  );
}

export default async function AdminProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    section?: string | string[];
    view?: string | string[];
    returnTo?: string | string[];
    adminTrail?: string | string[];
    edit?: string | string[];
  }>;
}) {
  await requireAdminUser();

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const activeSection = sanitizeProfileSection(query.section);
  const dashboardView = sanitizeDashboardView(query.view);
  const dashboardHref = `${adminAreaHref(dashboardView)}#workspace`;
  const returnTo = safeAdminReturnTo(query.returnTo, dashboardHref);
  const backHref = adminBackHref(
    query.returnTo,
    query.adminTrail,
    dashboardHref,
  );
  const initiallyEditing = firstSearchParam(query.edit) === "1";
  const supabase = createAdminClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id, email, account_type, full_name, first_name, last_name, date_of_birth, birth_date, gender, phone_country_code, phone_number, street_address, city, country, nationality, preferred_host_countries, religion, smoking_status, already_in_germany, has_drivers_license, has_childcare_experience, has_infant_experience, has_first_aid, will_care_for_elderly, will_care_for_pets, mother_tongue, fluent_languages, basic_languages, availability_start, duration, children_info, au_pair_allowance_amount, au_pair_allowance_currency, accommodation_info, expectations, bio, childcare_experience, public_slug, onboarding_completed, suspended_at, suspended_until, suspended_reason, deletion_requested_at, content_moderation_status, content_moderation_needs_review, content_moderation_reviewed_at, content_moderation_reason, created_at, is_admin, verification_status, verification_reviewed_at, verification_rejected_reason",
    )
    .eq("id", id)
    .maybeSingle<AdminProfile>();

  if (error || !profile || profile.is_admin || isAdminEmail(profile.email)) {
    notFound();
  }

  const loadsMedia = activeSection === "media";
  const loadsVerification = activeSection === "verification";
  const loadsActivity = activeSection === "activity";
  const skippedRowsResult = Promise.resolve({ data: [], error: null });
  const skippedSingleResult = Promise.resolve({ data: null, error: null });
  const skippedCountedRowsResult = Promise.resolve({
    data: [],
    count: 0,
    error: null,
  });

  const [
    { data: photos, error: photosError },
    { data: adminEditSnapshotData, error: adminEditSnapshotError },
    { data: profileVideoData },
    { data: stories },
    { data: conversations },
    { data: verificationRequestsData },
    { data: profileChangeEventsData },
    { data: verificationPhotoSnapshotsData },
    {
      data: accountLoginsData,
      count: accountLoginsCount,
      error: accountLoginsError,
    },
  ] = await Promise.all([
      supabase
        .from("profile_photos")
        .select("id, storage_path, is_primary, sort_order")
        .eq("profile_id", profile.id)
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true }),
      supabase.rpc("admin_profile_edit_snapshot", {
        p_profile_id: profile.id,
      }),
      loadsMedia
        ? supabase
            .from("profile_videos")
            .select(
              "id, storage_path, mime_type, created_at, content_moderation_status, content_moderation_reason",
            )
            .eq("profile_id", profile.id)
            .maybeSingle<ProfileVideoRow>()
        : skippedSingleResult,
      loadsMedia
        ? supabase
            .from("profile_stories")
            .select(
              "id, storage_path, created_at, expires_at, content_moderation_status, content_moderation_reason",
            )
            .eq("profile_id", profile.id)
            .gt("expires_at", new Date().toISOString())
            .order("created_at", { ascending: false })
        : skippedRowsResult,
      loadsActivity
        ? supabase
            .from("admin_engaged_conversations")
            .select("id, family_id, au_pair_id, created_at, last_message_at")
            .or(`family_id.eq.${profile.id},au_pair_id.eq.${profile.id}`)
            .order("last_message_at", {
              ascending: false,
              nullsFirst: false,
            })
        : skippedRowsResult,
      loadsVerification
        ? supabase
            .from("profile_verification_requests")
            .select(
              "id, selfie_path, status, reviewer_note, created_at, reviewed_at",
            )
            .eq("profile_id", profile.id)
            .order("created_at", { ascending: false })
        : skippedRowsResult,
      loadsVerification
        ? supabase
            .from("profile_change_events")
            .select(
              "id, actor_kind, category, caused_verification_reset, created_at",
            )
            .eq("profile_id", profile.id)
            .eq("caused_verification_reset", true)
            .order("created_at", { ascending: false })
            .limit(20)
        : skippedRowsResult,
      loadsVerification
        ? supabase
            .from("profile_verification_photo_snapshots")
            .select(
              "id, verification_request_id, profile_photo_id, storage_path, was_primary, captured_at",
            )
            .eq("profile_id", profile.id)
            .order("captured_at", { ascending: false })
        : skippedRowsResult,
      loadsActivity
        ? supabase
            .from("account_login_ip_history")
            .select(
              "id, ip_address, auth_method, logged_in_at, login_count",
              { count: "exact" },
            )
            .eq("profile_id", profile.id)
            .order("logged_in_at", { ascending: false })
            .limit(20)
        : skippedCountedRowsResult,
    ]);

  const profilePhotos = (photos ?? []) as PhotoRow[];
  const primaryPhoto =
    profilePhotos.find((photo) => photo.is_primary) ?? profilePhotos[0] ?? null;
  const profileContentVersion = photosError
    ? null
    : getProfileContentVersion(
        profile,
        profilePhotos.map((photo) => photo.storage_path),
      );
  const storiesList = (stories ?? []) as StoryRow[];
  const profileVideo = profileVideoData as ProfileVideoRow | null;
  const profileVideoUrl = profileVideo
    ? await getSignedProfileVideoUrl(supabase, profileVideo.storage_path)
    : null;
  const storyUrlById = new Map(
    await Promise.all(
      storiesList.map(async (story) => [
        story.id,
        await getSignedStoryPhotoUrl(supabase, story.storage_path),
      ] as const),
    ),
  );
  const conversationsList = (conversations ?? []) as ConversationRow[];
  const conversationParticipantIds = Array.from(
    new Set(
      conversationsList.map((conversation) =>
        conversation.family_id === profile.id
          ? conversation.au_pair_id
          : conversation.family_id,
      ),
    ),
  );
  const { data: conversationParticipantsData } = conversationParticipantIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", conversationParticipantIds)
    : { data: [] };
  const conversationParticipantMap = new Map(
    ((conversationParticipantsData ?? []) as ConversationParticipantRow[]).map(
      (participant) => [participant.id, participant],
    ),
  );
  const verificationRequests = (verificationRequestsData ??
    []) as VerificationRequestRow[];
  const profileChangeEvents = (profileChangeEventsData ??
    []) as ProfileChangeEventRow[];
  const verificationPhotoSnapshots = (verificationPhotoSnapshotsData ??
    []) as VerificationPhotoSnapshotRow[];
  const accountLogins = (accountLoginsData ?? []) as AccountLoginRow[];
  const totalAccountLogins = accountLoginsCount ?? accountLogins.length;
  const adminEditSnapshot = adminEditSnapshotData as {
    profile?: AdminEditableProfile;
    version?: string;
  } | null;
  const currentPhotoIds = new Set(profilePhotos.map((photo) => photo.id));
  const verificationRequestsWithUrls: VerificationRequestWithUrl[] =
    await Promise.all(
      verificationRequests.map(async (request) => ({
        ...request,
        selfie_url: await getSignedVerificationSelfieUrl(
          supabase,
          request.selfie_path,
        ),
      })),
    );
  const currentProfileHref = sectionHref(
    profile.id,
    activeSection,
    dashboardView,
    returnTo,
    query.adminTrail,
  );

  return (
    <AdminWorkspace activeArea={dashboardView}>
      <div className="w-full">
        <div className="rounded-[var(--pa-admin-panel-radius)] border border-[var(--pa-admin-border)] bg-white p-4 shadow-[var(--pa-admin-shadow)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-[var(--pa-admin-surface-subtle)] ring-1 ring-black/10 sm:h-20 sm:w-20">
                {primaryPhoto ? (
                  <ProfilePhotoLightbox
                    src={getProfilePhotoPublicUrl(
                      supabase,
                      primaryPhoto.storage_path,
                    )}
                    className="h-full w-full object-cover object-[center_22%]"
                    sizes="80px"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center text-2xl font-black text-[var(--pa-admin-muted)]/45">
                    {profileLabel(profile).slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--pa-primary)]">
                  {profile.account_type === "au_pair" ? "Au pair" : "Family"} ·
                  Admin view
                </p>
                <h1 className="mt-2 truncate text-2xl font-black tracking-[-0.035em] sm:text-3xl">
                  {profileLabel(profile)}
                </h1>
                <p className="mt-2 break-words text-sm font-bold text-[#25302d]/50">
                  {profile.city ? `${profile.city}, ` : ""}
                  {profile.country ?? "Country not set"} ·{" "}
                  {profile.email ?? "No email"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <AdminBackLink
                returnTo={query.returnTo}
                trail={query.adminTrail}
                fallbackHref={dashboardHref}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--pa-admin-border)] bg-white px-4 py-2 text-center text-xs font-bold text-[var(--pa-admin-ink)] transition hover:bg-[var(--pa-admin-surface-subtle)]"
              >
                ← Back
              </AdminBackLink>
              {profile.public_slug &&
              !profile.suspended_at &&
              !profile.deletion_requested_at &&
              profile.content_moderation_status === "approved" ? (
                <Link
                  href={`/profile/${profile.public_slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--pa-primary)] px-4 py-2 text-center text-xs font-bold text-[var(--pa-primary-ink)]"
                >
                  Public view ↗
                </Link>
              ) : null}
              {profile.content_moderation_needs_review &&
              profileContentVersion ? (
                <>
                  <ContentModerationButton
                    profile={profile}
                    expectedVersion={profileContentVersion}
                    status="approved"
                    reason="Profile text and photos reviewed and approved by admin."
                  >
                    Approve content
                  </ContentModerationButton>
                  <ContentModerationButton
                    profile={profile}
                    expectedVersion={profileContentVersion}
                    status="rejected"
                    reason="Rejected for explicit or unsafe profile content."
                    tone="danger"
                  >
                    Reject and hide
                  </ContentModerationButton>
                </>
              ) : null}
            </div>
          </div>

          {profile.deletion_requested_at ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
              <p className="text-sm font-black">Account deletion pending · profile hidden</p>
              <p className="mt-1 text-sm font-semibold leading-6">
                The member requested deletion on {formatDate(profile.deletion_requested_at)}.
                Public discovery and normal account access were disabled immediately.
                Unless the member reactivates the account, permanent deletion is scheduled
                seven days after the request.
              </p>
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
            <Detail label="Created" value={formatDate(profile.created_at)} />
            <Detail
              label="Onboarding"
              value={profile.onboarding_completed ? "completed" : "incomplete"}
            />
            <Detail
              label="Content review"
              value={[
                profile.content_moderation_status,
                profile.content_moderation_needs_review
                  ? "needs background review"
                  : null,
                profile.content_moderation_reviewed_at
                  ? formatDate(profile.content_moderation_reviewed_at)
                  : null,
                profile.content_moderation_reason,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
            <Detail
              label="Verification"
              value={[
                profile.verification_status ?? "unverified",
                profile.verification_reviewed_at
                  ? formatDate(profile.verification_reviewed_at)
                  : null,
                profile.verification_rejected_reason,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
            <Detail
              label="Suspension"
              value={
                profile.suspended_at
                  ? `Until ${
                      profile.suspended_until
                        ? formatDate(profile.suspended_until)
                        : "manual review"
                    } · ${profile.suspended_reason ?? "No reason saved"}`
                  : "not suspended"
              }
            />
          </div>
        </div>

        <nav
          aria-label="Admin profile sections"
          className="sticky top-[3.25rem] z-30 -mx-3 mt-4 border-y border-[var(--pa-admin-border)] bg-[var(--pa-admin-bg)]/95 px-3 py-2 backdrop-blur sm:top-[4.25rem] sm:mx-0 sm:rounded-2xl sm:border sm:bg-white/95 sm:px-2"
        >
          <div className="grid grid-cols-4 gap-1">
            {PROFILE_SECTIONS.map((section) => {
              const isActive = activeSection === section.id;
              return (
                <Link
                  key={section.id}
                  href={sectionHref(
                    profile.id,
                    section.id,
                    dashboardView,
                    returnTo,
                    query.adminTrail,
                  )}
                  replace
                  aria-current={isActive ? "page" : undefined}
                  className={`flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-xl px-2 text-center text-[0.7rem] font-black transition sm:text-sm ${
                    isActive
                      ? "bg-[#173f39] text-white shadow-sm"
                      : "text-[#52666f] hover:bg-[#eef4f6]"
                  }`}
                >
                  <span className="truncate sm:hidden">{section.shortLabel}</span>
                  <span className="hidden truncate sm:inline">{section.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {activeSection === "profile" ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {adminEditSnapshot?.profile?.id === profile.id &&
            adminEditSnapshot.profile.account_type === profile.account_type &&
            typeof adminEditSnapshot.version === "string" &&
            /^[0-9a-f]{64}$/.test(adminEditSnapshot.version) ? (
              <AdminProfileEditor
                profile={adminEditSnapshot.profile}
                expectedVersion={adminEditSnapshot.version}
                initiallyOpen={initiallyEditing}
              />
            ) : (
              <div
                role="alert"
                className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-900 lg:col-span-2"
              >
                Profile editing is temporarily unavailable
                {adminEditSnapshotError?.message
                  ? `: ${adminEditSnapshotError.message}`
                  : "."}
              </div>
            )}
            <section className="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-7">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#6f8793]">
                {profile.account_type === "au_pair"
                  ? "Au pair profile"
                  : "Family profile"}
              </p>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <Detail
                  label={
                    profile.account_type === "au_pair"
                      ? "Introduction"
                      : "Family introduction"
                  }
                  value={profile.bio}
                  className="sm:col-span-2"
                />
                <Detail label="Availability" value={profile.availability_start} />
                <Detail label="Duration" value={profile.duration} />

                {profile.account_type === "au_pair" ? (
                  <>
                    <Detail label="Nationality" value={profile.nationality} />
                    <Detail
                      label="Preferred host countries"
                      value={profile.preferred_host_countries?.join(", ")}
                    />
                    <Detail label="Mother tongue" value={profile.mother_tongue} />
                    <Detail
                      label="Other languages"
                      value={[
                        ...(profile.fluent_languages ?? []),
                        ...(profile.basic_languages ?? []),
                      ].join(", ")}
                    />
                    <Detail
                      label="Already in Germany"
                      value={yesNo(profile.already_in_germany)}
                    />
                    <Detail label="Smoking" value={profile.smoking_status} />
                    <Detail label="Religion" value={profile.religion} />
                    <Detail
                      label="Driver's license"
                      value={yesNo(profile.has_drivers_license)}
                    />
                    <Detail
                      label="Childcare experience"
                      value={yesNo(profile.has_childcare_experience)}
                    />
                    <Detail
                      label="Infant experience"
                      value={yesNo(profile.has_infant_experience)}
                    />
                    <Detail
                      label="First aid"
                      value={yesNo(profile.has_first_aid)}
                    />
                    <Detail
                      label="Elderly care"
                      value={yesNo(profile.will_care_for_elderly)}
                    />
                    <Detail
                      label="Pet care"
                      value={yesNo(profile.will_care_for_pets)}
                    />
                    {profile.childcare_experience?.trim() ? (
                      <Detail
                        label="Experience notes"
                        value={profile.childcare_experience}
                        className="sm:col-span-2"
                      />
                    ) : null}
                  </>
                ) : (
                  <>
                    <Detail label="Children" value={profile.children_info} />
                    <Detail
                      label="Au pair allowance"
                      value={allowanceLabel(profile)}
                    />
                    <Detail label="Religion" value={profile.religion} />
                    <Detail
                      label="Accommodation"
                      value={profile.accommodation_info}
                      className="sm:col-span-2"
                    />
                    <Detail
                      label="Expectations"
                      value={profile.expectations}
                      className="sm:col-span-2"
                    />
                  </>
                )}
              </div>
            </section>

            <section className="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-7">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#6f8793]">
                Admin-only identity and contact
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#25302d]/50">
                Private fields for investigation and support. These values are
                not exposed on public profiles.
              </p>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <Detail label="First name" value={profile.first_name} />
                <Detail label="Last name" value={profile.last_name} />
                <Detail
                  label="Birth date"
                  value={profile.birth_date ?? profile.date_of_birth}
                />
                <Detail label="Gender" value={profile.gender} />
                <Detail
                  label="Phone"
                  value={[profile.phone_country_code, profile.phone_number]
                    .filter(Boolean)
                    .join(" ")}
                />
                <Detail label="Street address" value={profile.street_address} />
                <Detail
                  label="City and country"
                  value={[profile.city, profile.country].filter(Boolean).join(", ")}
                  className="sm:col-span-2"
                />
              </div>
            </section>

            <details
              open={Boolean(profile.suspended_at)}
              className="group overflow-hidden rounded-[1.5rem] border border-[var(--pa-admin-border)] bg-white shadow-sm lg:col-span-2"
            >
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 outline-none transition hover:bg-[var(--pa-admin-surface-subtle)] focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[var(--pa-primary-focus-ring)] sm:px-7 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span className="block text-sm font-black uppercase tracking-[0.16em] text-[var(--pa-admin-ink)]">
                    Account controls
                  </span>
                  <span className="mt-1 block text-xs font-semibold leading-5 text-[var(--pa-admin-muted)]">
                    Notifications, suspension, password reset and permanent deletion
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[0.68rem] font-black ${
                      profile.suspended_at
                        ? "bg-red-50 text-red-700"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {profile.suspended_at ? "Suspended" : "Active"}
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-lg font-black text-[var(--pa-admin-muted)] transition group-open:rotate-45"
                  >
                    +
                  </span>
                </span>
              </summary>

              <div className="grid gap-4 border-t border-[var(--pa-admin-border)] bg-[var(--pa-admin-surface-subtle)] p-4 sm:p-6 xl:grid-cols-2 2xl:grid-cols-4">
                <section
                  aria-labelledby={`report-outcome-heading-${profile.id}`}
                  className="rounded-2xl border border-[var(--pa-admin-border)] bg-white p-4 sm:p-5"
                >
                  <h2
                    id={`report-outcome-heading-${profile.id}`}
                    className="text-base font-black text-[var(--pa-admin-ink)]"
                  >
                    Report outcome
                  </h2>
                  <p className="mt-1 text-sm font-medium leading-6 text-[var(--pa-admin-muted)]">
                    Sends an in-app notification and an email confirming that a
                    report was reviewed and action was taken. It also explains
                    how to report from a profile or conversation.
                  </p>
                  <form action={sendReportActionTakenNotification} className="mt-4">
                    <input type="hidden" name="profile_id" value={profile.id} />
                    <input
                      type="hidden"
                      name="delivery_id"
                      value={crypto.randomUUID()}
                    />
                    <AdminActionSubmit
                      pendingLabel="Sending..."
                      confirmation={{
                        title: "Send report outcome?",
                        description: `This sends both an in-app notification and an email to ${profile.email ?? "this user"}.`,
                        confirmLabel: "Send notification and email",
                      }}
                    >
                      Notify reporter
                    </AdminActionSubmit>
                  </form>
                </section>

                <section
                  aria-labelledby={`suspension-heading-${profile.id}`}
                  className="rounded-2xl border border-[var(--pa-admin-border)] bg-white p-4 sm:p-5"
                >
                  <h2
                    id={`suspension-heading-${profile.id}`}
                    className="text-base font-black text-[var(--pa-admin-ink)]"
                  >
                    Account access
                  </h2>
                  <p className="mt-1 text-sm font-medium leading-6 text-[var(--pa-admin-muted)]">
                    {profile.suspended_at
                      ? "This member cannot use normal account areas."
                      : "Temporarily block this member from normal account areas."}
                  </p>

                  {profile.suspended_at ? (
                    <div className="mt-4">
                      <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold leading-6 text-red-800">
                        Until {profile.suspended_until ? formatDate(profile.suspended_until) : "manual review"}
                        {profile.suspended_reason
                          ? ` · ${profile.suspended_reason}`
                          : ""}
                      </p>
                      <form action={unsuspendProfile} className="mt-4">
                        <input
                          type="hidden"
                          name="profile_id"
                          value={profile.id}
                        />
                        <AdminActionSubmit pendingLabel="Unsuspending...">
                          Restore account access
                        </AdminActionSubmit>
                      </form>
                    </div>
                  ) : (
                    <form action={suspendProfile} className="mt-4 grid gap-4">
                      <input
                        type="hidden"
                        name="profile_id"
                        value={profile.id}
                      />
                      <div>
                        <label
                          htmlFor={`suspension-duration-${profile.id}`}
                          className="text-sm font-bold text-[var(--pa-admin-ink)]"
                        >
                          Suspension duration
                        </label>
                        <select
                          id={`suspension-duration-${profile.id}`}
                          name="duration_days"
                          defaultValue="7"
                          className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--pa-admin-border)] bg-white px-3 py-2 text-base font-semibold outline-none focus:border-[var(--pa-primary)] focus:ring-4 focus:ring-[var(--pa-primary-focus-ring)]"
                        >
                          {SUSPENSION_DURATIONS.map((duration) => (
                            <option key={duration.days} value={duration.days}>
                              {duration.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor={`suspension-rule-${profile.id}`}
                          className="text-sm font-bold text-[var(--pa-admin-ink)]"
                        >
                          Moderation reason
                        </label>
                        <select
                          id={`suspension-rule-${profile.id}`}
                          name="rule"
                          defaultValue={MODERATION_RULES[0].id}
                          className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--pa-admin-border)] bg-white px-3 py-2 text-base font-semibold outline-none focus:border-[var(--pa-primary)] focus:ring-4 focus:ring-[var(--pa-primary-focus-ring)]"
                        >
                          {MODERATION_RULES.map((rule) => (
                            <option key={rule.id} value={rule.id}>
                              {rule.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor={`suspension-note-${profile.id}`}
                          className="text-sm font-bold text-[var(--pa-admin-ink)]"
                        >
                          Internal note <span className="font-medium text-[var(--pa-admin-muted)]">(optional)</span>
                        </label>
                        <input
                          id={`suspension-note-${profile.id}`}
                          name="reason"
                          type="text"
                          autoComplete="off"
                          className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--pa-admin-border)] bg-white px-3 py-2 text-base font-semibold outline-none placeholder:text-[var(--pa-admin-muted)] focus:border-[var(--pa-primary)] focus:ring-4 focus:ring-[var(--pa-primary-focus-ring)]"
                          placeholder="Add context for other admins"
                        />
                      </div>
                      <div>
                        <AdminActionSubmit
                          tone="danger"
                          pendingLabel="Suspending..."
                        >
                          Suspend account
                        </AdminActionSubmit>
                      </div>
                    </form>
                  )}
                </section>

                <section
                  aria-labelledby={`password-heading-${profile.id}`}
                  className="rounded-2xl border border-[var(--pa-admin-border)] bg-white p-4 sm:p-5"
                >
                  <h2
                    id={`password-heading-${profile.id}`}
                    className="text-base font-black text-[var(--pa-admin-ink)]"
                  >
                    Reset password
                  </h2>
                  <p
                    id={`password-help-${profile.id}`}
                    className="mt-1 text-sm font-medium leading-6 text-[var(--pa-admin-muted)]"
                  >
                    Set a temporary password with at least 8 characters.
                  </p>
                  <form action={resetProfilePassword} className="mt-4 grid gap-3">
                    <input
                      type="hidden"
                      name="profile_id"
                      value={profile.id}
                    />
                    <div>
                      <label
                        htmlFor={`admin-password-${profile.id}`}
                        className="text-sm font-bold text-[var(--pa-admin-ink)]"
                      >
                        New temporary password
                      </label>
                      <PasswordField
                        id={`admin-password-${profile.id}`}
                        name="password"
                        minLength={8}
                        required
                        autoComplete="new-password"
                        className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--pa-admin-border)] bg-white px-3 py-2 text-base font-semibold outline-none focus:border-[var(--pa-primary)] focus:ring-4 focus:ring-[var(--pa-primary-focus-ring)]"
                      />
                    </div>
                    <div>
                      <AdminActionSubmit pendingLabel="Saving password...">
                        Set temporary password
                      </AdminActionSubmit>
                    </div>
                  </form>
                </section>

                <section
                  aria-labelledby={`delete-heading-${profile.id}`}
                  className="rounded-2xl border border-red-200 bg-white p-4 sm:p-5"
                >
                  <h2
                    id={`delete-heading-${profile.id}`}
                    className="text-base font-black text-red-800"
                  >
                    Delete account permanently
                  </h2>
                  <p className="mt-1 text-sm font-medium leading-6 text-[var(--pa-admin-muted)]">
                    Permanently removes the profile and related account data,
                    and bans the account email when available.
                  </p>
                  <form action={deleteProfile} className="mt-4">
                    <input
                      type="hidden"
                      name="profile_id"
                      value={profile.id}
                    />
                    <input type="hidden" name="return_to" value={backHref} />
                    <AdminActionSubmit
                      tone="danger"
                      pendingLabel="Deleting..."
                      confirmation={{
                        title: "Delete profile?",
                        description:
                          "This permanently removes the profile and its related account data. This action cannot be undone.",
                        confirmLabel: "Delete profile",
                      }}
                    >
                      Delete profile
                    </AdminActionSubmit>
                  </form>
                </section>
              </div>
            </details>
          </div>
        ) : null}

        {activeSection === "media" ? (
          <div className="mt-4 space-y-4">
            <section className="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-7">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-[#6f8793]">
                    Profile photos
                  </p>
                  <p className="mt-2 text-xs font-bold text-[#25302d]/45">
                    Open a photo at full size, choose the main profile photo or
                    remove an unsafe image. At least one photo is still required
                    for app access.
                  </p>
                </div>
                <span className="shrink-0 text-xs font-black text-[#45636f]">
                  {profilePhotos.length} / 5
                </span>
              </div>

              {profile.deletion_requested_at ? (
                <div className="mt-4 rounded-2xl border border-[#ead7c7] bg-[#fff8f0] p-4 text-sm font-bold leading-6 text-[#76533b]">
                  New photos are disabled while this account is pending
                  deletion. Cancel the deletion request before adding personal
                  media.
                </div>
              ) : (
                <AdminProfilePhotoUploader
                  profileId={profile.id}
                  photoCount={profilePhotos.length}
                />
              )}

              {profilePhotos.length > 0 ? (
                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
                  {profilePhotos.map((photo) => (
                    <article
                      key={photo.id}
                      className="overflow-hidden rounded-[1rem] bg-white ring-1 ring-black/10"
                    >
                      <div className="relative aspect-square bg-[#edf2f3]">
                        <ProfilePhotoLightbox
                          src={getProfilePhotoPublicUrl(
                            supabase,
                            photo.storage_path,
                          )}
                          className="h-full w-full object-cover object-[center_22%]"
                          sizes="(min-width: 1024px) 260px, (min-width: 640px) 30vw, 46vw"
                          allowRotate
                        />
                        {photo.is_primary ? (
                          <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-full bg-[#173f39] px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-wide text-white shadow-sm">
                            Main photo
                          </span>
                        ) : null}
                      </div>
                      <div className="space-y-2 p-2.5 sm:p-3">
                        {!photo.is_primary ? (
                          <form action={setAdminPrimaryProfilePhoto}>
                            <input
                              type="hidden"
                              name="photo_id"
                              value={photo.id}
                            />
                            <AdminActionSubmit pendingLabel="Updating...">
                              Make main
                            </AdminActionSubmit>
                          </form>
                        ) : (
                          <p className="flex min-h-11 items-center justify-center rounded-xl bg-[var(--pa-admin-surface-subtle)] px-3 text-center text-xs font-bold text-[var(--pa-admin-muted)]">
                            Shown on cards and search
                          </p>
                        )}
                        <form action={deleteProfilePhoto}>
                          <input
                            type="hidden"
                            name="photo_id"
                            value={photo.id}
                          />
                          <AdminActionSubmit
                            tone="danger"
                            pendingLabel="Deleting..."
                            confirmation={{
                              title: "Delete profile photo?",
                              description:
                                profilePhotos.length === 1
                                  ? "This is the member's last photo. Their profile will be hidden and they will be sent to the required-photo step."
                                  : "The photo will be permanently removed. If it is part of a verification snapshot, the verification history remains available to admins.",
                              confirmLabel: "Delete photo",
                            }}
                          >
                            Delete
                          </AdminActionSubmit>
                        </form>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-[1rem] bg-[var(--background)] p-4 text-sm font-bold text-[#25302d]/45">
                  No profile photos.
                </p>
              )}
            </section>

            <section className="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-7">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-[#6f8793]">
                    Profile intro video
                  </p>
                  <p className="mt-2 text-xs font-bold text-[#25302d]/45">
                    The player shows the exact video currently attached to this
                    profile.
                  </p>
                </div>
                {profileVideo ? (
                  <span className="shrink-0 rounded-full bg-[#eef4f6] px-3 py-1 text-xs font-black text-[#45636f]">
                    {profileVideo.content_moderation_status}
                  </span>
                ) : null}
              </div>

              {profileVideo ? (
                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,28rem)_1fr]">
                  <div className="overflow-hidden rounded-[1rem] bg-black ring-1 ring-black/10">
                    {profileVideoUrl ? (
                      <video
                        src={profileVideoUrl}
                        controls
                        preload="none"
                        playsInline
                        className="aspect-video h-auto w-full object-contain"
                      />
                    ) : (
                      <div className="flex aspect-video items-center justify-center p-4 text-center text-xs font-black text-white/60">
                        Video unavailable
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 space-y-3">
                    <Detail
                      label="Uploaded"
                      value={formatDate(profileVideo.created_at)}
                    />
                    <Detail label="File type" value={profileVideo.mime_type} />
                    <Detail
                      label="Storage path"
                      value={profileVideo.storage_path}
                    />
                    {profileVideo.content_moderation_reason ? (
                      <Detail
                        label="Moderation reason"
                        value={profileVideo.content_moderation_reason}
                      />
                    ) : null}

                    <div className="flex flex-wrap gap-2 pt-1">
                      <form action={updateProfileVideoModerationStatus}>
                        <input
                          type="hidden"
                          name="video_id"
                          value={profileVideo.id}
                        />
                        <input
                          type="hidden"
                          name="expected_storage_path"
                          value={profileVideo.storage_path}
                        />
                        <input type="hidden" name="status" value="approved" />
                        <input
                          type="hidden"
                          name="reason"
                          value="Profile video reviewed by admin."
                        />
                        <AdminActionSubmit pendingLabel="Approving...">
                          Approve video
                        </AdminActionSubmit>
                      </form>
                      <form action={updateProfileVideoModerationStatus}>
                        <input
                          type="hidden"
                          name="video_id"
                          value={profileVideo.id}
                        />
                        <input
                          type="hidden"
                          name="expected_storage_path"
                          value={profileVideo.storage_path}
                        />
                        <input type="hidden" name="status" value="rejected" />
                        <input
                          type="hidden"
                          name="reason"
                          value="Rejected for explicit or unsafe video content."
                        />
                        <AdminActionSubmit
                          tone="danger"
                          pendingLabel="Rejecting..."
                        >
                          Reject video
                        </AdminActionSubmit>
                      </form>
                      <form action={deleteProfileVideo}>
                        <input
                          type="hidden"
                          name="video_id"
                          value={profileVideo.id}
                        />
                        <AdminActionSubmit
                          tone="danger"
                          pendingLabel="Deleting..."
                          confirmation={{
                            title: "Delete profile video?",
                            description:
                              "This permanently removes the video from the profile and Storage.",
                            confirmLabel: "Delete video",
                          }}
                        >
                          Delete video
                        </AdminActionSubmit>
                      </form>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-4 rounded-[1rem] bg-[var(--background)] p-4 text-sm font-bold text-[#25302d]/45">
                  No profile video.
                </p>
              )}
            </section>

            <section
              id="stories"
              className="scroll-mt-36 rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-7"
            >
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#6f8793]">
                Active stories
              </p>
              {storiesList.length > 0 ? (
                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
                  {storiesList.map((story) => {
                    const storyUrl = storyUrlById.get(story.id);

                    return (
                      <article
                        key={story.id}
                        className="overflow-hidden rounded-[1rem] bg-[#f7f3ed] ring-1 ring-black/5"
                      >
                        <div className="aspect-square bg-[#edf2f3]">
                          {storyUrl ? (
                            <ProfilePhotoLightbox
                              src={storyUrl}
                              className="h-full w-full object-contain"
                              sizes="(min-width: 1024px) 260px, (min-width: 640px) 30vw, 46vw"
                              allowRotate
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center p-4 text-center text-xs font-black text-[#25302d]/30">
                              Story unavailable
                            </div>
                          )}
                        </div>
                        <div className="p-3 text-xs font-bold text-[#25302d]/55">
                          <p>
                            {story.content_moderation_status}
                            {story.content_moderation_reason
                              ? `: ${story.content_moderation_reason}`
                              : ""}
                          </p>
                          <Link
                            href={buildStoryHref(
                              story.id,
                              `${currentProfileHref}#stories`,
                            )}
                            className="mt-2 inline-flex font-black text-[#45636f] underline-offset-4 hover:underline"
                          >
                            Open story →
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 rounded-[1rem] bg-[var(--background)] p-4 text-sm font-bold text-[#25302d]/45">
                  No active stories.
                </p>
              )}
            </section>
          </div>
        ) : null}

        {activeSection === "verification" ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-7">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#6f8793]">
                Verification selfies
              </p>
              <p className="mt-2 text-xs font-bold leading-5 text-[#25302d]/45">
                Kept for admin comparison even if profile photos change later.
              </p>
              {verificationRequestsWithUrls.length > 0 ? (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {verificationRequestsWithUrls.map((request) => (
                    <article
                      key={request.id}
                      className="overflow-hidden rounded-[1rem] bg-[#f7f3ed] ring-1 ring-black/5"
                    >
                      <div className="aspect-square bg-[#edf2f3]">
                        {request.selfie_url ? (
                          <ProfilePhotoLightbox
                            src={request.selfie_url}
                            className="h-full w-full object-contain"
                            sizes="(min-width: 1024px) 250px, 46vw"
                            allowRotate
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center p-4 text-center text-xs font-black text-[#25302d]/30">
                            Selfie unavailable
                          </div>
                        )}
                      </div>
                      <div className="space-y-1 bg-white p-3 text-xs font-bold text-[#25302d]/52">
                        <p className="font-black text-[#25302d]">
                          {request.status}
                        </p>
                        <p>Submitted {formatDate(request.created_at)}</p>
                        {request.reviewed_at ? (
                          <p>Reviewed {formatDate(request.reviewed_at)}</p>
                        ) : null}
                        {request.reviewer_note ? (
                          <p className="break-words text-[#9d3f2f]">
                            {request.reviewer_note}
                          </p>
                        ) : null}
                        {request.status === "pending" ? (
                          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-black/5 pt-3">
                            <form
                              action={updateVerificationRequestStatus}
                              className="[&>button]:w-full"
                            >
                              <input
                                type="hidden"
                                name="request_id"
                                value={request.id}
                              />
                              <input
                                type="hidden"
                                name="status"
                                value="verified"
                              />
                              <AdminActionSubmit
                                pendingLabel="Verifying…"
                              >
                                Verify
                              </AdminActionSubmit>
                            </form>
                            <form
                              action={updateVerificationRequestStatus}
                              className="[&>button]:w-full"
                            >
                              <input
                                type="hidden"
                                name="request_id"
                                value={request.id}
                              />
                              <input
                                type="hidden"
                                name="status"
                                value="rejected"
                              />
                              <AdminActionSubmit
                                pendingLabel="Rejecting…"
                                tone="danger"
                                confirmation={{
                                  title: "Reject this verification selfie?",
                                  description:
                                    "The member will be notified and can submit a new live-camera selfie.",
                                  confirmLabel: "Reject and notify",
                                }}
                              >
                                Reject
                              </AdminActionSubmit>
                            </form>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-[1rem] bg-[var(--background)] p-4 text-sm font-bold text-[#25302d]/45">
                  No verification selfies.
                </p>
              )}
            </section>

            <section className="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-7">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#6f8793]">
                Verified photo snapshot
              </p>
              <p className="mt-2 text-xs font-bold leading-5 text-[#25302d]/45">
                Verification stays valid while at least one captured photo is
                still on the profile.
              </p>
              <div className="mt-4 grid gap-2">
                {verificationPhotoSnapshots.slice(0, 12).map((snapshot) => (
                  <div
                    key={snapshot.id}
                    className="rounded-[1rem] bg-[var(--background)] p-3 text-xs font-bold text-[#25302d]/52 ring-1 ring-black/5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate">
                        {snapshot.was_primary ? "Primary" : "Photo"}
                      </span>
                      <span
                        className={
                          currentPhotoIds.has(snapshot.profile_photo_id)
                            ? "text-[#45636f]"
                            : "text-[#9d3f2f]"
                        }
                      >
                        {currentPhotoIds.has(snapshot.profile_photo_id)
                          ? "Still present"
                          : "Removed"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[#25302d]/38">
                      {formatDate(snapshot.captured_at)}
                    </p>
                  </div>
                ))}
                {verificationPhotoSnapshots.length === 0 ? (
                  <p className="rounded-[1rem] bg-[var(--background)] p-4 text-sm font-bold text-[#25302d]/45">
                    No verified photo snapshot yet.
                  </p>
                ) : null}
              </div>
            </section>

            <section className="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-7 lg:col-span-2">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#6f8793]">
                Verification impact
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#25302d]/50">
                Only changes that affected the public verified badge are shown.
              </p>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {profileChangeEvents.length > 0 ? (
                  profileChangeEvents.map((event) => (
                    <article
                      key={event.id}
                      className="rounded-[1.25rem] border border-black/10 bg-[var(--background)] p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#fff5f2] px-3 py-1 text-xs font-black text-[#9d3f2f]">
                          Verification reset
                        </span>
                        <span className="rounded-full bg-[#eef4f6] px-3 py-1 text-xs font-black text-[#45636f]">
                          {verificationImpactActorLabel(event)}
                        </span>
                        <span className="text-xs font-bold text-[#25302d]/42">
                          {formatDate(event.created_at)}
                        </span>
                      </div>
                      <h3 className="mt-3 text-base font-black">
                        Verified badge removed
                      </h3>
                      <p className="mt-2 text-sm font-semibold leading-6 text-[#25302d]/62">
                        {verificationImpactDescription(event)}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="rounded-[1rem] bg-[var(--background)] p-4 text-sm font-bold text-[#25302d]/45">
                    No verification-impacting changes.
                  </p>
                )}
              </div>
            </section>
          </div>
        ) : null}

        {activeSection === "activity" ? (
          <div className="mt-4 space-y-4">
            <details
              id="account-logins"
              className="group scroll-mt-36 overflow-hidden rounded-[1.5rem] bg-white shadow-sm ring-1 ring-black/5"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 outline-none transition hover:bg-[var(--background)] focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[var(--pa-primary-focus-ring)] [&::-webkit-details-marker]:hidden sm:px-7 sm:py-6">
                <div className="min-w-0">
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-[#6f8793]">
                    Successful logins
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#25302d]/50">
                    Open to inspect timestamps and IP addresses
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-2 text-xs font-black text-[#45636f]">
                  <span className="rounded-full bg-[#eef4f6] px-3 py-2">
                    {totalAccountLogins}
                  </span>
                  <span className="group-open:hidden">Open</span>
                  <span className="hidden group-open:inline">Close</span>
                  <span
                    aria-hidden="true"
                    className="text-base transition-transform group-open:rotate-180"
                  >
                    ↓
                  </span>
                </span>
              </summary>

              <div className="border-t border-black/5 px-5 pb-5 pt-4 sm:px-7 sm:pb-7">
                <div className="flex justify-end">
                  <Link
                    href={withAdminReturnTo(
                      `/admin/logins?profile=${profile.id}&view=${dashboardView}`,
                      `${currentProfileHref}#account-logins`,
                    )}
                    className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#172d28] px-4 text-xs font-black text-white"
                  >
                    Full history →
                  </Link>
                </div>

                {accountLoginsError ? (
                  <p className="mt-4 rounded-[1rem] bg-red-50 p-4 text-sm font-bold text-red-700">
                    Could not load login history: {accountLoginsError.message}
                  </p>
                ) : accountLogins.length > 0 ? (
                  <div className="mt-4 grid gap-2 lg:grid-cols-2">
                    {accountLogins.map((entry) => (
                      <article
                        key={entry.id}
                        className="rounded-[1rem] bg-[var(--background)] p-4 ring-1 ring-black/5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="break-all font-mono text-sm font-black text-[#172d28]">
                            {entry.ip_address}
                          </p>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[0.65rem] font-black text-[#45636f] ring-1 ring-black/5">
                            {entry.auth_method === "google"
                              ? "Google"
                              : entry.auth_method === "facebook"
                                ? "Facebook"
                                : "Password"}
                          </span>
                        </div>
                        <p className="mt-2 text-xs font-bold text-[#25302d]/45">
                          {formatDate(entry.logged_in_at)}
                        </p>
                        {entry.login_count > 1 ? (
                          <p className="mt-2 text-xs font-black text-amber-700">
                            Historical group · {entry.login_count} logins
                          </p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 rounded-[1rem] bg-[var(--background)] p-4 text-sm font-bold text-[#25302d]/45">
                    No successful logins recorded yet.
                  </p>
                )}
              </div>
            </details>

            <section
              id="conversations"
              className="scroll-mt-36 rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-7"
            >
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-[#6f8793]">
                    Conversations
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[#25302d]/50">
                    Read-only moderation access to mutual conversations where
                    both members participated.
                  </p>
                </div>
                <span className="shrink-0 text-xs font-black text-[#45636f]">
                  {conversationsList.length}
                </span>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {conversationsList.map((conversation) => {
                  const participantId =
                    conversation.family_id === profile.id
                      ? conversation.au_pair_id
                      : conversation.family_id;
                  const participant =
                    conversationParticipantMap.get(participantId);

                  return (
                    <Link
                      key={conversation.id}
                      href={withAdminReturnTo(
                        `/admin/conversations/${conversation.id}?view=${dashboardView}`,
                        `${currentProfileHref}#conversations`,
                      )}
                      className="rounded-[1rem] bg-[var(--background)] px-4 py-3 ring-1 ring-black/10 transition hover:bg-[#e9f1f3]"
                    >
                      <span className="block truncate text-sm font-black text-[#45636f]">
                        {participant?.full_name || participant?.email || "Unknown member"}
                      </span>
                      <span className="mt-1 block text-xs font-bold text-[#25302d]/45">
                        Last activity {formatDate(conversation.last_message_at ?? conversation.created_at)}
                      </span>
                    </Link>
                  );
                })}
                {conversationsList.length === 0 ? (
                  <p className="rounded-[1rem] bg-[var(--background)] p-4 text-sm font-bold text-[#25302d]/45">
                    No conversations.
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </AdminWorkspace>
  );
}
