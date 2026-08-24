import { Header } from "@/components/layout/Header";
import { LanguageMenu } from "@/components/layout/LanguageMenu";
import { LegalFooter } from "@/components/layout/LegalFooter";
import { AccountResponsivePanels } from "@/components/account/AccountResponsivePanels";
import {
  AccountSectionNav,
  type AccountSectionNavItem,
} from "@/components/account/AccountSectionNav";
import { AccountPhotosManager } from "@/components/profile/AccountPhotosManager";
import { ProfileActivityBadge } from "@/components/profile/ProfileActivityBadge";
import { ProfileCountryFlagBadge } from "@/components/profile/ProfileCountryFlagBadge";
import { ProfilePhotoLightbox } from "@/components/profile/ProfilePhotoLightbox";
import {
  ProfileVideoUploader,
  type ProfileVideo,
} from "@/components/profile/ProfileVideoUploader";
import { ProfileVerificationBadge } from "@/components/profile/ProfileVerificationBadge";
import { ProfileVerificationForm } from "@/components/profile/ProfileVerificationForm";
import { VerificationRejectedGuidance } from "@/components/profile/VerificationRejectedGuidance";
import { AccountStoriesManager } from "@/components/stories/AccountStoriesManager";
import { requestProfileVerification } from "@/app/account/actions";
import { VERIFICATION_SELFIE_REJECTED_REASON } from "@/lib/messages/system-notifications";
import { redirectAdminToDashboard } from "@/lib/admin/access";
import {
  getProfilePhotoPublicUrl,
  getSignedProfileVideoUrl,
  getSignedStoryPhotoUrl,
} from "@/lib/images/storage";
import { getServerTranslator } from "@/lib/i18n/server";
import {
  type I18nKey,
  type LanguageCode,
  formatAge,
  formatAllowance,
  formatChildrenInfo,
  formatCountryName,
  formatDuration,
  formatFamilyDisplayName,
  formatGender as formatLocalizedGender,
  formatLanguageList,
  formatReligion,
  formatSmoking,
  formatStartWindow,
} from "@/lib/i18n/translations";
import { buildStoryHref } from "@/lib/stories/story-links";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "My Profile",
  description: "Manage your Perfect AuPair profile.",
};

