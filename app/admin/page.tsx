import { AdminLink as Link } from "@/components/admin/AdminLink";
import { AdminActionSubmit } from "@/components/admin/AdminActionSubmit";
import {
  AdminPageHeader,
  AdminWorkspace,
  adminAreaHref,
  type AdminArea,
} from "@/components/admin/AdminWorkspace";
import { FeatureFlagToggleSubmit } from "@/components/admin/FeatureFlagToggleSubmit";
import { ProfilePhotoLightbox } from "@/components/profile/ProfilePhotoLightbox";
import {
  confirmReportViolationAndSeparate,
  deleteProfilePhoto,
  deleteProfileVideo,
  deleteStory,
  updateFeatureFlag,
  updateProfileContentModerationStatus,
  updateReportStatus,
  updateProfileVideoModerationStatus,
  updateRiskFlagStatus,
  updateStoryContentModerationStatus,
  updateVerificationRequestStatus,
} from "@/app/admin/actions";
import {
  getProfilePhotoPublicUrl,
  getSignedProfileVideoUrl,
  getSignedStoryPhotoUrl,
} from "@/lib/images/storage";
import {
  isAdminServiceConfigured,
  requireAdminUser,
} from "@/lib/admin/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatAdminDate } from "@/lib/admin/date-format";
import { withAdminReturnTo } from "@/lib/admin/navigation";
import {
  FEATURE_FLAG_DESCRIPTIONS,
  FEATURE_FLAGS,
  FULLY_LINKED_FEATURE_FLAGS,
  type FeatureFlagKey,
} from "@/lib/feature-flags";
import { getProfileContentVersion } from "@/lib/moderation/profile-content-version";
import { buildStoryHref } from "@/lib/stories/story-links";

export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  email: string | null;
  account_type: "family" | "au_pair";
  full_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  bio?: string | null;
  childcare_experience?: string | null;
  children_info?: string | null;
  accommodation_info?: string | null;
  expectations?: string | null;
  city: string | null;
  country: string | null;
  public_slug: string | null;
  onboarding_completed: boolean;
  auth_email_confirmed: boolean;
  suspended_at: string | null;
  suspended_until: string | null;
  suspension_rule: string | null;
  suspended_reason: string | null;
  deletion_requested_at: string | null;
  content_moderation_status: "pending" | "approved" | "rejected";
  content_moderation_needs_review: boolean;
  content_moderation_reviewed_at: string | null;
  content_moderation_reason: string | null;
  created_at: string;
  updated_at?: string | null;
};

type ReportRow = {
  id: string;
  reporter_id: string | null;
  subject_type: "profile" | "story" | "conversation";
  subject_id: string;
  reported_profile_id: string | null;
  category: string;
  reason: string;
  details: string;
  status: "open" | "reviewed" | "dismissed";
  admin_notes: string;
  created_at: string;
};

type PhotoRow = {
  id: string;
  profile_id: string;
  storage_path: string;
  is_primary: boolean;
  created_at: string;
};

type ContentReviewPhoto = PhotoRow & {
  publicUrl: string;
};

type StoryRow = {
  id: string;
  profile_id: string;
  storage_path: string;
  created_at: string;
  expires_at: string;
  content_moderation_status: "pending" | "approved" | "rejected";
  content_moderation_reason: string | null;
};

type ProfileVideoRow = {
  id: string;
  profile_id: string;
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
  updated_at: string | null;
  last_message_at: string | null;
};

type RiskFlagRow = {
  id: string;
  profile_id: string;
  flag_type: "new_account_message_burst" | "new_account_many_conversations";
  severity: "low" | "medium" | "high";
  reason: string;
  metadata: Record<string, unknown> | null;
  status: "open" | "reviewed" | "dismissed";
  created_at: string;
};

type VerificationRequestRow = {
  id: string;
  profile_id: string;
  selfie_path: string;
  status: "pending" | "verified" | "rejected";
  reviewer_note: string;
  created_at: string;
  reviewed_at: string | null;
};

type ReviewQueue = "content" | "identity" | "videos" | "reports" | "stories";

type MemberTypeFilter =
  | "all"
  | "family"
  | "au_pair"
  | "live_family"
  | "live_au_pair"
  | "incomplete"
  | "unconfirmed"
  | "suspended"
  | "deletion_pending";

const MEMBER_PAGE_SIZE = 24;
const CONTENT_REVIEW_QUEUE_SIZE = 20;
const VERIFICATION_QUEUE_SIZE = 6;
const CONVERSATION_PROFILE_LIMIT = 40;