function LongText({
  title,
  value,
  editHref,
  editLabel,
}: {
  title: string;
  value?: string | null;
  editHref?: string;
  editLabel?: string;
}) {
  const text = value?.trim();

  return (
    <section className="relative rounded-[1.25rem] border border-[#d6e2e8] bg-white p-4 shadow-sm sm:p-5 lg:rounded-[1.1rem] lg:p-4">
      <div className="flex items-center gap-3">
        <h2 className="pr-12 text-lg font-black tracking-normal text-[#172426]">
          {title}
        </h2>
      </div>
      {editHref ? (
        <Link
          href={editHref}
          prefetch={false}
          aria-label={editLabel}
          title={editLabel}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-[#25302d] shadow-sm transition hover:bg-[#f7f3ed]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.2"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </Link>
      ) : null}
      {text ? (
        <p className="mt-4 max-w-[78ch] whitespace-pre-wrap break-words text-sm font-bold leading-6 text-[#52666f]">
          {text}
        </p>
      ) : (
        <div className="mt-4 min-h-16" aria-hidden="true" />
      )}
    </section>
  );
}

type ProfileIconName =
  | "age"
  | "allowance"
  | "calendar"
  | "check"
  | "children"
  | "clock"
  | "countries"
  | "dash"
  | "driver"
  | "firstAid"
  | "gender"
  | "home"
  | "infant"
  | "languages"
  | "location"
  | "message"
  | "nationality"
  | "photos"
  | "religion"
  | "settings"
  | "smoking"
  | "user"
  | "video";

type ProfileStatus = "check" | "dash";

type ProfileStat = {
  label: string;
  value: ReactNode;
  icon: ProfileIconName;
};

type ProfileFact = ProfileStat & {
  status?: ProfileStatus;
  wide?: boolean;
};

function ProfileIcon({
  name,
  className = "h-4 w-4",
}: {
  name: ProfileIconName;
  className?: string;
}) {
  const commonProps = {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    "aria-hidden": true,
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "age" || name === "user") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="8" r="4" />
        <path d="M5 21a7 7 0 0 1 14 0" />
      </svg>
    );
  }

  if (name === "allowance") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="8" />
        <path d="M9.5 9.5h5" />
        <path d="M9.5 14.5h5" />
        <path d="M8 12h8" />
      </svg>
    );
  }

  if (name === "calendar") {
    return (
      <svg {...commonProps}>
        <rect x="4" y="5" width="16" height="15" rx="3" />
        <path d="M8 3v4" />
        <path d="M16 3v4" />
        <path d="M4 10h16" />
      </svg>
    );
  }

  if (name === "check") {
    return (
      <svg {...commonProps}>
        <path d="m5 12 4 4L19 6" />
      </svg>
    );
  }

  if (name === "children") {
    return (
      <svg {...commonProps}>
        <circle cx="9" cy="8" r="3" />
        <circle cx="16" cy="10" r="2.5" />
        <path d="M4.5 20a4.5 4.5 0 0 1 9 0" />
        <path d="M13.5 20a3.5 3.5 0 0 1 7 0" />
      </svg>
    );
  }

  if (name === "clock") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5l3 2" />
      </svg>
    );
  }

  if (name === "countries") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="8" />
        <path d="M4 12h16" />
        <path d="M12 4a12 12 0 0 1 0 16" />
        <path d="M12 4a12 12 0 0 0 0 16" />
      </svg>
    );
  }

  if (name === "dash") {
    return (
      <svg {...commonProps}>
        <path d="M6 12h12" />
      </svg>
    );
  }

  if (name === "driver") {
    return (
      <svg {...commonProps}>
        <rect x="3.5" y="5" width="17" height="14" rx="3" />
        <path d="M7 14h6" />
        <path d="m7.8 14 .7-2.2a2 2 0 0 1 1.9-1.3h.8a2 2 0 0 1 1.9 1.3l.7 2.2" />
        <circle cx="8.2" cy="15.2" r=".9" />
        <circle cx="12.8" cy="15.2" r=".9" />
        <path d="M15 10h3" />
        <path d="M15 14h2.2" />
      </svg>
    );
  }

  if (name === "firstAid") {
    return (
      <svg {...commonProps}>
        <rect x="5" y="7" width="14" height="12" rx="3" />
        <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
        <path d="M12 11v4" />
        <path d="M10 13h4" />
      </svg>
    );
  }

  if (name === "gender") {
    return (
      <svg {...commonProps}>
        <circle cx="9.5" cy="11.5" r="3.2" />
        <path d="M9.5 14.7v4.3" />
        <path d="M7.2 17h4.6" />
        <circle cx="15.2" cy="8.8" r="2.8" />
        <path d="m17.2 6.8 3.1-3.1" />
        <path d="M18.2 3.7h2.1v2.1" />
      </svg>
    );
  }

  if (name === "home") {
    return (
      <svg {...commonProps}>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
      </svg>
    );
  }

  if (name === "languages" || name === "message") {
    return (
      <svg {...commonProps}>
        <path d="M5 5h9a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h-2l-4 4v-4H5a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z" />
        <path d="M7 9h7" />
        <path d="M7 12h4" />
      </svg>
    );
  }

  if (name === "infant") {
    return (
      <svg {...commonProps}>
        <path d="M12 5.8c0-1.7 1.1-2.8 2.8-2.8" />
        <circle cx="12" cy="12" r="6.2" />
        <path d="M9.2 10.7h.01" />
        <path d="M14.8 10.7h.01" />
        <path d="M10 14.6c1.2.9 2.8.9 4 0" />
        <path d="M7.2 18.3c-1.2.2-2.2 1-2.7 2.2" />
        <path d="M16.8 18.3c1.2.2 2.2 1 2.7 2.2" />
      </svg>
    );
  }

  if (name === "location") {
    return (
      <svg {...commonProps}>
        <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    );
  }

  if (name === "nationality") {
    return (
      <svg {...commonProps}>
        <path d="M6 21V4" />
        <path d="M6 5h11l-2 4 2 4H6" />
      </svg>
    );
  }

  if (name === "photos") {
    return (
      <svg {...commonProps}>
        <rect x="4" y="5" width="14" height="14" rx="3" />
        <path d="M8 13.5 10.5 11l2.5 3 1.5-1.5L18 16" />
        <circle cx="9" cy="9" r="1" />
        <path d="M8 3h10a2 2 0 0 1 2 2v10" />
      </svg>
    );
  }

  if (name === "settings") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2.8v3" />
        <path d="M12 18.2v3" />
        <path d="m4.5 4.5 2.1 2.1" />
        <path d="m17.4 17.4 2.1 2.1" />
        <path d="M2.8 12h3" />
        <path d="M18.2 12h3" />
        <path d="m4.5 19.5 2.1-2.1" />
        <path d="m17.4 6.6 2.1-2.1" />
      </svg>
    );
  }

  if (name === "video") {
    return (
      <svg {...commonProps}>
        <rect x="4" y="6" width="12" height="12" rx="3" />
        <path d="m16 10 4-2.3v8.6L16 14" />
        <path d="M9.5 10.5v3l2.5-1.5-2.5-1.5Z" />
      </svg>
    );
  }

  if (name === "religion") {
    return (
      <svg {...commonProps}>
        <path d="m4 10 8-5 8 5" />
        <path d="M5 10h14" />
        <path d="M7 10v9" />
        <path d="M11 10v9" />
        <path d="M15 10v9" />
        <path d="M19 10v9" />
        <path d="M4 19h16" />
        <path d="M3 21h18" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M8 14h7a3 3 0 0 0 0-6h-2" />
      <path d="M5 14h2" />
      <path d="M18 6c1-1 1-2.5 0-3.5" />
      <path d="M14 6c1-1 1-2.5 0-3.5" />
    </svg>
  );
}

function StatusMark({ status }: { status?: ProfileStatus }) {
  if (!status) return null;

  const isCheck = status === "check";

  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 ${
        isCheck
          ? "bg-[#e7f1f4] text-[#2f6578] ring-[#cbe3ec]"
          : "bg-white text-[#6f8793] ring-[#d6e2e8]"
      }`}
    >
      <ProfileIcon
        name={isCheck ? "check" : "dash"}
        className="h-3.5 w-3.5"
      />
    </span>
  );
}

function statusForBoolean(value: boolean | null | undefined): ProfileStatus {
  return value ? "check" : "dash";
}

function ProfileStatStrip({ items }: { items: ProfileFact[] }) {
  if (items.length === 0) return null;

  return (
    <dl className="grid grid-cols-1 items-start gap-2 min-[360px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className={`min-w-0 self-start rounded-[0.8rem] border border-[#d6e2e8] bg-[#fbfcfb] px-3 py-2.5 ${
            item.wide ? "min-[360px]:col-span-2" : ""
          }`}
        >
          <dt className="text-[0.65rem] font-black uppercase tracking-[0.08em] text-[#52666f]">
            {item.label}
          </dt>
          <dd className="mt-1.5 flex min-w-0 items-center justify-between gap-2 text-sm font-black leading-5 text-[#172426]">
            <span className="min-w-0 break-words">{item.value}</span>
            <StatusMark status={item.status} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function isPresent<T>(item: T | null | undefined): item is T {
  return Boolean(item);
}

type Photo = {
  id: string;
  storage_path: string;
  is_primary: boolean;
  sort_order: number;
};

type AccountStory = {
  id: string;
  storage_path: string;
  created_at: string;
  expires_at: string;
  content_moderation_status: "pending" | "approved" | "rejected";
};

type VerificationRequest = {
  id: string;
  status: "pending" | "verified" | "rejected";
  reviewer_note: string | null;
  created_at: string;
};

function calculateAge(value?: string | null) {
  if (!value) return null;

  const birthDate = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birthDate.getUTCMonth();
  const dayDiff = today.getUTCDate() - birthDate.getUTCDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age;
}

function getActivityStatus(value?: string | null) {
  if (!value) return null;

  const lastActiveAt = new Date(value).getTime();
  if (Number.isNaN(lastActiveAt)) return null;

  const diff = Date.now() - lastActiveAt;
  if (diff <= 5 * 60 * 1000) return "active";
  if (diff <= 24 * 60 * 60 * 1000) return "recently_active";

  return null;
}

const VERIFICATION_FEEDBACK_KEYS = {
  sent: "verification.feedback.sent",
  missing_selfie: "verification.feedback.missingSelfie",
  invalid_type: "verification.feedback.invalidType",
  too_large: "verification.feedback.tooLarge",
  upload_failed: "verification.feedback.uploadFailed",
  try_again: "verification.feedback.tryAgain",
  admin: "verification.feedback.admin",
} satisfies Record<string, I18nKey>;

type VerificationFeedbackCode = keyof typeof VERIFICATION_FEEDBACK_KEYS;

function isVerificationFeedbackCode(
  value: string,
): value is VerificationFeedbackCode {
  return Object.prototype.hasOwnProperty.call(VERIFICATION_FEEDBACK_KEYS, value);
}

function getVerificationFeedbackKey(value?: string) {
  if (!value || !isVerificationFeedbackCode(value)) return null;

  return VERIFICATION_FEEDBACK_KEYS[value] ?? null;
}

function formatCountryList(
  values: string[] | null | undefined,
  locale: LanguageCode,
) {
  const countries = Array.from(
    new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  );

  if (countries.length === 0) return null;

  return countries.map((country) => formatCountryName(country, locale)).join(", ");
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ verification?: string }>;
}) {
  const supabase = await createClient();
  const { locale, t } = await getServerTranslator();
  const params = (await searchParams) ?? {};
  const verificationFeedbackKey = getVerificationFeedbackKey(
    params.verification,
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  redirectAdminToDashboard(user);

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "email, public_slug, account_type, full_name, first_name, last_name, date_of_birth, birth_date, gender, country, city, nationality, preferred_host_countries, religion, already_in_germany, has_drivers_license, has_childcare_experience, has_infant_experience, has_first_aid, will_care_for_elderly, will_care_for_pets, languages, mother_tongue, fluent_languages, basic_languages, availability_start, availability_start_from, availability_start_to, duration, duration_min_months, duration_max_months, smoking_status, bio, children_info, au_pair_allowance_amount, au_pair_allowance_currency, accommodation_info, expectations, onboarding_completed, last_active_at, verification_status, verification_rejected_reason",
    )
    .eq("id", user.id)
    .single();

  if (!error && profile && !profile.onboarding_completed) {
    redirect("/onboarding");
  }


  const isAuPair = profile?.account_type === "au_pair";

  const [
    { data: photos },
    { data: profileVideo },
    { data: activeStories },
    { data: latestVerificationRequest },
  ] = await Promise.all([
    supabase
      .from("profile_photos")
      .select("id, storage_path, is_primary, sort_order")
      .eq("profile_id", user.id)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true }),
    supabase
      .from("profile_videos")
      .select(
        "id, storage_path, mime_type, size_bytes, duration_seconds, width, height, poster_data_url, content_moderation_status",
      )
      .eq("profile_id", user.id)
      .maybeSingle<Omit<ProfileVideo, "signed_url">>(),
    supabase
      .from("profile_stories")
      .select(
        "id, storage_path, created_at, expires_at, content_moderation_status",
      )
      .eq("profile_id", user.id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("profile_verification_requests")
      .select("id, status, reviewer_note, created_at")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<VerificationRequest>(),
  ]);

  const photosWithUrls =
    photos?.map((photo: Photo) => ({
      ...photo,
      public_url: getProfilePhotoPublicUrl(supabase, photo.storage_path),
    })) ?? [];

  const videoWithSignedUrl = profileVideo
    ? {
        ...profileVideo,
        signed_url: await getSignedProfileVideoUrl(
          supabase,
          profileVideo.storage_path,
        ),
      }
    : null;

  if (!error && profile && photosWithUrls.length === 0) {
    redirect("/profile/photos");
  }

  const effectiveVerificationStatus =
    profile?.verification_status === "verified"
      ? "verified"
      : profile?.verification_status === "pending" ||
          latestVerificationRequest?.status === "pending"
        ? "pending"
        : profile?.verification_status;

  const activeStoriesWithUrls = await Promise.all(
    ((activeStories ?? []) as AccountStory[]).map(async (story) => {
      const publicUrl = await getSignedStoryPhotoUrl(
        supabase,
        story.storage_path,
        story.expires_at,
      );

      return publicUrl ? { ...story, public_url: publicUrl } : null;
    }),
  ).then((stories) => stories.filter((story) => story !== null));
  const profileStory =
    activeStoriesWithUrls.find(
      (story) => story.content_moderation_status === "approved",
    ) ?? null;
  const mainPhotoUrl = photosWithUrls[0]?.public_url ?? null;
  const profileAge = calculateAge(profile?.birth_date ?? profile?.date_of_birth);
  const activityStatus = getActivityStatus(profile?.last_active_at);
  const profileDisplayName = isAuPair
    ? profile?.full_name
    : formatFamilyDisplayName(profile?.full_name, locale);
  const profileAllowance = formatAllowance(
    profile?.au_pair_allowance_amount,
    profile?.au_pair_allowance_currency,
    locale,
  );
  const preferredHostCountryList = formatCountryList(
    profile?.preferred_host_countries,
    locale,
  );
  const profileHref = `/profile/${profile?.public_slug ?? user.id}`;
  const locationText =
    [
      profile?.city,
      profile?.country ? formatCountryName(profile.country, locale) : null,
    ]
      .filter(Boolean)
      .join(", ") || t("common.locationNotSet");
  const availabilityText =
    profile?.availability_start_from || profile?.availability_start_to
      ? formatStartWindow(
          locale,
          profile.availability_start_from,
          profile.availability_start_to,
        )
      : profile?.availability_start;
  const durationText =
    profile?.duration_min_months || profile?.duration_max_months
      ? formatDuration(
          locale,
          profile.duration_min_months,
          profile.duration_max_months,
        )
      : profile?.duration;
  const genderText = formatLocalizedGender(profile?.gender, locale);
  const nationalityText = profile?.nationality
    ? formatCountryName(profile.nationality, locale)
    : null;
  const smokingText = profile?.smoking_status
    ? formatSmoking(profile.smoking_status, locale)
    : null;
  const profileLanguageSummary = Array.from(
    new Set(
      [
        profile?.mother_tongue,
        ...(profile?.fluent_languages ?? []),
        ...(profile?.basic_languages ?? []),
      ]
        .map((language) => language?.trim())
        .filter((language): language is string => Boolean(language)),
    ),
  );
  const languageSummary =
    profileLanguageSummary.length > 0
      ? formatLanguageList(profileLanguageSummary, locale)
      : null;
  const heroStatDetails: ProfileStat[] = ([
    isAuPair && profileAge
      ? {
          label: t("common.age"),
          value: formatAge(profileAge, locale),
          icon: "age",
        }
      : null,
    isAuPair && genderText
      ? {
          label: t("common.gender"),
          value: genderText,
          icon: "gender",
        }
      : null,
    isAuPair && nationalityText
      ? {
          label: t("common.nationality"),
          value: nationalityText,
          icon: "nationality",
        }
      : null,
    !isAuPair && profile?.children_info
      ? {
          label: t("common.children"),
          value: formatChildrenInfo(profile.children_info, locale),
          icon: "children",
        }
      : null,
    !isAuPair && profileAllowance
      ? {
          label: t("common.monthlyAllowance"),
          value: profileAllowance,
          icon: "allowance",
        }
      : null,
    !isAuPair && profile?.religion
      ? {
          label: t("common.religion"),
          value: formatReligion(profile.religion, locale),
          icon: "religion",
        }
      : null,
  ] as Array<ProfileStat | null>).filter(isPresent);
  const heroFactDetails: ProfileFact[] = ([
    availabilityText
      ? {
          label: t("common.availability"),
          value: availabilityText,
          icon: "calendar",
        }
      : null,
    durationText
      ? {
          label: t("common.duration"),
          value: durationText,
          icon: "clock",
        }
      : null,
    isAuPair && preferredHostCountryList
      ? {
          label: t("common.preferredHostCountries"),
          value: preferredHostCountryList,
          icon: "countries",
          wide: true,
        }
      : null,
    isAuPair
      ? {
          label: t("common.alreadyInGermany"),
          value: profile?.already_in_germany ? t("common.yes") : t("common.no"),
          icon: "location",
          status: statusForBoolean(profile?.already_in_germany),
        }
      : null,
    isAuPair && smokingText
      ? {
          label: t("common.smoking"),
          value: smokingText,
          icon: "smoking",
        }
      : null,
    isAuPair && profile?.religion
      ? {
          label: t("common.religion"),
          value: formatReligion(profile.religion, locale),
          icon: "religion",
        }
      : null,
    languageSummary
      ? {
          label: t("common.languages"),
          value: languageSummary,
          icon: "languages",
          wide: true,
        }
      : null,
    isAuPair
      ? {
          label: t("common.childcareExperience"),
          value: profile?.has_childcare_experience
            ? t("common.yes")
            : t("common.no"),
          icon: "children",
          status: statusForBoolean(profile?.has_childcare_experience),
        }
      : null,
    isAuPair
      ? {
          label: t("common.driversLicense"),
          value: profile?.has_drivers_license ? t("common.yes") : t("common.no"),
          icon: "driver",
          status: statusForBoolean(profile?.has_drivers_license),
        }
      : null,
    isAuPair
      ? {
          label: t("common.infantExperience"),
          value: profile?.has_infant_experience ? t("common.yes") : t("common.no"),
          icon: "infant",
          status: statusForBoolean(profile?.has_infant_experience),
        }
      : null,
    isAuPair
      ? {
          label: t("common.firstAid"),
          value: profile?.has_first_aid ? t("common.yes") : t("common.no"),
          icon: "firstAid",
          status: statusForBoolean(profile?.has_first_aid),
        }
      : null,
    isAuPair
      ? {
          label: t("common.elderlyCare"),
          value: profile?.will_care_for_elderly
            ? t("common.yes")
            : t("common.no"),
          icon: "user",
          status: statusForBoolean(profile?.will_care_for_elderly),
        }
      : null,
    isAuPair
      ? {
          label: t("common.petCare"),
          value: profile?.will_care_for_pets ? t("common.yes") : t("common.no"),
          icon: "home",
          status: statusForBoolean(profile?.will_care_for_pets),
        }
      : null,
  ] as Array<ProfileFact | null>).filter(isPresent);
  const completionItems = [
    {
      label: t("account.profilePhoto"),
      done: photosWithUrls.length > 0,
    },
    {
      label: t("common.location"),
      done: Boolean(profile?.city && profile?.country),
    },
    {
      label: t("common.availability"),
      done: Boolean(
        profile?.availability_start_from && profile?.availability_start_to,
      ),
    },
    {
      label: t("common.duration"),
      done: Boolean(profile?.duration_min_months && profile?.duration_max_months),
    },
    ...(isAuPair
      ? [
          {
            label: t("common.preferredHostCountries"),
            done: Boolean(profile?.preferred_host_countries?.length),
          },
        ]
      : []),
    {
      label: t("account.writtenProfile"),
      done: Boolean(profile?.bio?.trim()),
    },
    {
      label: t("verification.verifiedProfile"),
      done: profile?.verification_status === "verified",
    },
  ];
  const completedItems = completionItems.filter((item) => item.done).length;
  const completionPercent = Math.round(
    (completedItems / completionItems.length) * 100,
  );
  const profileOverviewStats: ProfileFact[] = [
    ...heroStatDetails,
    ...heroFactDetails,
  ];
  const profileTextNavLabel = isAuPair
    ? t("common.introduction")
    : t("common.familyIntroduction");
  const accountNavItems: AccountSectionNavItem[] = [
    {
      href: "#account-overview",
      label: t("account.yourAccount"),
    },
    {
      href: "#profile-verification",
      label: t("verification.title"),
    },
    {
      href: "#active-stories",
      label: t("common.stories"),
    },
    {
      href: "#photos",
      label: t("common.photos"),
    },
    {
      href: "#intro-video",
      label: t("common.video"),
    },
    {
      href: "#profile-text",
      label: profileTextNavLabel,
    },
    {
      href: "/account/settings",
      label: t("account.manageSettings"),
      external: true,
    },
  ];

  if (error) {
    console.error("Could not load account profile.", error);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--background)] text-[#25302d]">
      <Header
        subtitle="account.yourAccount"
        authState="authenticated"
        accountType={profile?.account_type ?? null}
        initialProfilePhotoUrl={mainPhotoUrl}
      />

      <section className="mx-auto w-full max-w-[76rem] px-3 py-4 sm:px-6 sm:py-6 lg:py-7">
        {error ? (
          <div className="rounded-2xl bg-red-50 p-5 text-sm font-semibold text-red-700">
            {t("common.errorTryAgain")}
          </div>
        ) : (
          <div className="w-full max-w-full">
            <div className="mb-4 hidden items-center justify-between gap-4 border-b border-[#d6e2e8] px-1 pb-3 lg:flex">
              <h1 className="text-xl font-black tracking-normal text-[#172426]">
                {t("account.yourAccount")}
              </h1>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--pa-primary)]">
                {t("account.manageSettings")}
              </p>
            </div>

            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
              <section className="rounded-[1.25rem] border border-[#d6e2e8] bg-white p-4 shadow-sm lg:hidden">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-[#ede7df] ring-1 ring-[#d6e2e8]">
                    {mainPhotoUrl ? (
                      <ProfilePhotoLightbox
                        src={mainPhotoUrl}
                        className="h-full w-full object-cover"
                        sizes="80px"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-lg font-black text-[#25302d]/25">
                        PA
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h1 className="min-w-0 truncate text-xl font-black tracking-normal text-[#172426]">
                        {profileDisplayName ??
                          (isAuPair ? t("common.auPair") : t("common.hostFamily"))}
                      </h1>
                      <ProfileVerificationBadge
                        status={effectiveVerificationStatus}
                        label={t("verification.verified")}
                      />
                    </div>
                    <p className="mt-1 flex min-w-0 items-center gap-2 text-sm font-bold text-[#52666f]">
                      <span className="min-w-0 truncate">{locationText}</span>
                      <ProfileCountryFlagBadge
                        country={profile?.country}
                        label={
                          profile?.country
                            ? `${t("common.location")}: ${formatCountryName(
                                profile.country,
                                locale,
                              )}`
                            : undefined
                        }
                      />
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Link
                    href={profileHref}
                    prefetch={false}
                    className="inline-flex h-10 items-center justify-center rounded-[0.7rem] bg-[var(--pa-primary)] px-3 text-center text-sm font-black text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)]"
                  >
                    {t("account.viewPublicProfile")}
                  </Link>
                  <Link
                    href="/onboarding"
                    prefetch={false}
                    className="inline-flex h-10 items-center justify-center rounded-[0.7rem] border border-[#9fb1ba] bg-white px-3 text-center text-sm font-black text-[#25302d] transition hover:bg-[#f4f8fa]"
                  >
                    {t("account.editProfile")}
                  </Link>
                </div>
              </section>

              <aside className="hidden min-w-0 max-w-full lg:sticky lg:top-28 lg:block lg:self-start">
                <div className="min-w-0 max-w-full overflow-hidden rounded-[1.1rem] border border-[#d6e2e8] bg-white p-3 shadow-sm">
                  <div className="relative mx-auto aspect-square w-full max-w-[18rem] overflow-hidden rounded-[0.9rem] bg-[#ede7df] lg:max-w-none">
                    {mainPhotoUrl ? (
                      <ProfilePhotoLightbox
                        src={mainPhotoUrl}
                        className="h-full w-full object-cover"
                        sizes="(min-width: 1280px) 260px, (min-width: 1024px) 240px, (min-width: 640px) 320px, calc(100vw - 64px)"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-5xl font-black text-[#25302d]/20">
                        PA
                      </div>
                    )}

                    {profileStory ? (
                      <Link
                        href={buildStoryHref(profileStory.id, "/account")}
                        prefetch={false}
                        className="absolute right-3 top-3 rounded-full bg-white/95 px-3 py-2 text-xs font-black text-[#25302d] shadow-sm ring-1 ring-black/10 backdrop-blur transition hover:bg-white"
                        aria-label={t("stories.open")}
                      >
                        {t("common.story")}
                      </Link>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    <p className="text-base font-black leading-5 text-[#172426]">
                      {profileDisplayName ??
                        (isAuPair ? t("common.auPair") : t("common.hostFamily"))}
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-sm font-bold leading-5 text-[#52666f]">
                      <span className="min-w-0 break-words">{locationText}</span>
                      <ProfileCountryFlagBadge
                        country={profile?.country}
                        label={
                          profile?.country
                            ? `${t("common.location")}: ${formatCountryName(
                                profile.country,
                                locale,
                              )}`
                            : undefined
                        }
                      />
                    </p>
                  </div>

                  <AccountSectionNav
                    ariaLabel={t("account.yourAccount")}
                    items={accountNavItems}
                  />
                </div>
              </aside>

              <AccountResponsivePanels
                ariaLabel={t("account.yourAccount")}
                panels={[
                  {
                    id: "profile",
                    label: t("common.profile"),
                    children: (
                      <>
                        <section
                  id="account-overview"
                  className="hidden scroll-mt-24 rounded-[1.1rem] border border-[#d6e2e8] bg-white p-4 shadow-sm lg:block"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <ProfileActivityBadge
                        status={activityStatus}
                        t={t}
                        className="shadow-none"
                      />
                      <h2 className="mt-3 flex min-w-0 flex-wrap items-center gap-3 break-words text-3xl font-black tracking-normal text-[#172426]">
                        <span>
                          {profileDisplayName ??
                            (isAuPair ? t("common.auPair") : t("common.hostFamily"))}
                        </span>
                        <ProfileVerificationBadge
                          status={effectiveVerificationStatus}
                          label={t("verification.verified")}
                        />
                      </h2>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Link
                        href={profileHref}
                        prefetch={false}
                        className="inline-flex h-10 items-center justify-center rounded-[0.7rem] bg-[var(--pa-primary)] px-5 text-sm font-black text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)]"
                      >
                        {t("account.viewPublicProfile")}
                      </Link>
                      <Link
                        href="/onboarding"
                        prefetch={false}
                        className="inline-flex h-10 items-center justify-center rounded-[0.7rem] border border-[#9fb1ba] bg-white px-5 text-sm font-black text-[#25302d] transition hover:bg-[#f4f8fa]"
                      >
                        {t("account.editProfile")}
                      </Link>
                    </div>
                  </div>

                  {profileOverviewStats.length > 0 ? (
                    <div className="mt-4">
                      <ProfileStatStrip items={profileOverviewStats} />
                    </div>
                  ) : null}
                </section>

                <section className="rounded-[1.25rem] border border-[#d6e2e8] bg-white p-4 shadow-sm sm:p-5 lg:rounded-[1.1rem] lg:p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-black tracking-normal text-[#172426]">
                        {t("account.profileCompleteness")}
                      </h2>
                      <p className="mt-1 text-sm font-bold text-[#52666f]">
                        {t("account.essentialsCompleted", {
                          done: completedItems,
                          total: completionItems.length,
                        })}
                      </p>
                    </div>
                    <span className="text-2xl font-black text-[#172426]">
                      {completionPercent}%
                    </span>
                  </div>

                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#e7f1f4]">
                    <div
                      className="h-full rounded-full bg-[#b8d7df]"
                      style={{ width: `${completionPercent}%` }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {completionItems.map((item) => (
                      <span
                        key={item.label}
                        className={`rounded-full px-2.5 py-1 text-xs font-black ${
                          item.done
                            ? "bg-[#e7f1f4] text-[#0b5f9f]"
                            : "bg-[#fff2ed] text-[#9d3f2f]"
                        }`}
                      >
                        {item.done
                          ? t("account.done", { label: item.label })
                          : t("account.missing", { label: item.label })}
                      </span>
                    ))}
                  </div>
                </section>

                <section
                  id="profile-verification"
                  className="scroll-mt-24 rounded-[1.25rem] border border-[#d6e2e8] bg-white p-4 shadow-sm sm:p-5 lg:rounded-[1.1rem] lg:p-4"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="max-w-2xl">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-xl font-black tracking-normal text-[#172426]">
                          {t("verification.title")}
                        </h2>
                        <ProfileVerificationBadge
                          status={effectiveVerificationStatus}
                          label={t("verification.verified")}
                        />
                      </div>
                      <p className="mt-2 text-sm font-bold leading-6 text-[#52666f]">
                        {effectiveVerificationStatus === "verified"
                          ? t("verification.approvedHelp")
                          : effectiveVerificationStatus === "pending"
                            ? t("verification.pendingHelp")
                            : effectiveVerificationStatus === "rejected"
                              ? t("verification.rejectedHelp")
                              : t("verification.requestHelp")}
                      </p>
                      {effectiveVerificationStatus === "rejected" ? (
                        <VerificationRejectedGuidance
                          fullFaceLabel={t(
                            "verification.requirement.fullFace",
                          )}
                          smileLabel={t("verification.requirement.smile")}
                          twoFingersLabel={t(
                            "verification.requirement.twoFingers",
                          )}
                          imageAlt={t("verification.exampleSelfieAlt")}
                        />
                      ) : null}
                      {latestVerificationRequest?.reviewer_note ? (
                        latestVerificationRequest.reviewer_note ===
                        VERIFICATION_SELFIE_REJECTED_REASON ? null : (
                          <p className="mt-2 text-sm font-bold text-[#9d3f2f]">
                            {latestVerificationRequest.reviewer_note}
                          </p>
                        )
                      ) : null}
                      {verificationFeedbackKey ? (
                        <p
                          className={`mt-3 rounded-[0.8rem] px-4 py-3 text-sm font-black ${
                            params.verification === "sent"
                              ? "bg-[#e7f1f4] text-[#0b5f9f]"
                              : "bg-[#fff2ed] text-[#9d3f2f]"
                          }`}
                        >
                          {t(verificationFeedbackKey)}
                        </p>
                      ) : null}
                    </div>

                    {effectiveVerificationStatus !== "verified" &&
                    effectiveVerificationStatus !== "pending" ? (
                      <ProfileVerificationForm
                        action={requestProfileVerification}
                        selfieLabel={t("verification.selfieLabel")}
                        openCameraLabel={t("verification.openCamera")}
                        takePhotoLabel={t("verification.takePhoto")}
                        retakePhotoLabel={t("verification.retakePhoto")}
                        requestButtonLabel={t("verification.requestButton")}
                        missingSelfieMessage={t(
                          "verification.feedback.missingSelfie",
                        )}
                        invalidTypeMessage={t(
                          "verification.feedback.invalidType",
                        )}
                        tooLargeMessage={t("verification.feedback.tooLarge")}
                        uploadFailedMessage={t(
                          "verification.feedback.uploadFailed",
                        )}
                        cameraUnavailableMessage={t(
                          "verification.feedback.cameraUnavailable",
                        )}
                        cameraPermissionMessage={t(
                          "verification.feedback.cameraPermission",
                        )}
                      />
                    ) : null}
                  </div>
                </section>

                      </>
                    ),
                  },
                  {
                    id: "stories",
                    label: t("common.stories"),
                    children: (
                      <AccountStoriesManager
                        initialStories={activeStoriesWithUrls}
                      />
                    ),
                  },
                  {
                    id: "photos",
                    label: t("common.photos"),
                    children: (
                      <>

                <div id="photos" className="scroll-mt-24">
                  <AccountPhotosManager
                    initialPhotos={photosWithUrls}
                    isPhotoRequired
                  />
                </div>

                <div id="intro-video" className="scroll-mt-24">
                  <ProfileVideoUploader
                    profileId={user.id}
                    initialVideo={videoWithSignedUrl}
                  />
                </div>
                      </>
                    ),
                  },
                  {
                    id: "intro",
                    label: profileTextNavLabel,
                    children: (

                <div id="profile-text" className="scroll-mt-24 space-y-4">
                  {isAuPair ? (
                    <LongText
                      title={t("common.introduction")}
                      value={profile?.bio}
                      editHref="/onboarding#au-pair-introduction"
                      editLabel={t("account.editProfile")}
                    />
                  ) : (
                    <>
                      <LongText
                        title={t("common.familyIntroduction")}
                        value={profile?.bio}
                        editHref="/onboarding#family-introduction"
                        editLabel={t("account.editProfile")}
                      />
                      <LongText
                        title={t("common.accommodation")}
                        value={profile?.accommodation_info}
                        editHref="/onboarding#accommodation"
                        editLabel={t("account.editProfile")}
                      />
                      <LongText
                        title={t("common.expectations")}
                        value={profile?.expectations}
                        editHref="/onboarding#expectations"
                        editLabel={t("account.editProfile")}
                      />
                    </>
                  )}
                </div>
                    ),
                  },
                  {
                    id: "settings",
                    label: t("account.settingsShort"),
                    children: (
                      <section className="rounded-[1.25rem] border border-[#d6e2e8] bg-white p-4 shadow-sm lg:hidden">
                        <div>
                          <h2 className="text-xl font-black tracking-normal text-[#172426]">
                            {t("account.manageSettings")}
                          </h2>
                          <p className="mt-1 text-sm font-bold leading-6 text-[#52666f]">
                            {t("account.settingsDescription")}
                          </p>
                        </div>

                        <Link
                          href="/account/settings"
                          prefetch={false}
                          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-[0.8rem] bg-[var(--pa-primary)] px-4 text-sm font-black text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)]"
                        >
                          {t("account.manageSettings")}
                        </Link>

                        <div className="mt-5 border-t border-[#d6e2e8] pt-4">
                          <LanguageMenu variant="menu" />
                        </div>

                        <div className="mt-4 border-t border-[#d6e2e8] pt-3">
                          <form action="/auth/signout" method="post">
                            <button
                              type="submit"
                              className="flex h-11 w-full items-center justify-center rounded-[0.8rem] bg-[#fff0e9] px-4 text-sm font-black text-[#8f3e28] transition hover:bg-[#ffe4d8]"
                            >
                              {t("nav.logout")}
                            </button>
                          </form>
                        </div>
                      </section>
                    ),
                  },
                ]}
              />
            </div>
          </div>
        )}
      </section>

      <LegalFooter />
    </main>
  );
}