type ProfileChangeEventRow = {
  id: string;
  profile_id: string;
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

type AdminAuditLogRow = {
  id: string;
  admin_profile_id: string | null;
  action: string;
  target_profile_id: string | null;
  target_resource_type: string | null;
  target_resource_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type FeatureFlagRow = {
  key: string;
  enabled: boolean;
  description: string;
  updated_at: string;
  updated_by: string | null;
};

type AccountLoginIpRow = {
  id: string;
  profile_id: string;
  ip_address: string;
  auth_method: "password" | "google" | "facebook";
  first_seen_at: string;
  last_seen_at: string;
  logged_in_at: string;
  login_count: number;
};

type ResolvedFeatureFlag = {
  key: FeatureFlagKey;
  enabled: boolean;
  effectiveEnabled: boolean;
  description: string;
  updated_at: string | null;
  updated_by: string | null;
  envOverride: "enabled" | "disabled" | null;
  fullyLinked: boolean;
};

const formatDate = formatAdminDate;

function profileLabel(profile?: ProfileRow | null) {
  if (!profile) return "Unknown profile";

  return profile.full_name || profile.email || profile.id;
}

function subjectHref(
  report: ReportRow,
  returnView: "review",
  returnTo: string,
) {
  let destinationHref: string;

  if (report.subject_type === "profile") {
    destinationHref = `/admin/profiles/${
      report.reported_profile_id ?? report.subject_id
    }?section=profile&view=${returnView}`;
  } else if (report.subject_type === "story") {
    return buildStoryHref(report.subject_id, returnTo);
  } else {
    destinationHref = `/admin/conversations/${report.subject_id}?view=${returnView}`;
  }

  return withAdminReturnTo(destinationHref, returnTo);
}

function reportCategoryLabel(category: string) {
  const labels: Record<string, string> = {
    fake_profile: "Fake profile",
    inappropriate_content: "Inappropriate content",
    spam_scam: "Spam or scam",
    harassment_safety: "Harassment or safety",
    privacy: "Privacy",
    other: "Other",
  };

  return labels[category] ?? category;
}

function riskFlagTypeLabel(flagType: RiskFlagRow["flag_type"]) {
  if (flagType === "new_account_message_burst") {
    return "Message burst";
  }

  return "Many conversations";
}

function featureFlagEnvOverride(key: FeatureFlagKey) {
  const value = process.env[`FEATURE_${key.toUpperCase()}_ENABLED`]
    ?.trim()
    .toLowerCase();

  if (value === "false" || value === "0") {
    return "disabled";
  }

  if (value === "true" || value === "1") {
    return "enabled";
  }

  return null;
}

function riskFlagMetadata(flag: RiskFlagRow) {
  const metadata = flag.metadata ?? {};
  const entries: [string, unknown][] = [
    ["Messages in 10m", metadata.message_count_10m],
    ["Distinct chats in 30m", metadata.distinct_conversations_30m],
    ["Threshold", metadata.threshold],
    ["Window", metadata.window],
  ].filter((entry): entry is [string, string | number] =>
    typeof entry[1] === "string" || typeof entry[1] === "number",
  );

  return entries;
}

function ActionSubmit({
  children,
  tone = "default",
  pendingLabel,
  confirmation,
}: {
  children: React.ReactNode;
  tone?: "default" | "danger";
  pendingLabel?: string;
  confirmation?: {
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
  };
}) {
  return (
    <AdminActionSubmit
      tone={tone}
      pendingLabel={pendingLabel}
      confirmation={confirmation}
    >
      {children}
    </AdminActionSubmit>
  );
}

type AdminTone =
  | "slate"
  | "rose"
  | "amber"
  | "violet"
  | "cyan"
  | "emerald";

const statDotClasses: Record<AdminTone, string> = {
  slate: "bg-slate-500",
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  violet: "bg-violet-500",
  cyan: "bg-cyan-500",
  emerald: "bg-emerald-500",
};

function StatCard({
  label,
  value,
  tone = "slate",
  href,
}: {
  label: string;
  value: number;
  tone?: AdminTone;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] opacity-70">
          {label}
        </p>
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-full shadow-sm ${statDotClasses[tone]}`}
        />
      </div>
      <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-[var(--pa-admin-ink)]">
        {value}
      </p>
      {href ? (
        <span className="mt-2 block text-[0.65rem] font-black uppercase tracking-[0.12em] opacity-55">
          Open workspace →
        </span>
      ) : null}
    </>
  );
  const className =
    "group rounded-[var(--pa-admin-card-radius)] border border-[var(--pa-admin-border)] bg-[var(--pa-admin-surface)] p-4 text-[var(--pa-admin-muted)] shadow-[var(--pa-admin-shadow)] outline-none transition hover:border-[#b8ccc5] focus-visible:ring-4 focus-visible:ring-[var(--pa-primary-focus-ring)]";

  if (href) {
    return (
      <Link href={href} className={className} aria-label={`${label}: ${value}`}>
        {content}
      </Link>
    );
  }

  return (
    <div className={className}>
      {content}
    </div>
  );
}

const ADMIN_AREA_ALIASES: Record<string, AdminArea> = {
  overview: "overview",
  review: "review",
  reports: "review",
  media: "review",
  members: "members",
  profiles: "members",
  conversations: "conversations",
  activity: "system",
  system: "system",
  controls: "system",
};

function parseDashboardTab(value?: string | string[]) {
  const candidate = Array.isArray(value) ? value[0] : value;

  return (candidate && ADMIN_AREA_ALIASES[candidate]) || "overview";
}

function parseMemberType(value?: string | string[]): MemberTypeFilter {
  const candidate = Array.isArray(value) ? value[0] : value;

  return candidate === "family" ||
    candidate === "au_pair" ||
    candidate === "live_family" ||
    candidate === "live_au_pair" ||
    candidate === "incomplete" ||
    candidate === "unconfirmed" ||
    candidate === "suspended" ||
    candidate === "deletion_pending"
    ? candidate
    : "all";
}

function parsePositivePage(value?: string | string[]) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(candidate ?? "1", 10);

  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 10_000) : 1;
}

function parseReviewQueue(value?: string | string[]): ReviewQueue {
  const candidate = Array.isArray(value) ? value[0] : value;

  return candidate === "content" ||
    candidate === "videos" ||
    candidate === "reports" ||
    candidate === "stories"
    ? candidate
    : "identity";
}

function reviewQueueHref(queue: ReviewQueue) {
  return `/admin?view=review&queue=${queue}`;
}

function reviewQueueReturnHref(queue: ReviewQueue, anchor?: string) {
  return `${reviewQueueHref(queue)}${anchor ? `#${anchor}` : ""}`;
}

function memberDirectoryHref({
  type,
  query,
  page,
}: {
  type: MemberTypeFilter;
  query?: string;
  page?: number;
}) {
  const params = new URLSearchParams({ view: "members" });

  if (type !== "all") params.set("type", type);
  if (query) params.set("q", query);
  if (page && page > 1) params.set("page", String(page));

  return `/admin?${params.toString()}`;
}

function DashboardTabPanel({
  id,
  activeTab,
  children,
}: {
  id:
    | AdminArea
    | "reports"
    | "controls"
    | "activity"
    | "profiles"
    | "media";
  activeTab: AdminArea;
  children: React.ReactNode;
}) {
  const panelArea = ADMIN_AREA_ALIASES[id] ?? "overview";

  if (panelArea !== activeTab) return null;

  return (
    <div
      data-admin-tab-panel={id}
      className="min-w-0 max-w-full [&_article]:min-w-0 [&_dd]:break-words [&_p]:break-words"
    >
      {children}
    </div>
  );
}

function SectionShell({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="mt-4 scroll-mt-24 overflow-hidden rounded-[var(--pa-admin-panel-radius)] border border-[var(--pa-admin-border)] bg-[var(--pa-admin-surface)] p-4 shadow-[var(--pa-admin-shadow)] sm:p-6"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--pa-primary)]">
            {eyebrow}
          </p>
          <h2 className="mt-1.5 text-xl font-black tracking-[-0.025em] text-[var(--pa-admin-ink)] sm:text-2xl">
            {title}
          </h2>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-[var(--pa-admin-muted)]">
              {description}
            </p>
          ) : null}
        </div>
      </div>

      {children}
    </section>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--pa-admin-card-radius)] border border-dashed border-[var(--pa-admin-border)] bg-[var(--pa-admin-surface-subtle)] p-4 text-sm font-semibold text-[var(--pa-admin-muted)]">
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[var(--pa-admin-success)] shadow-sm"
        aria-hidden="true"
      >
        ✓
      </span>
      <p>{children}</p>
    </div>
  );
}

function adminQueryError(label: string, error?: { message?: string } | null) {
  return error?.message ? `${label}: ${error.message}` : null;
}

function isMissingReportCategory(error?: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";

  return (
    message.includes("moderation_reports.category") ||
    (message.includes("category") && message.includes("does not exist"))
  );
}

function isMissingRiskFlagsTable(error?: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";

  return (
    message.includes("account_risk_flags") ||
    (message.includes("schema cache") && message.includes("risk_flags"))
  );
}

function isMissingProfileChangeEventsTable(error?: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";

  return (
    message.includes("profile_change_events") ||
    (message.includes("schema cache") && message.includes("profile_change"))
  );
}

function isMissingAdminAuditLogTable(error?: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";

  return (
    (message.includes("admin_audit_log") &&
      (message.includes("schema cache") ||
        message.includes("does not exist") ||
        message.includes("could not find"))) ||
    (message.includes("audit") && message.includes("schema cache"))
  );
}

function isMissingFeatureFlagsTable(error?: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";

  return (
    (message.includes("feature_flags") &&
      (message.includes("schema cache") ||
        message.includes("does not exist") ||
        message.includes("could not find"))) ||
    (message.includes("feature") && message.includes("schema cache"))
  );
}

function adminAuditActionLabel(action: string) {
  const labels: Record<string, string> = {
    admin_set_primary_profile_photo: "Set main profile photo",
    admin_upload_profile_photo: "Upload profile photo",
    admin_update_profile_details: "Edit member profile",
    delete_profile: "Delete profile",
    delete_profile_photo: "Delete profile photo",
    delete_story: "Delete story",
    confirm_report_violation_and_separate: "Warning and safety separation",
    reset_profile_password: "Reset password",
    send_report_action_taken_notification: "Report outcome notification",
    suspend_profile: "Suspend profile",
    unsuspend_profile: "Unsuspend profile",
    update_profile_content_moderation_status: "Profile moderation",
    update_report_status: "Report status",
    update_risk_flag_status: "Risk flag status",
    update_story_content_moderation_status: "Story moderation",
    update_verification_request_status: "Verification decision",
    update_feature_flag: "Feature flag toggle",
  };

  return (
    labels[action] ??
    action
      .split("_")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}

function formatAuditMetadata(metadata: AdminAuditLogRow["metadata"]) {
  const value = metadata ?? {};

  if (Object.keys(value).length === 0) {
    return "No metadata";
  }

  return JSON.stringify(value, null, 2);
}

function ReportDismissButton({
  report,
}: {
  report: ReportRow;
}) {
  return (
    <form action={updateReportStatus} className="contents">
      <input type="hidden" name="report_id" value={report.id} />
      <input type="hidden" name="status" value="dismissed" />
      <input type="hidden" name="admin_notes" value={report.admin_notes} />
      <ActionSubmit tone="danger" pendingLabel="Dismissing...">
        Dismiss report
      </ActionSubmit>
    </form>
  );
}

function ReportCard({
  report,
  reporter,
  reportedProfile,
  priorWarningCount,
  returnTo,
  returnView,
}: {
  report: ReportRow;
  reporter?: ProfileRow | null;
  reportedProfile?: ProfileRow | null;
  priorWarningCount: number;
  returnTo: string;
  returnView: "review";
}) {
  return (
    <article
      id={`report-${report.id}`}
      className="scroll-mt-28 rounded-lg border border-[#d7dde2] bg-white p-4 shadow-sm"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-black ${
                report.status === "open"
                  ? "bg-rose-100 text-rose-700"
                  : report.status === "reviewed"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {report.status}
            </span>
            <span className="rounded-full bg-[#eef4f6] px-3 py-1 text-xs font-black text-[#45636f]">
              {report.subject_type}
            </span>
            <span className="rounded-full bg-[#fff5e0] px-3 py-1 text-xs font-black text-[#9a6518]">
              {reportCategoryLabel(report.category)}
            </span>
            <span className="text-xs font-bold text-[#25302d]/42">
              {formatDate(report.created_at)}
            </span>
          </div>

          <h3 className="mt-3 text-lg font-black">{report.reason}</h3>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-[#25302d]/62">
            {report.details || "No extra details."}
          </p>
          <p className="mt-3 text-xs font-bold text-[#25302d]/45">
            Reporter: {profileLabel(reporter)} · Reported:{" "}
            {profileLabel(reportedProfile)}
          </p>
          <p
            className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-black ${
              priorWarningCount > 0
                ? "bg-amber-100 text-amber-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Formal warnings on account: {priorWarningCount}
          </p>
          {report.admin_notes ? (
            <p className="mt-3 rounded-lg bg-[var(--pa-admin-surface-subtle)] p-3 text-xs font-semibold leading-5 text-[var(--pa-admin-muted)]">
              Admin note: {report.admin_notes}
            </p>
          ) : null}
        </div>

        <div className="grid gap-2 sm:flex sm:flex-wrap lg:justify-end">
          <Link
            href={subjectHref(report, returnView, returnTo)}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-center text-xs font-black text-[#25302d]"
          >
            Open subject
          </Link>

          {report.status === "open" && reporter && reportedProfile ? (
            <form
              action={confirmReportViolationAndSeparate}
              className="contents"
            >
              <input type="hidden" name="report_id" value={report.id} />
              <input
                type="hidden"
                name="admin_notes"
                value={report.admin_notes}
              />
              <ActionSubmit
                pendingLabel="Applying safety action..."
                confirmation={{
                  title: "Confirm violation and separate both profiles?",
                  description: `This gives ${profileLabel(reportedProfile)} a formal warning, prevents both members from seeing or contacting each other, and notifies them. It does not suspend or ban the reported account.`,
                  confirmLabel: "Confirm and separate",
                }}
              >
                Confirm violation & separate
              </ActionSubmit>
            </form>
          ) : null}

          <ReportDismissButton report={report} />
        </div>
      </div>
    </article>
  );
}

function RiskFlagDismissButton({
  flag,
}: {
  flag: RiskFlagRow;
}) {
  return (
    <form action={updateRiskFlagStatus} className="contents">
      <input type="hidden" name="flag_id" value={flag.id} />
      <input type="hidden" name="status" value="dismissed" />
      <ActionSubmit tone="danger" pendingLabel="Dismissing...">
        Dismiss signal
      </ActionSubmit>
    </form>
  );
}

function RiskFlagCard({
  flag,
  profile,
  returnTo,
  returnView,
}: {
  flag: RiskFlagRow;
  profile?: ProfileRow | null;
  returnTo: string;
  returnView: "review";
}) {
  const metadata = riskFlagMetadata(flag);

  return (
    <article
      id={`risk-flag-${flag.id}`}
      className="scroll-mt-28 rounded-lg border border-[#d7dde2] bg-white p-4 shadow-sm"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-black ${
                flag.status === "open"
                  ? "bg-rose-100 text-rose-700"
                  : flag.status === "reviewed"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {flag.status}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-black ${
                flag.severity === "high"
                  ? "bg-rose-600 text-white"
                  : flag.severity === "medium"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-sky-100 text-sky-700"
              }`}
            >
              {flag.severity}
            </span>
            <span className="rounded-full bg-[#eef4f6] px-3 py-1 text-xs font-black text-[#45636f]">
              {riskFlagTypeLabel(flag.flag_type)}
            </span>
            <span className="text-xs font-bold text-[#25302d]/42">
              {formatDate(flag.created_at)}
            </span>
          </div>

          <h3 className="mt-3 text-lg font-black">{profileLabel(profile)}</h3>
          <p className="mt-1 truncate text-sm font-bold text-[#25302d]/50">
            {profile?.email ?? "No email"} · {profile?.city ? `${profile.city}, ` : ""}
            {profile?.country ?? "Country not set"}
          </p>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-[#25302d]/62">
            {flag.reason}
          </p>

          {metadata.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {metadata.map(([label, value]) => (
                <span
                  key={label}
                  className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#45636f] ring-1 ring-black/5"
                >
                  {label}: {String(value)}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid gap-2 sm:flex sm:flex-wrap lg:justify-end">
          <Link
            href={withAdminReturnTo(
              `/admin/profiles/${flag.profile_id}?view=${returnView}`,
              returnTo,
            )}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-center text-xs font-black text-[#25302d]"
          >
            Open profile
          </Link>

          <RiskFlagDismissButton flag={flag} />
        </div>
      </div>
    </article>
  );
}

function AdminAuditLogCard({
  entry,
  adminProfile,
  targetProfile,
}: {
  entry: AdminAuditLogRow;
  adminProfile?: ProfileRow | null;
  targetProfile?: ProfileRow | null;
}) {
  const auditAnchor = `audit-${entry.id}`;

  return (
    <article
      id={auditAnchor}
      className="scroll-mt-28 rounded-lg border border-[#d7dde2] bg-white p-4 shadow-sm"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#eef4f6] px-3 py-1 text-xs font-black text-[#45636f]">
              {entry.action}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#45636f] ring-1 ring-black/5">
              {entry.target_resource_type ?? "no resource"}
            </span>
            <span className="text-xs font-bold text-[#25302d]/42">
              {formatDate(entry.created_at)}
            </span>
          </div>

          <h3 className="mt-3 text-lg font-black">
            {adminAuditActionLabel(entry.action)}
          </h3>

          <dl className="mt-3 grid gap-3 text-xs font-bold text-[#25302d]/58 sm:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0 rounded-lg bg-[#f8fafb] p-3 ring-1 ring-[#d7dde2]">
              <dt className="uppercase tracking-[0.12em] text-[#6f8793]">
                Admin profile
              </dt>
              <dd className="mt-1 truncate text-[#25302d]">
                {profileLabel(adminProfile)}
              </dd>
              <dd className="mt-1 truncate font-mono text-[0.68rem] text-[#25302d]/45">
                {entry.admin_profile_id ?? "n/a"}
              </dd>
            </div>

            <div className="min-w-0 rounded-lg bg-[#f8fafb] p-3 ring-1 ring-[#d7dde2]">
              <dt className="uppercase tracking-[0.12em] text-[#6f8793]">
                Target profile
              </dt>
              <dd className="mt-1 truncate text-[#25302d]">
                {entry.target_profile_id
                  ? profileLabel(targetProfile)
                  : "No target profile"}
              </dd>
              <dd className="mt-1 truncate font-mono text-[0.68rem] text-[#25302d]/45">
                {entry.target_profile_id ?? "n/a"}
              </dd>
            </div>

            <div className="min-w-0 rounded-lg bg-[#f8fafb] p-3 ring-1 ring-[#d7dde2]">
              <dt className="uppercase tracking-[0.12em] text-[#6f8793]">
                Resource type
              </dt>
              <dd className="mt-1 truncate text-[#25302d]">
                {entry.target_resource_type ?? "n/a"}
              </dd>
            </div>

            <div className="min-w-0 rounded-lg bg-[#f8fafb] p-3 ring-1 ring-[#d7dde2]">
              <dt className="uppercase tracking-[0.12em] text-[#6f8793]">
                Resource id
              </dt>
              <dd className="mt-1 truncate font-mono text-[0.68rem] text-[#25302d]">
                {entry.target_resource_id ?? "n/a"}
              </dd>
            </div>
          </dl>

          <details className="mt-3 border border-slate-200 bg-slate-50 p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-black text-slate-600">
              <span>Technical metadata</span>
              <span className="rounded-full bg-white px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.12em] text-slate-500 ring-1 ring-slate-200">
                Show details
              </span>
            </summary>
            <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap break-words border-t border-slate-200 pt-3 text-xs font-semibold leading-5 text-[#25302d]/62">
              {formatAuditMetadata(entry.metadata)}
            </pre>
          </details>
        </div>

        {entry.target_profile_id ? (
          <Link
            href={withAdminReturnTo(
              `/admin/profiles/${entry.target_profile_id}?section=activity&view=system`,
              `/admin?view=system#${auditAnchor}`,
            )}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-center text-xs font-black text-[#25302d]"
          >
            Open target
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function FeatureFlagCard({
  flag,
  updatedBy,
}: {
  flag: ResolvedFeatureFlag;
  updatedBy?: ProfileRow | null;
}) {
  const nextEnabled = !flag.enabled;

  return (
    <article className="rounded-lg border border-[#d7dde2] bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-black ${
                flag.effectiveEnabled
                  ? "bg-[#eef4f6] text-[#45636f]"
                  : "bg-[#fff2ed] text-[#9d3f2f]"
              }`}
            >
              Effective {flag.effectiveEnabled ? "on" : "off"}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#45636f] ring-1 ring-black/5">
              DB {flag.enabled ? "enabled" : "disabled"}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-black ${
                flag.fullyLinked
                  ? "bg-[#e8f4ff] text-[#0b5f9f]"
                  : "bg-[#fff9e8] text-[#7a5520]"
              }`}
            >
              {flag.fullyLinked ? "Fully linked" : "Prepared"}
            </span>
            {flag.envOverride ? (
              <span className="rounded-full bg-[#25302d] px-3 py-1 text-xs font-black text-white">
                Env forced {flag.envOverride}
              </span>
            ) : null}
          </div>

          <h3 className="mt-3 truncate font-mono text-lg font-black">
            {flag.key}
          </h3>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[#25302d]/58">
            {flag.description}
          </p>
          <p className="mt-3 text-xs font-bold text-[#25302d]/42">
            Updated {formatDate(flag.updated_at)} by{" "}
            {flag.updated_by ? profileLabel(updatedBy) : "system/default"}
          </p>
        </div>

        <form action={updateFeatureFlag} className="lg:pt-1">
          <input type="hidden" name="key" value={flag.key} />
          <input type="hidden" name="enabled" value={String(nextEnabled)} />
          <FeatureFlagToggleSubmit enabled={flag.enabled} />
        </form>
      </div>
    </article>
  );
}

function ProfileContentReviewCard({
  profile,
  photos,
  expectedVersion,
  returnTo,
}: {
  profile: ProfileRow;
  photos: ContentReviewPhoto[];
  expectedVersion: string;
  returnTo: string;
}) {
  const contentFields = [
    ["Bio", profile.bio],
    ["Childcare experience", profile.childcare_experience],
    ["Children", profile.children_info],
    ["Accommodation", profile.accommodation_info],
    ["Expectations", profile.expectations],
  ] as const;
  const populatedContentFields = contentFields.filter(([, value]) =>
    Boolean(value?.trim()),
  );

  return (
    <article
      id={`content-profile-${profile.id}`}
      className="scroll-mt-28 overflow-hidden rounded-[var(--pa-admin-card-radius)] border border-[var(--pa-admin-border)] bg-white shadow-sm"
    >
      <div className="grid min-w-0 gap-0 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,28rem)]">
        <div className="min-w-0 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
              Decision required
            </span>
            <span className="rounded-full bg-[var(--pa-admin-surface-subtle)] px-2.5 py-1 text-xs font-bold text-[var(--pa-admin-muted)]">
              {profile.account_type === "au_pair" ? "Au pair" : "Family"}
            </span>
            <time
              dateTime={profile.updated_at ?? profile.created_at}
              className="text-xs font-semibold text-[var(--pa-admin-muted)]"
            >
              Updated {formatDate(profile.updated_at ?? profile.created_at)}
            </time>
          </div>

          <h3 className="mt-3 text-lg font-black text-[var(--pa-admin-ink)]">
            {profileLabel(profile)}
          </h3>
          <p className="mt-1 break-words text-sm font-semibold text-[var(--pa-admin-muted)]">
            {[profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
              "No first/last name"}{" "}
            · {profile.city ? `${profile.city}, ` : ""}
            {profile.country ?? "Country not set"} · {profile.email ?? "No email"}
          </p>

          {profile.content_moderation_reason ? (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900 ring-1 ring-amber-100">
              Review reason: {profile.content_moderation_reason}
            </p>
          ) : null}

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {populatedContentFields.length > 0 ? (
              populatedContentFields.map(([label, value]) => (
                <div
                  key={label}
                  className="min-w-0 rounded-xl bg-[var(--pa-admin-surface-subtle)] p-3 ring-1 ring-[var(--pa-admin-border)]"
                >
                  <p className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-[var(--pa-admin-muted)]">
                    {label}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-[var(--pa-admin-ink)]">
                    {value}
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-[var(--pa-admin-border)] p-3 text-sm font-semibold text-[var(--pa-admin-muted)] lg:col-span-2">
                No public profile text was provided. Review the name and photos.
              </p>
            )}
          </div>

          <p className="mt-3 break-all font-mono text-[0.65rem] font-semibold leading-5 text-[var(--pa-admin-muted)]">
            Exact content version: {expectedVersion}
          </p>
        </div>

        <div className="border-t border-[var(--pa-admin-border)] bg-[var(--pa-admin-surface-subtle)] p-4 sm:p-5 xl:border-l xl:border-t-0">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--pa-admin-muted)]">
            Exact photo set · {photos.length}
          </p>
          {photos.length > 0 ? (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-3">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative aspect-square overflow-hidden rounded-lg bg-white ring-1 ring-[var(--pa-admin-border)]"
                >
                  <ProfilePhotoLightbox
                    src={photo.publicUrl}
                    sizes="(min-width: 1280px) 140px, 20vw"
                    className="h-full w-full object-cover"
                    allowRotate
                  />
                  {photo.is_primary ? (
                    <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[0.58rem] font-black uppercase text-white">
                      Main
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-[var(--pa-admin-border)] bg-white p-4 text-sm font-semibold text-[var(--pa-admin-muted)]">
              No profile photos in this version.
            </p>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
            <Link
              href={withAdminReturnTo(
                `/admin/profiles/${profile.id}?section=profile&view=review`,
                returnTo,
              )}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--pa-admin-border)] bg-white px-4 text-center text-sm font-bold text-[var(--pa-admin-ink)]"
            >
              Open member
            </Link>
            <form action={updateProfileContentModerationStatus} className="contents">
              <input type="hidden" name="profile_id" value={profile.id} />
              <input
                type="hidden"
                name="expected_version"
                value={expectedVersion}
              />
              <input type="hidden" name="status" value="approved" />
              <input
                type="hidden"
                name="reason"
                value="Profile text and photos reviewed and approved by admin."
              />
              <ActionSubmit pendingLabel="Approving...">Approve</ActionSubmit>
            </form>
            <form action={updateProfileContentModerationStatus} className="contents">
              <input type="hidden" name="profile_id" value={profile.id} />
              <input
                type="hidden"
                name="expected_version"
                value={expectedVersion}
              />
              <input type="hidden" name="status" value="rejected" />
              <input
                type="hidden"
                name="reason"
                value="Profile text or photos rejected for unsafe or inappropriate content."
              />
              <ActionSubmit
                tone="danger"
                pendingLabel="Rejecting..."
                confirmation={{
                  title: "Reject this profile content?",
                  description:
                    "The exact text and photo version shown here will be rejected. If the member changed anything, the action will stop and require a fresh review.",
                  confirmLabel: "Reject content",
                }}
              >
                Reject
              </ActionSubmit>
            </form>
          </div>
        </div>
      </div>
    </article>
  );
}

function VerificationStatusButton({
  request,
  status,
  children,
  tone = "default",
}: {
  request: VerificationRequestRow;
  status: "verified" | "rejected";
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <form action={updateVerificationRequestStatus} className="contents">
      <input type="hidden" name="request_id" value={request.id} />
      <input type="hidden" name="status" value={status} />
      <ActionSubmit
        tone={tone}
        pendingLabel={status === "verified" ? "Verifying..." : "Rejecting..."}
        confirmation={
          status === "rejected"
            ? {
                title: "Reject this verification selfie?",
                description:
                  "The member will be notified that the photo must be a selfie taken by them while holding the phone, with their face clearly visible, smiling and raising two fingers. They will be able to take a new photo immediately with the live camera.",
                confirmLabel: "Reject and notify",
              }
            : undefined
        }
      >
        {children}
      </ActionSubmit>
    </form>
  );
}

function ProfileVideoModerationCard({
  video,
  owner,
  videoUrl,
  returnTo,
}: {
  video: ProfileVideoRow;
  owner?: ProfileRow;
  videoUrl: string | null | undefined;
  returnTo: string;
}) {
  return (
    <article
      id={`profile-video-${video.id}`}
      className="scroll-mt-28 overflow-hidden rounded-[var(--pa-admin-card-radius)] border border-[var(--pa-admin-border)] bg-white shadow-sm"
    >
      <div className="grid gap-0 lg:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)]">
        <div className="flex min-h-52 items-center bg-black">
          {videoUrl ? (
            <video
              src={videoUrl}
              controls
              preload="none"
              playsInline
              className="aspect-video w-full object-contain"
            />
          ) : (
            <p className="w-full p-6 text-center text-sm font-semibold text-white/65">
              Video preview unavailable
            </p>
          )}
        </div>

        <div className="min-w-0 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
              Pending review
            </span>
            <time
              dateTime={video.created_at}
              className="text-xs font-semibold text-[var(--pa-admin-muted)]"
            >
              {formatDate(video.created_at)}
            </time>
          </div>

          <Link
            href={withAdminReturnTo(
              `/admin/profiles/${video.profile_id}?section=media&view=review`,
              returnTo,
            )}
            className="mt-3 block truncate text-lg font-bold text-[var(--pa-admin-ink)] underline decoration-[var(--pa-admin-border)] underline-offset-4"
          >
            {profileLabel(owner)}
          </Link>
          <p className="mt-1 text-sm font-medium text-[var(--pa-admin-muted)]">
            {video.mime_type}
          </p>
          <p className="mt-3 break-all rounded-lg bg-[var(--pa-admin-surface-subtle)] p-3 font-mono text-xs leading-5 text-[var(--pa-admin-muted)]">
            {video.storage_path}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <form action={updateProfileVideoModerationStatus}>
              <input type="hidden" name="video_id" value={video.id} />
              <input
                type="hidden"
                name="expected_storage_path"
                value={video.storage_path}
              />
              <input type="hidden" name="status" value="approved" />
              <input
                type="hidden"
                name="reason"
                value="Profile video reviewed by admin."
              />
              <ActionSubmit pendingLabel="Approving...">Approve</ActionSubmit>
            </form>
            <form action={updateProfileVideoModerationStatus}>
              <input type="hidden" name="video_id" value={video.id} />
              <input
                type="hidden"
                name="expected_storage_path"
                value={video.storage_path}
              />
              <input type="hidden" name="status" value="rejected" />
              <input
                type="hidden"
                name="reason"
                value="Rejected for explicit or unsafe video content."
              />
              <ActionSubmit tone="danger" pendingLabel="Rejecting...">
                Reject
              </ActionSubmit>
            </form>
            <form action={deleteProfileVideo}>
              <input type="hidden" name="video_id" value={video.id} />
              <ActionSubmit
                tone="danger"
                pendingLabel="Deleting..."
                confirmation={{
                  title: "Delete profile video?",
                  description:
                    "This permanently removes the video from the profile and Storage.",
                  confirmLabel: "Delete video",
                }}
              >
                Delete
              </ActionSubmit>
            </form>
          </div>
        </div>
      </div>
    </article>
  );
}

function StoryModerationCard({
  story,
  owner,
  imageUrl,
  returnTo,
  returnView,
}: {
  story: StoryRow;
  owner?: ProfileRow;
  imageUrl: string | null | undefined;
  returnTo: string;
  returnView: "review";
}) {
  return (
    <article
      id={`story-${story.id}`}
      className="scroll-mt-28 overflow-hidden rounded-lg border border-[#d7dde2] bg-white shadow-sm"
    >
      <div className="relative aspect-square bg-[#f7f3ed]">
        {imageUrl ? (
          <ProfilePhotoLightbox
            src={imageUrl}
            sizes="(min-width: 1024px) 360px, 50vw"
            className="h-full w-full object-contain"
            allowRotate
          />
        ) : null}
      </div>
      <div className="p-4">
        <Link
          href={withAdminReturnTo(
            `/admin/profiles/${story.profile_id}?section=media&view=${returnView}`,
            returnTo,
          )}
          className="block truncate text-sm font-black text-[#45636f] underline decoration-[#45636f]/25 underline-offset-4"
        >
          {profileLabel(owner)}
        </Link>
        <p className="mt-1 text-xs font-bold text-[#25302d]/45">
          {story.content_moderation_status} · Uploaded{" "}
          {formatDate(story.created_at)} · Expires {formatDate(story.expires_at)}
        </p>
        {story.content_moderation_reason ? (
          <p className="mt-2 text-xs font-semibold leading-5 text-[#25302d]/55">
            {story.content_moderation_reason}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {story.content_moderation_status !== "approved" ? (
            <form
              action={updateStoryContentModerationStatus}
              className="contents"
            >
              <input type="hidden" name="story_id" value={story.id} />
              <input type="hidden" name="status" value="approved" />
              <input
                type="hidden"
                name="reason"
                value="Approved by admin story moderation."
              />
              <ActionSubmit pendingLabel="Approving...">Approve</ActionSubmit>
            </form>
          ) : (
            <form
              action={updateStoryContentModerationStatus}
              className="contents"
            >
              <input type="hidden" name="story_id" value={story.id} />
              <input type="hidden" name="status" value="pending" />
              <input
                type="hidden"
                name="reason"
                value="Returned to manual story review."
              />
              <ActionSubmit pendingLabel="Updating...">Review</ActionSubmit>
            </form>
          )}
          {story.content_moderation_status !== "rejected" ? (
            <form
              action={updateStoryContentModerationStatus}
              className="contents"
            >
              <input type="hidden" name="story_id" value={story.id} />
              <input type="hidden" name="status" value="rejected" />
              <input
                type="hidden"
                name="reason"
                value="Rejected by admin story moderation."
              />
              <ActionSubmit tone="danger" pendingLabel="Rejecting...">
                Reject
              </ActionSubmit>
            </form>
          ) : null}
        </div>
        <form action={deleteStory} className="mt-3">
          <input type="hidden" name="story_id" value={story.id} />
          <ActionSubmit
            tone="danger"
            pendingLabel="Deleting..."
            confirmation={{
              title: "Delete story?",
              description:
                "This permanently removes the story. This action cannot be undone.",
              confirmLabel: "Delete story",
            }}
          >
            Delete story
          </ActionSubmit>
        </form>
      </div>
    </article>
  );
}

function VerificationRequestCard({
  request,
  profile,
  returnTo,
}: {
  request: VerificationRequestRow;
  profile?: ProfileRow | null;
  returnTo: string;
}) {
  return (
    <article
      id={`verification-${request.id}`}
      className="scroll-mt-28 rounded-[var(--pa-admin-card-radius)] border border-[var(--pa-admin-border)] bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
              Decision required
            </span>
            <span className="text-xs font-bold text-[var(--pa-admin-muted)]">
              Submitted {formatDate(request.created_at)}
            </span>
          </div>
          <h3 className="mt-2 text-lg font-black text-[var(--pa-admin-ink)]">
            {profileLabel(profile)}
          </h3>
          <p className="mt-1 text-sm font-semibold text-[var(--pa-admin-muted)]">
            {profile?.account_type === "au_pair" ? "Au pair" : "Family"} · {profile?.email ?? "No email"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 xl:justify-end">
            <Link
              href={withAdminReturnTo(
                `/admin/profiles/${request.profile_id}?section=verification&view=review`,
                returnTo,
              )}
              className="inline-flex min-h-10 min-w-[96px] items-center justify-center rounded-lg border border-[#d7dde2] bg-white px-3.5 py-2 text-center text-xs font-black text-[#25302d] transition hover:bg-[#f8fafb]"
            >
              Full member record
            </Link>
            {request.status === "pending" ? (
              <>
                <VerificationStatusButton request={request} status="verified">
                  Mark verified
                </VerificationStatusButton>
                <VerificationStatusButton
                  request={request}
                  status="rejected"
                  tone="danger"
                >
                  Reject invalid selfie
                </VerificationStatusButton>
              </>
            ) : null}
        </div>
      </div>
    </article>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{
    view?: string | string[];
    q?: string | string[];
    type?: string | string[];
    page?: string | string[];
    queue?: string | string[];
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const activeDashboardTab = parseDashboardTab(resolvedSearchParams.view);
  const loadsOverview = activeDashboardTab === "overview";
  const loadsReview = activeDashboardTab === "review";
  const loadsMembers = activeDashboardTab === "members";
  const loadsConversations = activeDashboardTab === "conversations";
  const loadsSystem = activeDashboardTab === "system";
  const reviewQueue = parseReviewQueue(resolvedSearchParams.queue);
  const loadsContentReview = loadsReview && reviewQueue === "content";
  const loadsIdentityReview = loadsReview && reviewQueue === "identity";
  const loadsVideoReview = loadsReview && reviewQueue === "videos";
  const loadsReportsReview = loadsReview && reviewQueue === "reports";
  const loadsStoriesReview = loadsReview && reviewQueue === "stories";
  const memberType = parseMemberType(resolvedSearchParams.type);
  const memberPage = parsePositivePage(resolvedSearchParams.page);
  const rawProfileSearch = Array.isArray(resolvedSearchParams.q)
    ? resolvedSearchParams.q[0]
    : resolvedSearchParams.q;
  const profileSearch = (rawProfileSearch ?? "")
    .replace(/[^\p{L}\p{N}@._+'\- ]/gu, "")
    .trim()
    .slice(0, 100);
  const adminUser = await requireAdminUser();

  if (!isAdminServiceConfigured()) {
    return (
      <AdminWorkspace activeArea="system">
        <AdminPageHeader
          eyebrow="System configuration"
          title="Admin service access is unavailable"
          description="The moderation console needs server-side service role access before it can load private operational data or run admin actions."
        />
      </AdminWorkspace>
    );
  }

  const supabase = createAdminClient();
  const recentVerificationResetsSince = new Date();
  recentVerificationResetsSince.setHours(
    recentVerificationResetsSince.getHours() - 24,
  );
  const nowIso = new Date().toISOString();
  const profileColumns =
    "id, email, account_type, full_name, city, country, public_slug, onboarding_completed, auth_email_confirmed, suspended_at, suspended_until, suspension_rule, suspended_reason, deletion_requested_at, content_moderation_status, content_moderation_needs_review, content_moderation_reviewed_at, content_moderation_reason, created_at";
  const contentReviewProfileColumns =
    "id, email, account_type, full_name, first_name, last_name, bio, childcare_experience, children_info, accommodation_info, expectations, city, country, public_slug, onboarding_completed, auth_email_confirmed, suspended_at, suspended_until, suspension_rule, suspended_reason, deletion_requested_at, content_moderation_status, content_moderation_needs_review, content_moderation_reviewed_at, content_moderation_reason, created_at, updated_at";
  let profilesQuery = supabase
    .from("profiles")
    .select(profileColumns, { count: "exact" })
    .eq("is_admin", false)
    .order("created_at", { ascending: false })
    .range(
      (memberPage - 1) * MEMBER_PAGE_SIZE,
      memberPage * MEMBER_PAGE_SIZE - 1,
    );

  if (memberType === "incomplete") {
    profilesQuery = profilesQuery.eq("onboarding_completed", false);
  }

  if (memberType === "unconfirmed") {
    profilesQuery = profilesQuery.eq("auth_email_confirmed", false);
  }

  if (memberType === "suspended") {
    profilesQuery = profilesQuery.not("suspended_at", "is", null);
  }

  if (memberType === "deletion_pending") {
    profilesQuery = profilesQuery.not("deletion_requested_at", "is", null);
  }

  if (memberType === "family" || memberType === "au_pair") {
    profilesQuery = profilesQuery.eq("account_type", memberType);
  }

  if (memberType === "live_family" || memberType === "live_au_pair") {
    profilesQuery = profilesQuery
      .eq(
        "account_type",
        memberType === "live_family" ? "family" : "au_pair",
      )
      .eq("onboarding_completed", true)
      .not("public_slug", "is", null)
      .is("suspended_at", null)
      .is("deletion_requested_at", null)
      .is("deletion_scheduled_at", null)
      .eq("content_moderation_status", "approved");
  }

  if (activeDashboardTab === "members" && profileSearch) {
    const idFilter =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        profileSearch,
      )
        ? `,id.eq.${profileSearch}`
        : "";
    profilesQuery = profilesQuery.or(
      `full_name.ilike.*${profileSearch}*,email.ilike.*${profileSearch}*${idFilter}`,
    );
  }

  const skippedRowsResult = Promise.resolve({
    data: [],
    error: null,
    count: 0,
  });

  const [
    profilesResult,
    storiesResult,
    profileVideosResult,
    liveFamiliesResult,
    liveAuPairsResult,
    pendingStoriesCountResult,
    pendingProfileVideosCountResult,
    suspendedProfilesResult,
    pendingDeletionProfilesResult,
    conversationsResult,
    verificationRequestsResult,
    pendingVerificationRequestsCountResult,
    profileChangeEventsResult,
    profileChangeEvents24hResult,
    pendingContentProfilesResult,
    pendingContentProfilesCountResult,
    adminAuditLogsResult,
    featureFlagsResult,
    accountLoginIpsResult,
  ] = await Promise.all([
    loadsMembers ? profilesQuery : skippedRowsResult,
    loadsStoriesReview ? supabase
      .from("profile_stories")
      .select("id, profile_id, storage_path, created_at, expires_at, content_moderation_status, content_moderation_reason, profiles!profile_stories_profile_id_fkey!inner(is_admin)")
      .eq("profiles.is_admin", false)
      .eq("content_moderation_status", "pending")
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: true })
      .limit(50) : skippedRowsResult,
    loadsVideoReview ? supabase
      .from("profile_videos")
      .select(
        "id, profile_id, storage_path, mime_type, created_at, content_moderation_status, content_moderation_reason, profiles!profile_videos_profile_id_fkey!inner(is_admin)",
      )
      .eq("profiles.is_admin", false)
      .eq("content_moderation_status", "pending")
      .order("created_at", { ascending: false })
      .limit(50) : skippedRowsResult,
    loadsOverview ? supabase
      .from("admin_live_profiles")
      .select("id", { count: "exact", head: true })
      .eq("account_type", "family") : skippedRowsResult,
    loadsOverview ? supabase
      .from("admin_live_profiles")
      .select("id", { count: "exact", head: true })
      .eq("account_type", "au_pair") : skippedRowsResult,
    supabase
      .from("profile_stories")
      .select("id, profiles!profile_stories_profile_id_fkey!inner(is_admin)", {
        count: "exact",
        head: true,
      })
      .eq("profiles.is_admin", false)
      .eq("content_moderation_status", "pending")
      .gt("expires_at", nowIso),
    supabase
      .from("profile_videos")
      .select("id, profiles!profile_videos_profile_id_fkey!inner(is_admin)", {
        count: "exact",
        head: true,
      })
      .eq("profiles.is_admin", false)
      .eq("content_moderation_status", "pending"),
    loadsOverview ? supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_admin", false)
      .eq("auth_email_confirmed", true)
      .not("suspended_at", "is", null) : skippedRowsResult,
    loadsOverview ? supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_admin", false)
      .eq("auth_email_confirmed", true)
      .not("deletion_requested_at", "is", null) : skippedRowsResult,
    loadsConversations ? supabase
      .from("admin_engaged_conversations")
      .select("id, family_id, au_pair_id, created_at, updated_at, last_message_at")
      .not("last_message_at", "is", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(100) : skippedRowsResult,
    loadsIdentityReview ? supabase
      .from("profile_verification_requests")
      .select(
        "id, profile_id, selfie_path, status, reviewer_note, created_at, reviewed_at, profiles!profile_verification_requests_profile_id_fkey!inner(is_admin)",
      )
      .eq("profiles.is_admin", false)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(VERIFICATION_QUEUE_SIZE) : skippedRowsResult,
    supabase
      .from("profile_verification_requests")
      .select(
        "id, profiles!profile_verification_requests_profile_id_fkey!inner(is_admin)",
        { count: "exact", head: true },
      )
      .eq("profiles.is_admin", false)
      .eq("status", "pending"),
    skippedRowsResult,
    loadsOverview ? supabase
      .from("profile_change_events")
      .select("id", { count: "exact", head: true })
      .eq("caused_verification_reset", true)
      .gte("created_at", recentVerificationResetsSince.toISOString()) : skippedRowsResult,
    loadsContentReview ? supabase
      .from("profiles")
      .select(contentReviewProfileColumns)
      .eq("is_admin", false)
      .eq("auth_email_confirmed", true)
      .eq("onboarding_completed", true)
      .is("deletion_requested_at", null)
      .eq("content_moderation_needs_review", true)
      .order("updated_at", { ascending: true, nullsFirst: true })
      .limit(CONTENT_REVIEW_QUEUE_SIZE) : skippedRowsResult,
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_admin", false)
      .eq("auth_email_confirmed", true)
      .eq("onboarding_completed", true)
      .is("deletion_requested_at", null)
      .eq("content_moderation_needs_review", true),
    loadsSystem ? supabase
      .from("admin_audit_log")
      .select(
        "id, admin_profile_id, action, target_profile_id, target_resource_type, target_resource_id, metadata, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(80) : skippedRowsResult,
    (loadsOverview || loadsSystem) ? supabase
      .from("feature_flags")
      .select("key, enabled, description, updated_at, updated_by")
      .order("key", { ascending: true }) : skippedRowsResult,
    loadsSystem ? supabase
      .from("account_login_ip_history")
      .select(
        "id, profile_id, ip_address, auth_method, first_seen_at, last_seen_at, logged_in_at, login_count",
      )
      .order("logged_in_at", { ascending: false })
      .limit(12) : skippedRowsResult,
  ]);

  let reports: ReportRow[] = [];
  let reportsError: { message?: string } | null = null;
  let reportSchemaNotice: string | null = null;

  let reportsWithCategoryQuery = supabase
    .from("moderation_reports")
    .select(
      "id, reporter_id, subject_type, subject_id, reported_profile_id, category, reason, details, status, admin_notes, created_at",
    );

  reportsWithCategoryQuery = reportsWithCategoryQuery.eq("status", "open");

  const reportsWithCategoryResult = loadsReportsReview
    ? await reportsWithCategoryQuery
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [], error: null };

  if (
    reportsWithCategoryResult.error &&
    isMissingReportCategory(reportsWithCategoryResult.error)
  ) {
    reportSchemaNotice =
      "Report categories are not available from the database schema cache yet. Reports are shown with category Other until the schema refreshes.";

    let fallbackReportsQuery = supabase
      .from("moderation_reports")
      .select(
        "id, reporter_id, subject_type, subject_id, reported_profile_id, reason, details, status, admin_notes, created_at",
      );

    fallbackReportsQuery = fallbackReportsQuery.eq("status", "open");

    const fallbackReportsResult = await fallbackReportsQuery
      .order("created_at", { ascending: false })
      .limit(50);

    reportsError = fallbackReportsResult.error;
    reports = ((fallbackReportsResult.data ?? []) as Omit<
      ReportRow,
      "category"
    >[]).map((report) => ({ ...report, category: "other" }));
  } else {
    reportsError = reportsWithCategoryResult.error;
    reports = (reportsWithCategoryResult.data ?? []) as ReportRow[];
  }

  const openReportsResult = await supabase
    .from("moderation_reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  const reportedProfileIds = Array.from(
    new Set(
      reports
        .map((report) => report.reported_profile_id)
        .filter((profileId): profileId is string => Boolean(profileId)),
    ),
  );
  const moderationWarningsResult = reportedProfileIds.length
    ? await supabase
        .from("profile_moderation_actions")
        .select("profile_id")
        .eq("action_type", "formal_warning")
        .in("profile_id", reportedProfileIds)
    : { data: [], error: null };
  const moderationWarningCounts = new Map<string, number>();

  for (const warning of moderationWarningsResult.data ?? []) {
    moderationWarningCounts.set(
      warning.profile_id,
      (moderationWarningCounts.get(warning.profile_id) ?? 0) + 1,
    );
  }

  let riskFlags: RiskFlagRow[] = [];
  let riskFlagsError: { message?: string } | null = null;
  let openRiskFlagsError: { message?: string } | null = null;
  let openRiskFlagsCount = 0;
  let riskFlagsSchemaNotice: string | null = null;

  let riskFlagsQuery = supabase
    .from("account_risk_flags")
    .select("id, profile_id, flag_type, severity, reason, metadata, status, created_at");

  riskFlagsQuery = riskFlagsQuery.eq("status", "open");

  const riskFlagsResult = loadsReportsReview
    ? await riskFlagsQuery.order("created_at", { ascending: false }).limit(50)
    : { data: [], error: null };

  if (riskFlagsResult.error && isMissingRiskFlagsTable(riskFlagsResult.error)) {
    riskFlagsSchemaNotice =
      "Risk flags are not available from the database schema cache yet. The dashboard can still load the rest of moderation data.";
  } else {
    riskFlagsError = riskFlagsResult.error;
    riskFlags = (riskFlagsResult.data ?? []) as RiskFlagRow[];

    const openRiskFlagsResult = await supabase
      .from("account_risk_flags")
      .select("id", { count: "exact", head: true })
      .eq("status", "open");

    if (
      openRiskFlagsResult.error &&
      isMissingRiskFlagsTable(openRiskFlagsResult.error)
    ) {
      riskFlagsSchemaNotice =
        "Risk flags are not available from the database schema cache yet. The dashboard can still load the rest of moderation data.";
    } else {
      openRiskFlagsError = openRiskFlagsResult.error;
      openRiskFlagsCount = openRiskFlagsResult.count ?? 0;
    }
  }

  let profileChangeEvents: ProfileChangeEventRow[] = [];
  let profileChangeEventsError: { message?: string } | null = null;
  let verificationResets24hError: { message?: string } | null = null;
  let verificationResets24hCount = 0;
  let profileChangeEventsSchemaNotice: string | null = null;

  if (
    (profileChangeEventsResult.error &&
      isMissingProfileChangeEventsTable(profileChangeEventsResult.error)) ||
    (profileChangeEvents24hResult.error &&
      isMissingProfileChangeEventsTable(profileChangeEvents24hResult.error))
  ) {
    profileChangeEventsSchemaNotice =
      "Verification reset history is not available from the database schema cache yet. The dashboard can still load the rest of moderation data.";
  } else {
    profileChangeEventsError = profileChangeEventsResult.error;
    verificationResets24hError = profileChangeEvents24hResult.error;
    profileChangeEvents = (profileChangeEventsResult.data ??
      []) as ProfileChangeEventRow[];
    verificationResets24hCount = profileChangeEvents24hResult.count ?? 0;
  }

  let adminAuditLogs: AdminAuditLogRow[] = [];
  let adminAuditLogsError: { message?: string } | null = null;
  let adminAuditLogSchemaNotice: string | null = null;

  if (
    adminAuditLogsResult.error &&
    isMissingAdminAuditLogTable(adminAuditLogsResult.error)
  ) {
    adminAuditLogSchemaNotice =
      "Admin audit log is not available from the database schema cache yet. The dashboard can still load the rest of moderation data.";
  } else {
    adminAuditLogsError = adminAuditLogsResult.error;
    adminAuditLogs = (adminAuditLogsResult.data ?? []) as AdminAuditLogRow[];
  }

  let featureFlagRows: FeatureFlagRow[] = [];
  let featureFlagsError: { message?: string } | null = null;
  let featureFlagsSchemaNotice: string | null = null;

  if (
    featureFlagsResult.error &&
    isMissingFeatureFlagsTable(featureFlagsResult.error)
  ) {
    featureFlagsSchemaNotice =
      "Feature flags are not available from the database schema cache yet. Default flag values are shown until the schema refreshes.";
  } else {
    featureFlagsError = featureFlagsResult.error;
    featureFlagRows = (featureFlagsResult.data ?? []) as FeatureFlagRow[];
  }

  const featureFlagRowsByKey = new Map(
    featureFlagRows.map((flag) => [flag.key, flag]),
  );
  const featureFlags = (Object.keys(FEATURE_FLAGS) as FeatureFlagKey[]).map(
    (key) => {
      const row = featureFlagRowsByKey.get(key);
      const envOverride = featureFlagEnvOverride(key);
      const enabled = row?.enabled ?? FEATURE_FLAGS[key];

      return {
        key,
        enabled,
        effectiveEnabled:
          envOverride === "enabled"
            ? true
            : envOverride === "disabled"
              ? false
              : enabled,
        description: row?.description || FEATURE_FLAG_DESCRIPTIONS[key],
        updated_at: row?.updated_at ?? null,
        updated_by: row?.updated_by ?? null,
        envOverride,
        fullyLinked: FULLY_LINKED_FEATURE_FLAGS.has(key),
      } satisfies ResolvedFeatureFlag;
    },
  );

  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  const accountLoginIps = (accountLoginIpsResult.data ?? []) as AccountLoginIpRow[];
  const pendingContentProfiles = (pendingContentProfilesResult.data ??
    []) as ProfileRow[];
  const contentProfileIds = pendingContentProfiles.map((profile) => profile.id);
  const contentPhotosResult =
    loadsContentReview && contentProfileIds.length > 0
      ? await supabase
          .from("profile_photos")
          .select("id, profile_id, storage_path, is_primary, created_at")
          .in("profile_id", contentProfileIds)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true })
      : { data: [], error: null };
  const shouldLoadReviewMedia = loadsStoriesReview || loadsVideoReview;

  const photos = (contentPhotosResult.data ?? []) as PhotoRow[];
  const contentPhotosByProfileId = new Map<string, PhotoRow[]>();

  for (const photo of photos) {
    const profilePhotos = contentPhotosByProfileId.get(photo.profile_id) ?? [];
    profilePhotos.push(photo);
    contentPhotosByProfileId.set(photo.profile_id, profilePhotos);
  }

  const contentReviewItems = pendingContentProfiles.map((profile) => {
    const profilePhotos = contentPhotosByProfileId.get(profile.id) ?? [];

    return {
      profile,
      expectedVersion: getProfileContentVersion(
        profile,
        profilePhotos.map((photo) => photo.storage_path),
      ),
      photos: profilePhotos.map((photo) => ({
        ...photo,
        publicUrl: getProfilePhotoPublicUrl(supabase, photo.storage_path),
      })),
    };
  });
  const stories = (storiesResult.data ?? []) as StoryRow[];
  const orderedStories = [...stories].sort((first, second) => {
    if (first.content_moderation_status === second.content_moderation_status) {
      return 0;
    }

    return first.content_moderation_status === "pending" ? -1 : 1;
  });
  const profileVideos = (profileVideosResult.data ?? []) as ProfileVideoRow[];
  const pendingProfileVideos = profileVideos.filter(
    (video) => video.content_moderation_status === "pending",
  );
  const storyUrlById = new Map(
    await Promise.all(
      (shouldLoadReviewMedia ? stories : []).map(async (story) => [
        story.id,
        await getSignedStoryPhotoUrl(supabase, story.storage_path),
      ] as const),
    ),
  );
  const profileVideoUrlById = new Map(
    await Promise.all(
      (shouldLoadReviewMedia ? pendingProfileVideos : []).map(
        async (video) => [
          video.id,
          await getSignedProfileVideoUrl(supabase, video.storage_path),
        ] as const,
      ),
    ),
  );
  const conversations = (conversationsResult.data ?? []) as ConversationRow[];
  const verificationRequests = (verificationRequestsResult.data ??
    []) as VerificationRequestRow[];
  const schemaNotices = [
    reportSchemaNotice,
    riskFlagsSchemaNotice,
    profileChangeEventsSchemaNotice,
    adminAuditLogSchemaNotice,
    featureFlagsSchemaNotice,
  ].filter((message): message is string => Boolean(message));
  const adminErrors = [
    adminQueryError("Profiles", profilesResult.error),
    adminQueryError("Reports", reportsError),
    adminQueryError("Formal warnings", moderationWarningsResult.error),
    adminQueryError("Content review photos", contentPhotosResult.error),
    adminQueryError("Stories", storiesResult.error),
    adminQueryError("Profile videos", profileVideosResult.error),
    adminQueryError("Live families", liveFamiliesResult.error),
    adminQueryError("Live au pairs", liveAuPairsResult.error),
    adminQueryError("Open reports", openReportsResult.error),
    adminQueryError("Risk flags", riskFlagsError),
    adminQueryError("Open risk flags", openRiskFlagsError),
    adminQueryError("Pending stories", pendingStoriesCountResult.error),
    adminQueryError(
      "Pending profile videos",
      pendingProfileVideosCountResult.error,
    ),
    adminQueryError("Suspended profiles", suspendedProfilesResult.error),
    adminQueryError("Conversations", conversationsResult.error),
    adminQueryError("Verification requests", verificationRequestsResult.error),
    adminQueryError(
      "Pending verification count",
      pendingVerificationRequestsCountResult.error,
    ),
    adminQueryError("Verification reset history", profileChangeEventsError),
    adminQueryError("Verification resets 24h", verificationResets24hError),
    adminQueryError("Content review", pendingContentProfilesResult.error),
    adminQueryError(
      "Content review count",
      pendingContentProfilesCountResult.error,
    ),
    adminQueryError("Admin audit log", adminAuditLogsError),
    adminQueryError("Feature flags", featureFlagsError),
    adminQueryError("Account login IPs", accountLoginIpsResult.error),
  ].filter((message): message is string => Boolean(message));

  if (adminErrors.length > 0) {
    console.error("Admin dashboard query errors", adminErrors);
  }

  const profileIds = new Set<string>();

  for (const profile of profiles) profileIds.add(profile.id);
  for (const loginIp of accountLoginIps) profileIds.add(loginIp.profile_id);
  for (const profile of pendingContentProfiles) profileIds.add(profile.id);
  for (const photo of photos) profileIds.add(photo.profile_id);
  for (const story of stories) profileIds.add(story.profile_id);
  for (const video of profileVideos) profileIds.add(video.profile_id);
  for (const flag of riskFlags) profileIds.add(flag.profile_id);
  for (const request of verificationRequests) profileIds.add(request.profile_id);
  for (const event of profileChangeEvents) {
    profileIds.add(event.profile_id);
  }
  for (const entry of adminAuditLogs) {
    if (entry.admin_profile_id) profileIds.add(entry.admin_profile_id);
    if (entry.target_profile_id) profileIds.add(entry.target_profile_id);
  }
  for (const flag of featureFlags) {
    if (flag.updated_by) profileIds.add(flag.updated_by);
  }
  for (const conversation of conversations) {
    profileIds.add(conversation.family_id);
    profileIds.add(conversation.au_pair_id);
  }
  for (const report of reports) {
    if (report.reporter_id) profileIds.add(report.reporter_id);
    if (report.reported_profile_id) profileIds.add(report.reported_profile_id);
  }

  const { data: relatedProfiles, error: relatedProfilesError } = profileIds.size
    ? await supabase
        .from("profiles")
        .select(
          "id, email, account_type, full_name, city, country, public_slug, onboarding_completed, auth_email_confirmed, suspended_at, suspended_until, suspension_rule, suspended_reason, content_moderation_status, content_moderation_needs_review, content_moderation_reviewed_at, content_moderation_reason, created_at",
        )
        .in("id", Array.from(profileIds))
    : { data: [], error: null };

  if (relatedProfilesError) {
    adminErrors.push(`Related profiles: ${relatedProfilesError.message}`);
    console.error("Admin related profiles query error", relatedProfilesError.message);
  }

  const profileMap = new Map(
    ((relatedProfiles ?? []) as ProfileRow[]).map((profile) => [
      profile.id,
      profile,
    ]),
  );
  const conversationsByProfileId = new Map<string, ConversationRow[]>();

  for (const conversation of conversations) {
    for (const profileId of [conversation.family_id, conversation.au_pair_id]) {
      const profileConversations = conversationsByProfileId.get(profileId) ?? [];
      profileConversations.push(conversation);
      conversationsByProfileId.set(profileId, profileConversations);
    }
  }
  const conversationProfileSummaries = Array.from(
    conversationsByProfileId.entries(),
  )
    .map(([profileId, profileConversations]) => ({
      profileId,
      conversationCount: profileConversations.length,
      lastActivityAt: profileConversations.reduce<string | null>(
        (latest, conversation) => {
          const activityAt =
            conversation.last_message_at ??
            conversation.updated_at ??
            conversation.created_at;

          return !latest || activityAt > latest ? activityAt : latest;
        },
        null,
      ),
    }))
    .sort((first, second) =>
      (second.lastActivityAt ?? "").localeCompare(first.lastActivityAt ?? ""),
    )
    .slice(0, CONVERSATION_PROFILE_LIMIT);

  const openReports = reports.filter((report) => report.status === "open");
  const pendingVerificationRequests = verificationRequests.filter(
    (request) => request.status === "pending",
  );
  const disabledFeatureFlagsCount = featureFlags.filter(
    (flag) => !flag.effectiveEnabled,
  ).length;
  const openReportsCount = openReportsResult.count ?? openReports.length;
  const pendingContentProfilesCount =
    pendingContentProfilesCountResult.count ?? pendingContentProfiles.length;
  const pendingVerificationRequestsCount =
    pendingVerificationRequestsCountResult.count ??
    pendingVerificationRequests.length;
  const pendingStoriesCount =
    pendingStoriesCountResult.count ??
    stories.filter((story) => story.content_moderation_status === "pending")
      .length;
  const pendingProfileVideosCount =
    pendingProfileVideosCountResult.count ?? pendingProfileVideos.length;
  const reviewActionableCount =
    pendingContentProfilesCount +
    openReportsCount +
    openRiskFlagsCount +
    pendingVerificationRequestsCount +
    pendingStoriesCount +
    pendingProfileVideosCount;
  const firstAttentionHref =
    pendingContentProfilesCount > 0
      ? reviewQueueHref("content")
      : pendingVerificationRequestsCount > 0
        ? reviewQueueHref("identity")
        : pendingProfileVideosCount > 0
          ? reviewQueueHref("videos")
          : openReportsCount > 0 || openRiskFlagsCount > 0
            ? reviewQueueHref("reports")
            : pendingStoriesCount > 0
              ? reviewQueueHref("stories")
              : adminAreaHref("review");
  const dashboardAreaCounts: Partial<Record<AdminArea, number>> = {
    review: reviewActionableCount,
    system: disabledFeatureFlagsCount,
  };
  const pageHeaderByArea: Record<
    AdminArea,
    { eyebrow: string; title: string; description: string }
  > = {
    overview: {
      eyebrow: "Admin console",
      title: "Overview",
      description:
        "See what needs attention now, then move directly into the relevant workflow.",
    },
    review: {
      eyebrow: "Moderation",
      title: "Review queue",
      description:
        "One place for profile content, identity checks, reports, risk signals and media decisions.",
    },
    members: {
      eyebrow: "Accounts",
      title: "Members",
      description:
        "Find an account, review its status and open the complete member workspace.",
    },
    conversations: {
      eyebrow: "Messages",
      title: "Conversations",
      description:
        "Open recent private chats in the separate read-only moderation view.",
    },
    system: {
      eyebrow: "Operations",
      title: "System",
      description:
        "Manage safety controls, inspect sign-in activity and review the admin audit trail.",
    },
  };
  const pageHeader = pageHeaderByArea[activeDashboardTab];

  return (
    <AdminWorkspace
      activeArea={activeDashboardTab}
      activeHref={
        activeDashboardTab === "review"
          ? reviewQueueHref(reviewQueue)
          : adminAreaHref(activeDashboardTab)
      }
      counts={dashboardAreaCounts}
    >
      <AdminPageHeader
        eyebrow={pageHeader.eyebrow}
        title={pageHeader.title}
        description={pageHeader.description}
        meta={
          <p className="truncate text-xs font-semibold text-[var(--pa-admin-muted)]">
            Signed in as {adminUser.email}
          </p>
        }
        actions={
          activeDashboardTab !== "review" && reviewActionableCount > 0 ? (
            <Link
              href={firstAttentionHref}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--pa-admin-danger)] px-4 text-sm font-bold text-white outline-none transition hover:bg-[#853326] focus-visible:ring-4 focus-visible:ring-[#d95f49]/25"
            >
              Review {reviewActionableCount} open
            </Link>
          ) : null
        }
      />

      <div id="workspace" className="min-w-0 scroll-mt-24">
        <DashboardTabPanel id="overview" activeTab={activeDashboardTab}>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <StatCard
                label="Families live"
                value={liveFamiliesResult.count ?? 0}
                tone="emerald"
                href="/admin?view=members&type=live_family"
              />
              <StatCard
                label="Au pairs live"
                value={liveAuPairsResult.count ?? 0}
                tone="cyan"
                href="/admin?view=members&type=live_au_pair"
              />
              <StatCard
                label="Stories pending"
                value={pendingStoriesCount}
                tone="violet"
                href={reviewQueueHref("stories")}
              />
              <StatCard
                label="Suspended"
                value={suspendedProfilesResult.count ?? 0}
                tone="rose"
                href="/admin?view=members&type=suspended"
              />
              <StatCard
                label="Deletion pending"
                value={pendingDeletionProfilesResult.count ?? 0}
                tone="amber"
                href="/admin?view=members&type=deletion_pending"
              />
          </div>

          <SectionShell
            id="priorities"
            eyebrow="Priorities"
            title="Work queue"
            description="Each item appears once. Start with the first non-empty queue and continue from there."
          >
            <div className="mt-5 divide-y divide-[var(--pa-admin-border)] overflow-hidden rounded-[var(--pa-admin-card-radius)] border border-[var(--pa-admin-border)]">
              {[
                {
                  label: "Profile content",
                  description: "Public text and photos waiting for a safety decision",
                  count: pendingContentProfilesCount,
                  href: reviewQueueHref("content"),
                },
                {
                  label: "Identity verification",
                  description: "Selfie requests that need a manual comparison",
                  count: pendingVerificationRequestsCount,
                  href: reviewQueueHref("identity"),
                },
                {
                  label: "Profile videos",
                  description: "Pending intro videos with exact upload revision",
                  count: pendingProfileVideosCount,
                  href: reviewQueueHref("videos"),
                },
                {
                  label: "Reports and risk",
                  description: "User reports and automated account signals",
                  count: openReportsCount + openRiskFlagsCount,
                  href: reviewQueueHref("reports"),
                },
                {
                  label: "Stories",
                  description: "Active story uploads awaiting moderation",
                  count: pendingStoriesCount,
                  href: reviewQueueHref("stories"),
                },
              ].map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex min-h-16 items-center gap-3 bg-white px-4 py-3 outline-none transition hover:bg-[var(--pa-admin-surface-subtle)] focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[var(--pa-primary-focus-ring)] sm:px-5"
                >
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      item.count > 0
                        ? "bg-[var(--pa-admin-danger)]"
                        : "bg-[var(--pa-admin-success)]"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-[var(--pa-admin-ink)]">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-xs font-medium leading-5 text-[var(--pa-admin-muted)]">
                      {item.description}
                    </span>
                  </span>
                  <span className="inline-flex min-w-9 shrink-0 justify-center rounded-full bg-[var(--pa-admin-surface-subtle)] px-2.5 py-1 text-sm font-bold text-[var(--pa-admin-ink)]">
                    {item.count}
                  </span>
                  <span aria-hidden="true" className="text-[var(--pa-admin-muted)]">
                    →
                  </span>
                </Link>
              ))}
            </div>
          </SectionShell>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link
              href="/admin?view=system#feature-flags"
              className="rounded-[var(--pa-admin-card-radius)] border border-[var(--pa-admin-border)] bg-white p-4 shadow-[var(--pa-admin-shadow)] outline-none focus-visible:ring-4 focus-visible:ring-[var(--pa-primary-focus-ring)]"
            >
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--pa-primary)]">
                System controls
              </p>
              <p className="mt-2 text-lg font-bold text-[var(--pa-admin-ink)]">
                {disabledFeatureFlagsCount} effective flags off
              </p>
            </Link>
            <Link
              href={reviewQueueHref("identity")}
              className="rounded-[var(--pa-admin-card-radius)] border border-[var(--pa-admin-border)] bg-white p-4 shadow-[var(--pa-admin-shadow)] outline-none focus-visible:ring-4 focus-visible:ring-[var(--pa-primary-focus-ring)]"
            >
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--pa-primary)]">
                Identity changes
              </p>
              <p className="mt-2 text-lg font-bold text-[var(--pa-admin-ink)]">
                {verificationResets24hCount} badge resets in 24 hours
              </p>
            </Link>
          </div>
        </DashboardTabPanel>

        {schemaNotices.length > 0 ? (
          <div
            role="status"
            className="mt-5 rounded-lg bg-[#fff9e8] p-5 text-sm font-semibold leading-6 text-[#7a5520] ring-1 ring-[#ffe8ad]"
          >
            <p className="font-black">Database schema is still refreshing.</p>
            <ul className="mt-2 list-inside list-disc">
              {schemaNotices.map((notice) => (
                <li key={notice}>{notice}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {adminErrors.length > 0 ? (
          <div
            role="alert"
            className="mt-5 rounded-lg bg-red-50 p-5 text-sm font-semibold leading-6 text-red-700 ring-1 ring-red-100"
          >
            <p className="font-black">Could not load all admin data.</p>
            <ul className="mt-2 list-inside list-disc">
              {adminErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}

          <DashboardTabPanel id="review" activeTab={activeDashboardTab}>
        <nav
          aria-label="Review queue sections"
          className="sticky top-[3.25rem] z-30 mt-4 flex gap-2 overflow-x-auto rounded-[var(--pa-admin-card-radius)] border border-[var(--pa-admin-border)] bg-white/95 p-2 shadow-[var(--pa-admin-shadow)] backdrop-blur sm:top-[4.25rem]"
        >
          {([
            ["Content", "content", pendingContentProfilesCount],
            ["Identity", "identity", pendingVerificationRequestsCount],
            ["Videos", "videos", pendingProfileVideosCount],
            ["Reports", "reports", openReportsCount + openRiskFlagsCount],
            ["Stories", "stories", pendingStoriesCount],
          ] as const).map(([label, queue, count]) => (
            <Link
              key={queue}
              href={reviewQueueHref(queue)}
              aria-current={reviewQueue === queue ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-bold outline-none transition focus-visible:ring-4 focus-visible:ring-[var(--pa-primary-focus-ring)] ${reviewQueue === queue ? "bg-[var(--pa-admin-ink)] text-white" : "text-[var(--pa-admin-muted)] hover:bg-[var(--pa-admin-surface-subtle)]"}`}
            >
              {label}
              <span className={`rounded-full px-2 py-0.5 text-xs ${reviewQueue === queue ? "bg-white/15 text-white" : "bg-[var(--pa-admin-surface-subtle)] text-[var(--pa-admin-ink)]"}`}>
                {count}
              </span>
            </Link>
          ))}
        </nav>

        {reviewQueue === "content" ? (
          <SectionShell
            id="content-review"
            eyebrow="Profile safety"
            title="Profile content review"
            description={`Review the exact public text and photo set before approving or rejecting it. ${pendingContentProfilesCount > CONTENT_REVIEW_QUEUE_SIZE ? `${pendingContentProfilesCount - CONTENT_REVIEW_QUEUE_SIZE} more remain queued.` : ""}`}
          >
            <div className="mt-5 space-y-4">
              {contentReviewItems.length > 0 ? (
                contentReviewItems.map((item) => (
                  <ProfileContentReviewCard
                    key={item.profile.id}
                    profile={item.profile}
                    photos={item.photos}
                    expectedVersion={item.expectedVersion}
                    returnTo={reviewQueueReturnHref(
                      "content",
                      `content-profile-${item.profile.id}`,
                    )}
                  />
                ))
              ) : (
                <EmptyState>No profile content waiting for review.</EmptyState>
              )}
            </div>
          </SectionShell>
        ) : null}

        {reviewQueue === "identity" ? (
        <>
        <SectionShell
          id="verifications"
          eyebrow="Verifications"
          title="Manual selfie verification"
          description={`Open the full member record to inspect the selfie and profile, then make the decision here. ${pendingVerificationRequestsCount > VERIFICATION_QUEUE_SIZE ? `${pendingVerificationRequestsCount - VERIFICATION_QUEUE_SIZE} more remain queued.` : ""}`}
        >
          <div className="mt-5 space-y-3">
            {pendingVerificationRequests.length > 0 ? (
              pendingVerificationRequests.map((request) => (
                <VerificationRequestCard
                  key={request.id}
                  request={request}
                  profile={profileMap.get(request.profile_id)}
                  returnTo={reviewQueueReturnHref(
                    "identity",
                    `verification-${request.id}`,
                  )}
                />
              ))
            ) : (
              <EmptyState>No pending verification requests.</EmptyState>
            )}
          </div>
        </SectionShell>

        </>
        ) : null}

        {reviewQueue === "videos" ? (
        <SectionShell
          id="profile-videos"
          eyebrow="Media safety"
          title="Profile video review"
          description="Review the exact video and Storage revision before approving or rejecting it."
        >
          <div className="mt-5 space-y-4">
            {pendingProfileVideos.length > 0 ? (
              pendingProfileVideos.map((video) => (
                <ProfileVideoModerationCard
                  key={video.id}
                  video={video}
                  owner={profileMap.get(video.profile_id)}
                  videoUrl={profileVideoUrlById.get(video.id)}
                  returnTo={reviewQueueReturnHref(
                    "videos",
                    `profile-video-${video.id}`,
                  )}
                />
              ))
            ) : (
              <EmptyState>No profile videos waiting for review.</EmptyState>
            )}
          </div>
        </SectionShell>
        ) : null}
          </DashboardTabPanel>

          {reviewQueue === "reports" ? (
          <DashboardTabPanel id="reports" activeTab={activeDashboardTab}>
        <SectionShell
          id="reports"
          eyebrow="Reports"
          title="Report queue"
          description="Open user-submitted reports that still need a moderation decision."
        >
          <div className="mt-5 space-y-3">
            {openReports.length > 0 ? (
              openReports.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  reporter={
                    report.reporter_id
                      ? profileMap.get(report.reporter_id)
                      : null
                  }
                  reportedProfile={
                    report.reported_profile_id
                      ? profileMap.get(report.reported_profile_id)
                      : null
                  }
                  priorWarningCount={
                    report.reported_profile_id
                      ? moderationWarningCounts.get(
                          report.reported_profile_id,
                        ) ?? 0
                      : 0
                  }
                  returnTo={reviewQueueReturnHref(
                    "reports",
                    `report-${report.id}`,
                  )}
                  returnView="review"
                />
              ))
            ) : (
              <EmptyState>No open reports.</EmptyState>
            )}
          </div>
        </SectionShell>

        <SectionShell
          id="risk-flags"
          eyebrow="Risk flags"
          title="Automated account signals"
          description="Internal flags for new accounts that send many messages or contact many people quickly."
        >
          <div className="mt-5 space-y-3">
            {riskFlags.length > 0 ? (
              riskFlags.map((flag) => (
                <RiskFlagCard
                  key={flag.id}
                  flag={flag}
                  profile={profileMap.get(flag.profile_id)}
                  returnTo={reviewQueueReturnHref(
                    "reports",
                    `risk-flag-${flag.id}`,
                  )}
                  returnView="review"
                />
              ))
            ) : (
              <EmptyState>No open risk flags.</EmptyState>
            )}
          </div>
        </SectionShell>
          </DashboardTabPanel>
          ) : null}

          <DashboardTabPanel id="controls" activeTab={activeDashboardTab}>
        <SectionShell
          id="feature-flags"
          eyebrow="Kill switches"
          title="Feature flags"
          description="Toggle DB-backed kill switches without a redeploy. Fully linked flags are enforced by current code; prepared flags exist in DB but are not wired through every related UI/server flow yet."
        >
          <div className="mt-5 grid gap-3 xl:grid-cols-2">
            {featureFlags.map((flag) => (
              <FeatureFlagCard
                key={flag.key}
                flag={flag}
                updatedBy={
                  flag.updated_by ? profileMap.get(flag.updated_by) : null
                }
              />
            ))}
          </div>
        </SectionShell>
          </DashboardTabPanel>

          <DashboardTabPanel id="activity" activeTab={activeDashboardTab}>
        <SectionShell
          id="account-login-ips"
          eyebrow="Account security"
          title="Recent successful logins"
          description="The latest account sign-ins with exact timestamps and IP addresses. Open the full history to search, filter, and navigate every recorded login."
        >
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#edf3f1] p-4 ring-1 ring-black/5">
            <p className="text-sm font-bold text-[#526660]">
              Showing the latest {accountLoginIps.length} login events.
            </p>
            <Link
              href={withAdminReturnTo(
                "/admin/logins",
                "/admin?view=system#account-login-ips",
              )}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#172d28] px-4 text-xs font-black text-white"
            >
              Open full login history →
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {accountLoginIps.length > 0 ? (
              accountLoginIps.map((entry) => {
                const profile = profileMap.get(entry.profile_id);

                return (
                  <article
                    key={entry.id}
                    id={`account-login-${entry.id}`}
                    className="scroll-mt-28 rounded-lg border border-[#d7dde2] bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[#eef4f6] px-3 py-1 text-xs font-black text-[#45636f]">
                            {entry.auth_method === "google"
                              ? "Google"
                              : entry.auth_method === "facebook"
                                ? "Facebook"
                                : "Password"}
                          </span>
                          {entry.login_count > 1 ? (
                            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700 ring-1 ring-amber-200">
                              Historical group · {entry.login_count} logins
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-3 break-all font-mono text-lg font-black text-[#172d28]">
                          {entry.ip_address}
                        </h3>
                        <p className="mt-1 truncate text-sm font-bold text-[#25302d]/55">
                          {profileLabel(profile)} · {profile?.email ?? entry.profile_id}
                        </p>
                        <p className="mt-2 text-xs font-bold text-[#25302d]/38">
                          Successful login · {formatDate(entry.logged_in_at)}
                        </p>
                      </div>
                      {profile ? (
                        <Link
                          href={withAdminReturnTo(
                            `/admin/logins?profile=${entry.profile_id}`,
                            `/admin?view=system#account-login-${entry.id}`,
                          )}
                          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-[#172d28] px-4 py-2 text-center text-xs font-black text-white"
                        >
                          Account logins
                        </Link>
                      ) : null}
                    </div>
                  </article>
                );
              })
            ) : (
              <EmptyState>No successful login IPs recorded yet.</EmptyState>
            )}
          </div>
        </SectionShell>

        <SectionShell
          id="admin-audit-log"
          eyebrow="Audit log"
          title="Admin actions"
          description="Recent admin actions written automatically by moderation, suspension, deletion, password reset, and verification workflows."
        >
          <div className="mt-5 space-y-3">
            {adminAuditLogs.length > 0 ? (
              adminAuditLogs.map((entry) => (
                <AdminAuditLogCard
                  key={entry.id}
                  entry={entry}
                  adminProfile={
                    entry.admin_profile_id
                      ? profileMap.get(entry.admin_profile_id)
                      : null
                  }
                  targetProfile={
                    entry.target_profile_id
                      ? profileMap.get(entry.target_profile_id)
                      : null
                  }
                />
              ))
            ) : (
              <EmptyState>No admin audit entries yet.</EmptyState>
            )}
          </div>
        </SectionShell>

          </DashboardTabPanel>

          <DashboardTabPanel
            id="conversations"
            activeTab={activeDashboardTab}
          >
        <SectionShell
          id="conversations"
          eyebrow="Conversations"
          title="Members with active conversations"
          description={`Profiles are grouped from the latest ${conversations.length} mutual conversations, where both members have sent at least one message.`}
        >
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {conversationProfileSummaries.length > 0 ? (
              conversationProfileSummaries.map((summary) => {
                const profile = profileMap.get(summary.profileId);
                const conversationMemberAnchor = `conversation-member-${summary.profileId}`;

                return (
                  <article
                    key={summary.profileId}
                    id={conversationMemberAnchor}
                    className="scroll-mt-28 rounded-lg border border-[#d7dde2] bg-white p-4 shadow-sm"
                  >
                    <div className="flex h-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[#eef4f6] px-3 py-1 text-xs font-black text-[#45636f]">
                            {profile?.account_type === "family" ? "Family" : "Au pair"}
                          </span>
                          <span className="text-xs font-bold text-[#25302d]/42">
                            Last activity{" "}
                            {formatDate(summary.lastActivityAt)}
                          </span>
                        </div>

                        <h3 className="mt-3 truncate text-lg font-black">
                          {profileLabel(profile)}
                        </h3>
                        <p className="mt-1 truncate text-sm font-bold text-[#25302d]/50">
                          {profile?.email ?? "No email"}
                        </p>
                        <p className="mt-2 text-sm font-black text-[var(--pa-primary)]">
                          {summary.conversationCount} active conversation{summary.conversationCount === 1 ? "" : "s"}
                        </p>
                      </div>

                      <Link
                        href={withAdminReturnTo(
                          `/admin/profiles/${summary.profileId}?section=activity&view=conversations#conversations`,
                          `/admin?view=conversations#${conversationMemberAnchor}`,
                        )}
                        className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-[var(--pa-admin-ink)] px-4 py-2 text-center text-xs font-black text-white"
                      >
                        View conversations
                      </Link>
                    </div>
                  </article>
                );
              })
            ) : (
              <EmptyState>No conversations yet.</EmptyState>
            )}
          </div>
        </SectionShell>
          </DashboardTabPanel>

          <DashboardTabPanel id="profiles" activeTab={activeDashboardTab}>
        <section
          id="profiles"
          className="mt-4 scroll-mt-24"
        >
          <div className="overflow-hidden rounded-[var(--pa-admin-panel-radius)] border border-[var(--pa-admin-border)] bg-white p-4 shadow-[var(--pa-admin-shadow)] sm:p-6">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--pa-primary)]">
              Member directory
            </p>
            <h2 className="mt-1.5 text-xl font-black tracking-[-0.025em] text-[var(--pa-admin-ink)] sm:text-2xl">
              {profileSearch ? "Search results" : "Recent members"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-[var(--pa-admin-muted)]">
              Open the member workspace for private details, media, verification history and all account controls.
            </p>

            <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-end">
              <form
                action="/admin"
                className="grid flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
              >
                <input type="hidden" name="view" value="members" />
                {memberType !== "all" ? (
                  <input type="hidden" name="type" value={memberType} />
                ) : null}
                <label className="min-w-0">
                  <span className="text-xs font-bold text-[var(--pa-admin-muted)]">
                    Search by name, email or account ID
                  </span>
                  <input
                    type="search"
                    name="q"
                    defaultValue={profileSearch}
                    placeholder="Start typing…"
                    className="mt-2 min-h-11 w-full rounded-xl border border-[var(--pa-admin-border)] bg-white px-3 text-base font-medium outline-none transition placeholder:text-[var(--pa-admin-muted)]/55 focus:border-[var(--pa-primary)] focus:ring-4 focus:ring-[var(--pa-primary-focus-ring)]"
                  />
                </label>
                <button
                  type="submit"
                  className="min-h-11 rounded-xl bg-[var(--pa-admin-ink)] px-5 text-sm font-bold text-white outline-none transition hover:bg-[#23463d] focus-visible:ring-4 focus-visible:ring-[var(--pa-primary-focus-ring)]"
                >
                  Search
                </button>
              </form>
              <Link
                href={withAdminReturnTo(
                  "/admin/logins",
                  `${memberDirectoryHref({
                    type: memberType,
                    query: profileSearch,
                    page: memberPage,
                  })}#profiles`,
                )}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--pa-admin-border)] bg-white px-4 text-sm font-bold text-[var(--pa-admin-ink)] outline-none transition hover:bg-[var(--pa-admin-surface-subtle)] focus-visible:ring-4 focus-visible:ring-[var(--pa-primary-focus-ring)]"
              >
                Login history
              </Link>
            </div>

            <nav
              aria-label="Filter member directory by account type"
              className="mt-4 flex gap-2 overflow-x-auto border-b border-[var(--pa-admin-border)] pb-3"
            >
              {([
                ["all", "All members"],
                ["family", "Families"],
                ["au_pair", "Au pairs"],
                ["live_family", "Live families"],
                ["live_au_pair", "Live au pairs"],
                ["incomplete", "Incomplete profiles"],
                ["unconfirmed", "Email unconfirmed"],
                ["suspended", "Suspended"],
                ["deletion_pending", "Deletion pending"],
              ] as const).map(([type, label]) => (
                <Link
                  key={type}
                  href={memberDirectoryHref({ type, query: profileSearch })}
                  aria-current={memberType === type ? "page" : undefined}
                  className={`inline-flex min-h-10 shrink-0 items-center rounded-xl px-4 text-sm font-bold outline-none transition focus-visible:ring-4 focus-visible:ring-[var(--pa-primary-focus-ring)] ${type === "deletion_pending" ? "ml-auto" : ""} ${
                    memberType === type
                      ? "bg-[var(--pa-admin-ink)] text-white"
                      : "bg-[var(--pa-admin-surface-subtle)] text-[var(--pa-admin-muted)] hover:text-[var(--pa-admin-ink)]"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </nav>

            {profileSearch ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--pa-admin-surface-subtle)] px-4 py-3 text-sm font-semibold text-[var(--pa-admin-muted)]">
                <span>
                  {profilesResult.count ?? profiles.length} match
                  {(profilesResult.count ?? profiles.length) === 1 ? "" : "es"}
                </span>
                <Link
                  href={memberDirectoryHref({ type: memberType })}
                  className="font-bold text-[var(--pa-primary)]"
                >
                  Clear search
                </Link>
              </div>
            ) : null}

            <div className="mt-5 space-y-3">
              {profiles.map((profile) => {
                const profileConversations =
                  conversationsByProfileId.get(profile.id) ?? [];
                const memberAnchor = `member-${profile.id}`;
                const memberReturnTo = `${memberDirectoryHref({
                  type: memberType,
                  query: profileSearch,
                  page: memberPage,
                })}#${memberAnchor}`;

                return (
                  <article
                    key={profile.id}
                    id={memberAnchor}
                    className="scroll-mt-28 rounded-lg border border-[#d7dde2] bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#45636f]">
                            {profile.account_type === "au_pair"
                              ? "Au pair"
                              : "Family"}
                          </span>
                          {profile.suspended_at ? (
                            <span className="rounded-full bg-[#fff5f2] px-3 py-1 text-xs font-black text-[#9d3f2f]">
                              Suspended
                            </span>
                          ) : null}
                          {profile.deletion_requested_at ? (
                            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">
                              Deletion pending · hidden
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-3 truncate text-lg font-black">
                          {profileLabel(profile)}
                        </h3>
                        <p className="mt-1 truncate text-sm font-bold text-[#25302d]/50">
                          {profile.city ? `${profile.city}, ` : ""}
                          {profile.country ?? "Country not set"} ·{" "}
                          {profile.email ?? "No email"}
                        </p>
                        <p className="mt-2 text-xs font-bold text-[#25302d]/38">
                          Created {formatDate(profile.created_at)}
                        </p>
                        {profile.suspended_at ? (
                          <p className="mt-2 max-w-xl text-xs font-bold leading-5 text-[#9d3f2f]">
                            Suspended until{" "}
                            {profile.suspended_until
                              ? formatDate(profile.suspended_until)
                              : "manual review"}{" "}
                            {profile.suspended_reason
                              ? `· ${profile.suspended_reason}`
                              : ""}
                          </p>
                        ) : null}
                        {profile.deletion_requested_at ? (
                          <p className="mt-2 max-w-xl text-xs font-bold leading-5 text-amber-800">
                            Account deletion requested {formatDate(profile.deletion_requested_at)}.
                            The profile was hidden immediately.
                          </p>
                        ) : null}

                        {profileConversations.length > 0 ? (
                          <p className="mt-3 text-xs font-semibold text-[var(--pa-admin-muted)]">
                            {profileConversations.length} recent conversation
                            {profileConversations.length === 1 ? "" : "s"}
                          </p>
                        ) : null}
                      </div>

                      <div className="grid shrink-0 gap-2 sm:grid-cols-2 xl:grid-cols-1">
                        <Link
                          href={withAdminReturnTo(
                            `/admin/profiles/${profile.id}?view=members`,
                            memberReturnTo,
                          )}
                          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--pa-admin-border)] bg-white px-4 py-2 text-center text-sm font-bold text-[var(--pa-admin-ink)] outline-none transition hover:bg-[var(--pa-admin-surface-subtle)] focus-visible:ring-4 focus-visible:ring-[var(--pa-primary-focus-ring)]"
                        >
                          Open member
                        </Link>
                        <Link
                          href={withAdminReturnTo(
                            `/admin/profiles/${profile.id}?view=members&edit=1#profile-editor`,
                            memberReturnTo,
                          )}
                          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--pa-admin-ink)] px-4 py-2 text-center text-sm font-bold text-white shadow-sm outline-none transition hover:bg-[#23463d] focus-visible:ring-4 focus-visible:ring-[var(--pa-primary-focus-ring)]"
                        >
                          Edit profile
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
              {profiles.length === 0 ? (
                <EmptyState>No members match this search.</EmptyState>
              ) : null}
            </div>

            {(profilesResult.count ?? 0) > MEMBER_PAGE_SIZE ? (
              <nav
                aria-label="Member directory pagination"
                className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--pa-admin-border)] pt-4"
              >
                {memberPage > 1 ? (
                  <Link
                    href={memberDirectoryHref({ type: memberType, query: profileSearch, page: memberPage - 1 })}
                    className="inline-flex min-h-10 items-center rounded-xl border border-[var(--pa-admin-border)] px-4 text-sm font-bold text-[var(--pa-admin-ink)]"
                  >
                    ← Previous
                  </Link>
                ) : <span />}
                <span className="text-xs font-bold text-[var(--pa-admin-muted)]">
                  Page {memberPage} of {Math.ceil((profilesResult.count ?? 0) / MEMBER_PAGE_SIZE)}
                </span>
                {memberPage * MEMBER_PAGE_SIZE < (profilesResult.count ?? 0) ? (
                  <Link
                    href={memberDirectoryHref({ type: memberType, query: profileSearch, page: memberPage + 1 })}
                    className="inline-flex min-h-10 items-center rounded-xl bg-[var(--pa-admin-ink)] px-4 text-sm font-bold text-white"
                  >
                    Next →
                  </Link>
                ) : <span />}
              </nav>
            ) : null}
          </div>
        </section>
          </DashboardTabPanel>

          {reviewQueue === "stories" ? (
          <DashboardTabPanel id="media" activeTab={activeDashboardTab}>
          <div id="media" className="scroll-mt-28 space-y-5">
            <details
              id="profile-photos"
              className="hidden"
            >
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[var(--pa-primary-focus-ring)] sm:px-6 [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="block text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--pa-primary)]">
                    Media library
                  </span>
                  <span className="mt-1 block text-lg font-bold text-[var(--pa-admin-ink)]">
                    Recent profile photos
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-[var(--pa-admin-surface-subtle)] px-3 py-1.5 text-xs font-bold text-[var(--pa-admin-muted)]">
                  {photos.length} · <span className="group-open:hidden">Open</span>
                  <span className="hidden group-open:inline">Close</span>
                </span>
              </summary>

              <div className="grid gap-3 border-t border-[var(--pa-admin-border)] p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">
                {photos.map((photo) => {
                  const owner = profileMap.get(photo.profile_id);
                  const imageUrl = getProfilePhotoPublicUrl(
                    supabase,
                    photo.storage_path,
                  );

                  return (
                    <article
                      key={photo.id}
                      id={`profile-photo-${photo.id}`}
                      className="scroll-mt-28 overflow-hidden rounded-lg border border-[#d7dde2] bg-white shadow-sm"
                    >
                      <div className="relative aspect-square bg-[#f7f3ed]">
                        <ProfilePhotoLightbox
                          src={imageUrl}
                          sizes="(min-width: 1024px) 360px, 50vw"
                          className="h-full w-full object-contain"
                          allowRotate
                        />
                      </div>
                      <div className="p-4">
                        <Link
                          href={withAdminReturnTo(
                            `/admin/profiles/${photo.profile_id}?section=media&view=review`,
                            reviewQueueReturnHref(
                              "stories",
                              `profile-photo-${photo.id}`,
                            ),
                          )}
                          className="block truncate text-sm font-bold text-[var(--pa-admin-ink)] underline decoration-[var(--pa-admin-border)] underline-offset-4"
                        >
                          {profileLabel(owner)}
                        </Link>
                        <p className="mt-1 text-xs font-bold text-[#25302d]/45">
                          {photo.is_primary
                            ? "Primary photo"
                            : "Additional photo"}
                        </p>
                        <form action={deleteProfilePhoto} className="mt-3">
                          <input
                            type="hidden"
                            name="photo_id"
                            value={photo.id}
                          />
                          <ActionSubmit
                            tone="danger"
                            pendingLabel="Deleting..."
                            confirmation={{
                              title: "Delete profile photo?",
                              description:
                                "This permanently removes the photo. If it is the user's last photo, their profile will stay hidden until they upload a new one.",
                              confirmLabel: "Delete photo",
                            }}
                          >
                            Delete photo
                          </ActionSubmit>
                        </form>
                      </div>
                    </article>
                  );
                })}
              </div>
            </details>

            <section
              id="stories"
              className="scroll-mt-24 overflow-hidden rounded-[var(--pa-admin-panel-radius)] border border-[var(--pa-admin-border)] bg-white p-4 shadow-[var(--pa-admin-shadow)] sm:p-6"
            >
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--pa-primary)]">
                Story safety
              </p>
              <h2 className="mt-1.5 text-xl font-black tracking-[-0.025em] text-[var(--pa-admin-ink)] sm:text-2xl">
                Pending stories
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 text-[var(--pa-admin-muted)]">
                Review the oldest pending story uploads first, with moderation
                and deletion actions in the same place.
              </p>

              {orderedStories.length > 0 ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {orderedStories.map((story) => (
                    <StoryModerationCard
                      key={story.id}
                      story={story}
                      owner={profileMap.get(story.profile_id)}
                      imageUrl={storyUrlById.get(story.id)}
                      returnTo={reviewQueueReturnHref(
                        "stories",
                        `story-${story.id}`,
                      )}
                      returnView="review"
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-5 rounded-xl border border-dashed border-[var(--pa-admin-border)] bg-[var(--pa-admin-surface-subtle)] px-4 py-6 text-center text-sm font-semibold text-[var(--pa-admin-muted)]">
                  No stories waiting for review.
                </p>
              )}
            </section>
          </div>
          </DashboardTabPanel>
          ) : null}
      </div>
    </AdminWorkspace>
  );
}
