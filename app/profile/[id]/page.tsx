import { Header } from "@/components/layout/Header";
import { LegalFooter } from "@/components/layout/LegalFooter";
import { GuestProfilePhotoPrompt } from "@/components/profile/GuestProfileLoginPrompt";
import { AlreadyInGermanyBadge } from "@/components/profile/AlreadyInGermanyBadge";
import { ProfileActivityBadge } from "@/components/profile/ProfileActivityBadge";
import { ProfileCountryFlagBadge } from "@/components/profile/ProfileCountryFlagBadge";
import { SaveProfileButton } from "@/components/profile/SaveProfileButton";
import { ProfilePhotoLightbox } from "@/components/profile/ProfilePhotoLightbox";
import { ProfileIntroVideo } from "@/components/profile/ProfileIntroVideo";
import { ProfileScrollReset } from "@/components/profile/ProfileScrollReset";
import { ProfileStoryIndicator } from "@/components/profile/ProfileStoryIndicator";
import { ProfileVerificationBadge } from "@/components/profile/ProfileVerificationBadge";
import { loginHref } from "@/lib/auth/return-to";
import { createProfileViewInterestNotification } from "@/lib/email/profile-notifications";
import { isAdminEmail } from "@/lib/admin/access";
import {
  getSignedProfileVideoUrl,
  getSignedStoryPhotoUrl,
} from "@/lib/images/storage";
import { isProfilePairBlocked } from "@/lib/profile/blocks";
import {
  getPrimaryProfilePhotoUrl,
  getProfilePhotoUrl,
} from "@/lib/profile/photos";
import { buildReportHref } from "@/lib/reporting";
import { buildStoryHref } from "@/lib/stories/story-links";
import { createClient } from "@/lib/supabase/server";
import { getServerTranslator } from "@/lib/i18n/server";
import { SITE_URL } from "@/lib/site";
import {
  DEFAULT_LANGUAGE,
  formatAge,
  formatAllowance,
  formatChildrenInfo,
  formatCountryName,
  formatDuration,
  formatFamilyDisplayName,
  formatLanguageList,
  formatReligion,
  formatSmoking,
  formatStartWindow as formatLocalizedStartWindow,
} from "@/lib/i18n/translations";
import Link from "next/link";
import type { Metadata } from "next";
import { cache, type ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";

type PublicProfile = {
  id: string;
  public_slug?: string | null;
  account_type: "family" | "au_pair";
  full_name: string | null;
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
  age: number | null;
  bio: string | null;
  children_info: string | null;
  au_pair_allowance_amount: number | null;
  au_pair_allowance_currency: string | null;
  accommodation_info: string | null;
  expectations: string | null;
  primary_photo_path: string | null;
  childcare_experience: string | null;
  has_drivers_license: boolean | null;
  has_childcare_experience: boolean | null;
  has_infant_experience: boolean | null;
  has_first_aid: boolean | null;
  will_care_for_elderly: boolean | null;
  will_care_for_pets: boolean | null;
  photo_count: number;
  activity_status?: string | null;
  verification_status?: string | null;
};

type Photo = {
  id: string;
  public_slug?: string | null;
  storage_path: string;
  is_primary: boolean;
  sort_order: number;
};

type ActiveProfileStory = {
  id: string;
  public_slug?: string | null;
  storage_path: string;
  created_at: string;
  expires_at: string;
};

type ProfileVideo = {
  id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  duration_seconds: number;
  width: number | null;
  height: number | null;
  poster_data_url: string | null;
};

type PublicProfileVideoPreview = {
  has_video: boolean;
  poster_data_url: string | null;
};

type ViewerProfile = {
  account_type: "family" | "au_pair" | null;
  onboarding_completed: boolean | null;
};

type OwnProfilePreviewRow = Omit<
  PublicProfile,
  "age" | "primary_photo_path" | "photo_count" | "activity_status"
> & {
  birth_date: string | null;
  date_of_birth: string | null;
  last_active_at: string | null;
  onboarding_completed: boolean | null;
  suspended_at: string | null;
  deletion_requested_at: string | null;
  is_admin: boolean | null;
};

const loadPublicProfileByIdentifier = cache(async (identifier: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_public_profile_by_identifier",
    { p_identifier: identifier },
  );
  const profile = ((data ?? []) as PublicProfile[])[0] ?? null;

  return {
    error,
    profile,
    primaryPhotoUrl: getProfilePhotoUrl(
      supabase,
      profile?.primary_photo_path ?? null,
    ),
  };
});

function absoluteUrl(url?: string | null) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;

  return `${SITE_URL}${url.startsWith("/") ? url : `/${url}`}`;
}

function buildProfileSeoDescription(profile: PublicProfile, displayName: string) {
  const profileType =
    profile.account_type === "au_pair" ? "au pair" : "host family";
  const location = [profile.city, formatCountryName(profile.country, DEFAULT_LANGUAGE)]
    .filter(Boolean)
    .join(", ");

  if (location) {
    return `${displayName} is a ${profileType} profile in ${location} on Perfect AuPair. View public photos, availability, languages, and profile details.`;
  }

  return `${displayName} is a ${profileType} profile on Perfect AuPair. View public photos, availability, languages, and profile details.`;
}

function getPublicProfileTitle(profile: PublicProfile) {
  if (profile.account_type === "family") {
    return "Host Family";
  }

  const firstName = profile.full_name?.trim().split(/\s+/)[0]?.trim() ?? "";

  if (firstName && profile.age) {
    return `${firstName}, ${profile.age}`;
  }

  return firstName || "Au Pair Profile";
}

function formatCountryList(
  values: string[] | null | undefined,
  locale: typeof DEFAULT_LANGUAGE,
) {
  const countries = Array.from(
    new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  );

  if (countries.length === 0) return null;

  return countries.map((country) => formatCountryName(country, locale)).join(", ");
}

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

  return age > 0 ? age : null;
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { error, primaryPhotoUrl, profile } =
    await loadPublicProfileByIdentifier(id);

  if (error) {
    console.error("Profile metadata lookup failed", error);
  }

  if (!profile) {
    return {
      title: "Profile not found",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const displayName =
    profile.account_type === "au_pair"
      ? profile.full_name || "Au pair profile"
      : formatFamilyDisplayName(profile.full_name, DEFAULT_LANGUAGE) ||
        "Host family profile";
  const canonicalPath = `/profile/${profile.public_slug ?? profile.id}`;
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;
  const description = buildProfileSeoDescription(profile, displayName);
  const publicProfileTitle = getPublicProfileTitle(profile);
  const imageUrl = absoluteUrl(primaryPhotoUrl);

  return {
    title: publicProfileTitle,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: publicProfileTitle,
      description,
      url: canonicalUrl,
      siteName: "Perfect AuPair",
      type: "profile",
      images: imageUrl
        ? [
            {
              url: imageUrl,
              alt: publicProfileTitle,
            },
          ]
        : undefined,
    },
    robots: {
      index: false,
      follow: true,
      noimageindex: true,
    },
  };
}

type ProfileIconName =
  | "age"
  | "allowance"
  | "arrowLeft"
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
  | "smoking"
  | "user"
  | "video";

type ProfileStatus = "check" | "dash";
type ProfileAccent = "sky" | "mint" | "sun" | "coral" | "violet" | "slate";

type ProfileStat = {
  label: string;
  value: ReactNode;
  icon: ProfileIconName;
  accent?: ProfileAccent;
};

type ProfileFact = ProfileStat & {
  status?: ProfileStatus;
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

  if (name === "arrowLeft") {
    return (
      <svg {...commonProps}>
        <path d="M19 12H5" />
        <path d="m12 5-7 7 7 7" />
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
        <path d="m4 11 8-7 8 7" />
        <path d="M6.5 10.5V20h11v-9.5" />
        <path d="M10 20v-5h4v5" />
      </svg>
    );
  }

  if (name === "languages") {
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

  if (name === "message") {
    return (
      <svg {...commonProps}>
        <path d="M7.5 18.5 4 21V7a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v7.5a4 4 0 0 1-4 4H7.5Z" />
        <path d="M8.5 9.5h7" />
        <path d="M8.5 13h4.5" />
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

  if (name === "nationality") {
    return (
      <svg {...commonProps}>
        <path d="M6 21V4" />
        <path d="M6 5h11l-2 4 2 4H6" />
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

  if (name === "video") {
    return (
      <svg {...commonProps}>
        <rect x="4" y="6" width="11" height="12" rx="3" />
        <path d="m15 10 5-3v10l-5-3" />
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

const profileAccentOrder: ProfileAccent[] = [
  "sky",
  "mint",
  "sun",
  "coral",
  "violet",
  "slate",
];

const profileAccentStyles: Record<
  ProfileAccent,
  {
    border: string;
    chip: string;
    icon: string;
    ring: string;
    soft: string;
    strip: string;
    text: string;
  }
> = {
  sky: {
    border: "border-[#d6e2e8]",
    chip: "bg-[#e7f1f4] text-[#2f6578] ring-[#cbe3ec]",
    icon: "bg-[#e7f1f4] text-[#2f6578] ring-[#cbe3ec]",
    ring: "ring-[#d6e2e8]",
    soft: "bg-white",
    strip: "hidden",
    text: "text-[#52666f]",
  },
  mint: {
    border: "border-[#d6e2e8]",
    chip: "bg-[#e7f1f4] text-[#2f6578] ring-[#cbe3ec]",
    icon: "bg-[#e7f1f4] text-[#2f6578] ring-[#cbe3ec]",
    ring: "ring-[#d6e2e8]",
    soft: "bg-white",
    strip: "hidden",
    text: "text-[#52666f]",
  },
  sun: {
    border: "border-[#d6e2e8]",
    chip: "bg-[#e7f1f4] text-[#2f6578] ring-[#cbe3ec]",
    icon: "bg-[#e7f1f4] text-[#2f6578] ring-[#cbe3ec]",
    ring: "ring-[#d6e2e8]",
    soft: "bg-white",
    strip: "hidden",
    text: "text-[#52666f]",
  },
  coral: {
    border: "border-[#d6e2e8]",
    chip: "bg-[#e7f1f4] text-[#2f6578] ring-[#cbe3ec]",
    icon: "bg-[#e7f1f4] text-[#2f6578] ring-[#cbe3ec]",
    ring: "ring-[#d6e2e8]",
    soft: "bg-white",
    strip: "hidden",
    text: "text-[#52666f]",
  },
  violet: {
    border: "border-[#d6e2e8]",
    chip: "bg-[#e7f1f4] text-[#2f6578] ring-[#cbe3ec]",
    icon: "bg-[#e7f1f4] text-[#2f6578] ring-[#cbe3ec]",
    ring: "ring-[#d6e2e8]",
    soft: "bg-white",
    strip: "hidden",
    text: "text-[#52666f]",
  },
  slate: {
    border: "border-[#d3dde2]",
    chip: "bg-[#e7f1f4] text-[#2f6578] ring-[#cbe3ec]",
    icon: "bg-[#e7f1f4] text-[#2f6578] ring-[#cbe3ec]",
    ring: "ring-[#d6e2e8]",
    soft: "bg-white",
    strip: "hidden",
    text: "text-[#52666f]",
  },
};

function getProfileAccent(accent?: ProfileAccent, index = 0) {
  return profileAccentStyles[
    accent ?? profileAccentOrder[index % profileAccentOrder.length]
  ];
}

function ProfileIconBadge({
  icon,
  accent,
  className = "",
}: {
  icon: ProfileIconName;
  accent?: ProfileAccent;
  className?: string;
}) {
  const accentClasses = getProfileAccent(accent);

  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ${accentClasses.icon} ${className}`}
    >
      <ProfileIcon name={icon} />
    </span>
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

function ProfileSection({
  title,
  children,
  icon,
  accent = "sky",
  className = "",
}: {
  title: string;
  children: ReactNode;
  icon?: ProfileIconName;
  accent?: ProfileAccent;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[1.25rem] border border-[#d6e2e8] bg-white p-4 shadow-sm sm:p-5 ${className}`}
    >
      <div className="flex items-center gap-3">
        {icon ? <ProfileIconBadge icon={icon} accent={accent} /> : null}
        <h2 className="text-lg font-black tracking-normal text-[#172426]">
          {title}
        </h2>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ProfileStatStrip({ items }: { items: ProfileStat[] }) {
  if (items.length === 0) return null;

  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2">
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className={`relative min-w-0 overflow-hidden rounded-[0.75rem] bg-white px-2.5 py-2 ring-1 ${getProfileAccent(
            item.accent,
            index,
          ).ring}`}
        >
          <dt className="flex items-center gap-1.5 text-[0.62rem] font-black uppercase tracking-normal text-[#52666f]">
            <ProfileIconBadge
              icon={item.icon}
              accent={item.accent}
              className="h-6 w-6"
            />
            <span className="min-w-0 break-words">{item.label}</span>
          </dt>
          <dd className="mt-1 min-w-0 break-words text-[0.9rem] font-black leading-5 text-[#172426]">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ProfileFactList({ items }: { items: ProfileFact[] }) {
  if (items.length === 0) return null;

  return (
    <dl className="overflow-hidden rounded-[0.8rem] bg-white ring-1 ring-[#d6e2e8]">
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className={`grid gap-2 px-2.5 py-2 sm:grid-cols-[minmax(8.25rem,0.58fr)_minmax(0,1fr)] sm:items-center ${
            index > 0 ? "border-t border-[#d6e2e8]" : ""
          } bg-white`}
        >
          <dt className="flex min-w-0 items-center gap-1.5 text-[0.62rem] font-black uppercase tracking-normal text-[#52666f]">
            <ProfileIconBadge
              icon={item.icon}
              accent={item.accent}
              className="h-6 w-6"
            />
            <span className="min-w-0 break-words">{item.label}</span>
          </dt>
          <dd className="flex min-w-0 items-center justify-between gap-2 text-[0.9rem] font-black leading-5 text-[#172426]">
            <span className="min-w-0 break-words">{item.value}</span>
            <StatusMark status={item.status} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ProfileSkillGrid({ items }: { items: ProfileFact[] }) {
  if (items.length === 0) return null;

  return (
    <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className="flex min-w-0 items-center gap-3 rounded-[0.95rem] bg-white px-3 py-3 ring-1 ring-[#d6e2e8]"
        >
          <ProfileIconBadge
            icon={item.icon}
            accent={item.accent}
            className="h-8 w-8"
          />
          <div className="min-w-0 flex-1">
            <dt className="min-w-0 break-words text-[0.68rem] font-black uppercase leading-4 tracking-normal text-[#52666f]">
              {item.label}
            </dt>
            <dd className="mt-1 flex min-w-0 items-center gap-2 text-sm font-black leading-5 text-[#172426]">
              <span className="min-w-0 break-words">{item.value}</span>
              <StatusMark status={item.status} />
            </dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

function ProfileHeroCompactFacts({
  facts,
  stats,
}: {
  facts: ProfileFact[];
  stats: ProfileStat[];
}) {
  const items: ProfileFact[] = [...stats, ...facts];

  if (items.length === 0) return null;

  return (
    <dl className="grid grid-cols-2 gap-1.5 lg:hidden">
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          title={`${item.label}: ${item.value}`}
          className={`min-w-0 rounded-[0.78rem] bg-[#f8fbfc] px-2.5 py-2 ring-1 ${
            getProfileAccent(item.accent, index).ring
          }`}
        >
          <dt className="flex min-w-0 items-start gap-1.5 text-[0.58rem] font-black uppercase leading-3 tracking-normal text-[#52666f]">
            <ProfileIconBadge
              icon={item.icon}
              accent={item.accent}
              className="h-5 w-5"
            />
            <span className="min-w-0 break-words">{item.label}</span>
          </dt>
          <dd className="mt-1 flex min-w-0 items-start justify-between gap-1.5 text-[0.86rem] font-black leading-tight text-[#172426]">
            <span className="min-w-0 break-words">{item.value}</span>
            <StatusMark status={item.status} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TextBlock({
  title,
  value,
}: {
  title: string;
  value?: string | null;
  accent?: ProfileAccent;
}) {
  const text = value?.trim();

  if (!text) return null;

  return (
    <div className="rounded-[0.95rem] bg-white px-3 py-3 ring-1 ring-[#d6e2e8]">
      <h3 className="text-[0.72rem] font-black uppercase tracking-normal text-[#52666f]">
        {title}
      </h3>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm font-bold leading-6 text-[#52666f]">
        {text}
      </p>
    </div>
  );
}

function isPresent<T>(item: T | null | undefined): item is T {
  return Boolean(item);
}

function getPhotoGridClass(photoCount: number) {
  if (photoCount <= 1) {
    return "grid-cols-3 lg:w-full lg:max-w-[20rem] lg:grid-cols-1";
  }

  if (photoCount === 2) {
    return "grid-cols-3 lg:w-full lg:max-w-[42rem] lg:grid-cols-2";
  }

  if (photoCount === 3) {
    return "grid-cols-3 lg:w-full lg:max-w-[62rem]";
  }

  if (photoCount === 4) {
    return "grid-cols-3 lg:grid-cols-4";
  }

  return "grid-cols-3 lg:grid-cols-5";
}

function getVideoGridClass(photoCount: number) {
  if (photoCount <= 1) {
    return "grid-cols-3 lg:w-full lg:max-w-[40rem] lg:grid-cols-2";
  }

  return getPhotoGridClass(photoCount);
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { locale, t },
    {
      data: { user },
    },
    publicProfileResult,
  ] = await Promise.all([
    getServerTranslator(),
    supabase.auth.getUser(),
    loadPublicProfileByIdentifier(id),
  ]);
  const { error, profile: loadedPublicProfile } = publicProfileResult;
  const data = loadedPublicProfile ? [loadedPublicProfile] : [];

  const isAdminUser = isAdminEmail(user?.email);

  // PROFILE_CANONICAL_SLUG_REDIRECT
  const profileForCanonicalRedirect = Array.isArray(data) ? data[0] : data;

  if (
    profileForCanonicalRedirect?.public_slug &&
    id !== profileForCanonicalRedirect.public_slug &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    redirect(`/profile/${profileForCanonicalRedirect.public_slug}`);
  }

  if (error) {
    console.error(error);
    notFound();
  }

  let profile = ((data ?? []) as PublicProfile[])[0] ?? null;

  if (!profile) {
    const { data: ownProfile } =
      user && !isAdminUser
        ? await supabase
            .from("profiles")
            .select(
              "id, public_slug, account_type, full_name, country, city, nationality, preferred_host_countries, mother_tongue, fluent_languages, basic_languages, availability_start, availability_start_from, availability_start_to, duration, duration_min_months, duration_max_months, smoking_status, gender, religion, already_in_germany, birth_date, date_of_birth, children_info, au_pair_allowance_amount, au_pair_allowance_currency, accommodation_info, expectations, bio, childcare_experience, has_drivers_license, has_childcare_experience, has_infant_experience, has_first_aid, will_care_for_elderly, will_care_for_pets, last_active_at, verification_status, onboarding_completed, suspended_at, deletion_requested_at, is_admin",
            )
            .eq("id", user.id)
            .maybeSingle<OwnProfilePreviewRow>()
        : { data: null };

    const identifierMatchesOwnProfile =
      ownProfile && (id === ownProfile.id || id === ownProfile.public_slug);

    if (
      identifierMatchesOwnProfile &&
      ownProfile.onboarding_completed &&
      !ownProfile.suspended_at &&
      !ownProfile.deletion_requested_at &&
      !ownProfile.is_admin &&
      (ownProfile.account_type === "family" ||
        ownProfile.account_type === "au_pair")
    ) {
      profile = {
        id: ownProfile.id,
        public_slug: ownProfile.public_slug,
        account_type: ownProfile.account_type,
        full_name: ownProfile.full_name,
        country: ownProfile.country,
        city: ownProfile.city,
        nationality: ownProfile.nationality,
        preferred_host_countries: ownProfile.preferred_host_countries,
        mother_tongue: ownProfile.mother_tongue,
        fluent_languages: ownProfile.fluent_languages,
        basic_languages: ownProfile.basic_languages,
        availability_start: ownProfile.availability_start,
        availability_start_from: ownProfile.availability_start_from,
        availability_start_to: ownProfile.availability_start_to,
        duration: ownProfile.duration,
        duration_min_months: ownProfile.duration_min_months,
        duration_max_months: ownProfile.duration_max_months,
        smoking_status: ownProfile.smoking_status,
        gender: ownProfile.gender,
        religion: ownProfile.religion,
        already_in_germany: ownProfile.already_in_germany,
        age: calculateAge(ownProfile.birth_date ?? ownProfile.date_of_birth),
        bio: ownProfile.bio,
        children_info: ownProfile.children_info,
        au_pair_allowance_amount: ownProfile.au_pair_allowance_amount,
        au_pair_allowance_currency: ownProfile.au_pair_allowance_currency,
        accommodation_info: ownProfile.accommodation_info,
        expectations: ownProfile.expectations,
        primary_photo_path: null,
        childcare_experience: ownProfile.childcare_experience,
        has_drivers_license: ownProfile.has_drivers_license,
        has_childcare_experience: ownProfile.has_childcare_experience,
        has_infant_experience: ownProfile.has_infant_experience,
        has_first_aid: ownProfile.has_first_aid,
        will_care_for_elderly: ownProfile.will_care_for_elderly,
        will_care_for_pets: ownProfile.will_care_for_pets,
        photo_count: 0,
        activity_status: getActivityStatus(ownProfile.last_active_at),
        verification_status: ownProfile.verification_status,
      };
    }
  }

  if (!profile) {
    notFound();
  }

  let viewerAccountType: "family" | "au_pair" | null = null;
  let viewerProfilePhotoUrl: string | null = null;
  const isOwnProfile = user?.id === profile.id;
  const authState = isAdminUser ? "admin" : user ? "authenticated" : "public";

  if (user && !isAdminUser) {
    const [{ data: viewerProfileForAccess }, initialProfilePhotoUrl] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("account_type, onboarding_completed")
          .eq("id", user.id)
          .maybeSingle(),
        getPrimaryProfilePhotoUrl(supabase, user.id),
      ]);
    const viewerProfile = viewerProfileForAccess as ViewerProfile | null;
    viewerProfilePhotoUrl = initialProfilePhotoUrl;

    if (
      viewerProfile?.account_type === "family" ||
      viewerProfile?.account_type === "au_pair"
    ) {
      viewerAccountType = viewerProfile.account_type;
    }

    if (!isOwnProfile && (await isProfilePairBlocked(supabase, user.id, profile.id))) {
      const blockedBackToSearchHref =
        viewerAccountType === "family"
          ? "/search-aupair"
          : viewerAccountType === "au_pair"
            ? "/search-family"
            : profile.account_type === "au_pair"
              ? "/search-aupair"
              : "/search-family";

      return (
        <main className="min-h-screen bg-[var(--background)] text-[#25302d]">
          <Header
            authState={authState}
            accountType={viewerAccountType}
            initialProfilePhotoUrl={viewerProfilePhotoUrl}
          />

          <section className="mx-auto flex min-h-[calc(100vh-220px)] max-w-3xl items-center px-5 py-10 sm:px-8">
            <div className="w-full rounded-[2rem] bg-white p-7 text-center shadow-sm ring-1 ring-black/5 sm:p-10">
              <p className="text-xs font-black uppercase tracking-normal text-[#6f8793]">
                {t("profile.blockedEyebrow")}
              </p>
              <h1 className="mt-4 text-3xl font-black tracking-normal sm:text-4xl">
                {t("profile.blockedTitle")}
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-base font-semibold leading-7 text-[#25302d]/58">
                {t("profile.blockedBody")}
              </p>
              <Link
                href={blockedBackToSearchHref}
                prefetch={false}
                className="mt-7 inline-flex h-11 items-center justify-center rounded-full bg-[var(--pa-primary)] px-5 text-sm font-black text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)]"
              >
                {t("common.backToSearch")}
              </Link>
            </div>
          </section>

          <LegalFooter />
        </main>
      );
    }

    if (!viewerProfile?.onboarding_completed) {
      redirect("/onboarding");
    }

    if (
      !isOwnProfile &&
      viewerProfile?.account_type === profile.account_type &&
      profile.account_type === "family"
    ) {
      redirect("/search-aupair");
    }

    if (
      !isOwnProfile &&
      viewerProfile?.account_type === profile.account_type &&
      profile.account_type === "au_pair"
    ) {
      redirect("/search-family");
    }
  }

  const isAuPair = profile.account_type === "au_pair";
  const canMessage =
    !isOwnProfile &&
    Boolean(user) &&
    viewerAccountType !== null &&
    viewerAccountType !== profile.account_type;

  const now = new Date().toISOString();

  if (user && !isAdminUser && canMessage) {
    const actorId = user.id;
    const recipientId = profile.id;

    after(async () => {
      const profileViewResult = await supabase.rpc("record_profile_view", {
        p_profile_id: recipientId,
      });

      if (profileViewResult.error) {
        console.warn("Could not record profile view.", profileViewResult.error);
        return;
      }

      if (profileViewResult.data) {
        await createProfileViewInterestNotification({ actorId, recipientId });
      }
    });
  }

  const [
    photosResult,
    activeStoriesResult,
    profileVideoResult,
    savedProfileResult,
  ] =
    await Promise.all([
      supabase
        .from("profile_photos")
        .select("id, storage_path, is_primary, sort_order")
        .eq("profile_id", profile.id)
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true }),
      user
        ? supabase
            .from("profile_stories")
            .select("id, storage_path, created_at, expires_at")
            .eq("profile_id", profile.id)
            .gt("expires_at", now)
            .order("created_at", { ascending: false })
        : supabase.rpc("public_profile_has_active_story", {
            p_profile_id: profile.id,
          }),
      user
        ? supabase
            .from("profile_videos")
            .select(
              "id, storage_path, mime_type, size_bytes, duration_seconds, width, height, poster_data_url, content_moderation_status",
            )
            .eq("profile_id", profile.id)
            .maybeSingle()
        : supabase.rpc("public_profile_approved_video_preview", {
            p_profile_id: profile.id,
          }),
      user && canMessage
        ? supabase
            .from("profile_favorites")
            .select("id")
            .eq("user_id", user.id)
            .eq("profile_id", profile.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const photosWithUrls =
    photosResult.data?.map((photo: Photo) => ({
      ...photo,
      public_url: getProfilePhotoUrl(supabase, photo.storage_path),
    })) ?? [];

  const storiesWithUrls = user
    ? await Promise.all(
        ((activeStoriesResult.data ?? []) as ActiveProfileStory[]).map(
          async (story) => ({
            ...story,
            public_url: await getSignedStoryPhotoUrl(
              supabase,
              story.storage_path,
              story.expires_at,
            ),
          }),
        ),
      )
    : [];
  const profileStory = user
    ? (storiesWithUrls[0] ?? null)
    : activeStoriesResult.data === true
      ? {
          id: "",
          storage_path: "",
          created_at: "",
          expires_at: "",
          public_url: null,
        }
      : null;
  const profileVideo = user
    ? (profileVideoResult.data as ProfileVideo | null)
    : null;
  const publicProfileVideoPreview = user
    ? null
    : ((profileVideoResult.data as PublicProfileVideoPreview[] | null)?.[0] ??
      null);
  const hasProfileVideo = user
    ? Boolean(profileVideo)
    : publicProfileVideoPreview?.has_video === true;
  const profileVideoUrl =
    user && profileVideo
      ? await getSignedProfileVideoUrl(supabase, profileVideo.storage_path)
      : null;

  const isSaved = Boolean(savedProfileResult.data);

  const backToSearchHref =
    viewerAccountType === "family"
      ? "/search-aupair"
      : viewerAccountType === "au_pair"
        ? "/search-family"
        : isAuPair
          ? "/search-aupair"
          : "/search-family";

  const mainPhotoUrl =
    getProfilePhotoUrl(supabase, profile.primary_photo_path) ??
    photosWithUrls[0]?.public_url ??
    null;
  const profilePath = `/profile/${profile.public_slug ?? profile.id}`;
  const profileDisplayName = isAuPair
    ? profile.full_name
    : formatFamilyDisplayName(profile.full_name, locale);
  const profileAllowance = formatAllowance(
    profile.au_pair_allowance_amount,
    profile.au_pair_allowance_currency,
    locale,
  );
  const preferredHostCountryList = formatCountryList(
    profile.preferred_host_countries,
    locale,
  );
  const profilePromptName =
    profileDisplayName ?? (isAuPair ? t("common.auPair") : t("common.hostFamily"));
  const reportProfileHref = buildReportHref({
    type: "profile",
    id: profile.id,
    returnTo: profilePath,
  });
  const photoGridClass = getPhotoGridClass(photosWithUrls.length);
  const locationText =
    [
      profile.city,
      profile.country ? formatCountryName(profile.country, locale) : null,
    ]
      .filter(Boolean)
      .join(", ") || t("common.locationNotSet");
  const availabilityText =
    profile.availability_start_from || profile.availability_start_to
      ? formatLocalizedStartWindow(
          locale,
          profile.availability_start_from,
          profile.availability_start_to,
        )
      : profile.availability_start;
  const durationText =
    profile.duration_min_months || profile.duration_max_months
      ? formatDuration(
          locale,
          profile.duration_min_months,
          profile.duration_max_months,
        )
      : profile.duration;
  const nationalityText = profile.nationality
    ? formatCountryName(profile.nationality, locale)
    : null;
  const smokingText = profile.smoking_status
    ? formatSmoking(profile.smoking_status, locale)
    : null;
  const profileLanguageSummary = Array.from(
    new Set(
      [
        profile.mother_tongue,
        ...(profile.fluent_languages ?? []),
        ...(profile.basic_languages ?? []),
      ]
        .map((language) => language?.trim())
        .filter((language): language is string => Boolean(language)),
    ),
  );
  const languageSummary =
    profileLanguageSummary.length > 0
      ? formatLanguageList(profileLanguageSummary, locale)
      : null;
  const showAlreadyInGermanyBadge =
    isAuPair && profile.already_in_germany === true;
  const heroStatDetails: ProfileStat[] = ([
    isAuPair && profile.age
      ? {
          label: t("common.age"),
          value: formatAge(profile.age, locale),
          icon: "age",
          accent: "sky",
        }
      : null,
    isAuPair && availabilityText
      ? {
          label: t("common.availability"),
          value: availabilityText,
          icon: "calendar",
          accent: "sun",
        }
      : null,
    isAuPair && nationalityText
      ? {
          label: t("common.nationality"),
          value: nationalityText,
          icon: "nationality",
          accent: "coral",
        }
      : null,
    !isAuPair && profile.children_info
      ? {
          label: t("common.children"),
          value: formatChildrenInfo(profile.children_info, locale),
          icon: "children",
          accent: "mint",
        }
      : null,
    !isAuPair && profileAllowance
      ? {
          label: t("common.monthlyAllowance"),
          value: profileAllowance,
          icon: "allowance",
          accent: "sun",
        }
      : null,
    !isAuPair && profile.religion
      ? {
          label: t("common.religion"),
          value: formatReligion(profile.religion, locale),
          icon: "religion",
          accent: "violet",
        }
      : null,
  ] as Array<ProfileStat | null>).filter(isPresent);
  const heroFactDetails: ProfileFact[] = ([
    !isAuPair && availabilityText
      ? {
          label: t("common.availability"),
          value: availabilityText,
          icon: "calendar",
          accent: "sky",
        }
      : null,
    durationText
      ? {
          label: t("common.duration"),
          value: durationText,
          icon: "clock",
          accent: "sun",
        }
      : null,
    isAuPair && preferredHostCountryList
      ? {
          label: t("common.preferredHostCountries"),
          value: preferredHostCountryList,
          icon: "countries",
          accent: "mint",
        }
      : null,
    isAuPair && smokingText
      ? {
          label: t("common.smoking"),
          value: smokingText,
          icon: "smoking",
          accent: "mint",
        }
      : null,
    isAuPair && profile.religion
      ? {
          label: t("common.religion"),
          value: formatReligion(profile.religion, locale),
          icon: "religion",
          accent: "violet",
        }
      : null,
    languageSummary
      ? {
          label: t("common.languages"),
          value: languageSummary,
          icon: "languages",
          accent: "slate",
        }
      : null,
  ] as Array<ProfileFact | null>).filter(isPresent);
  const childcareExperienceText = profile.childcare_experience?.trim() ?? null;
  const experienceDetails: ProfileFact[] = isAuPair
    ? ([
        !childcareExperienceText
          ? {
              label: t("common.childcareExperience"),
              value: profile.has_childcare_experience
                ? t("common.yes")
                : t("common.no"),
              icon: "children",
              accent: "mint",
              status: statusForBoolean(profile.has_childcare_experience),
            }
          : null,
        {
          label: t("common.driversLicense"),
          value: profile.has_drivers_license ? t("common.yes") : t("common.no"),
          icon: "driver",
          accent: "sky",
          status: statusForBoolean(profile.has_drivers_license),
        },
        {
          label: t("common.infantExperience"),
          value: profile.has_infant_experience ? t("common.yes") : t("common.no"),
          icon: "infant",
          accent: "violet",
          status: statusForBoolean(profile.has_infant_experience),
        },
        {
          label: t("common.firstAid"),
          value: profile.has_first_aid ? t("common.yes") : t("common.no"),
          icon: "firstAid",
          accent: "coral",
          status: statusForBoolean(profile.has_first_aid),
        },
        {
          label: t("common.elderlyCare"),
          value: profile.will_care_for_elderly
            ? t("common.yes")
            : t("common.no"),
          icon: "user",
          accent: "slate",
          status: statusForBoolean(profile.will_care_for_elderly),
        },
        {
          label: t("common.petCare"),
          value: profile.will_care_for_pets ? t("common.yes") : t("common.no"),
          icon: "home",
          accent: "sun",
          status: statusForBoolean(profile.will_care_for_pets),
        },
      ] as Array<ProfileFact | null>).filter(isPresent)
    : [];

  return (
    <main className="min-h-screen bg-[var(--background)] text-[#25302d]">
      <ProfileScrollReset />
      <Header
        authState={authState}
        accountType={viewerAccountType}
        initialProfilePhotoUrl={viewerProfilePhotoUrl}
      />

      <section className="mx-auto w-full max-w-[72rem] px-4 py-4 sm:px-6 lg:py-5">
        <div className="overflow-hidden rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-[#d6e2e8] sm:rounded-[1.35rem] sm:p-4 lg:p-0">
          <div className="grid grid-cols-[6.25rem_minmax(0,1fr)] gap-3 sm:grid-cols-[7.5rem_minmax(0,1fr)] lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] lg:gap-0 xl:grid-cols-[minmax(230px,300px)_minmax(0,1fr)]">
            <div className="min-w-0 lg:row-span-3 lg:bg-[#f7fbfc] lg:p-4 xl:p-5">
              <div className="relative aspect-square overflow-hidden rounded-[0.95rem] bg-[#f7f3ed] shadow-sm ring-1 ring-[#d6e2e8] sm:rounded-[1.05rem] lg:rounded-[1rem]">
                {mainPhotoUrl ? (
                  user ? (
                    <ProfilePhotoLightbox
                      src={mainPhotoUrl}
                      preload
                      className="h-full w-full object-cover object-[center_22%]"
                      sizes="(min-width: 1280px) 300px, (min-width: 1024px) 280px, (min-width: 640px) 120px, 100px"
                    />
                  ) : (
                    <GuestProfilePhotoPrompt
                      imageUrl={mainPhotoUrl}
                      preload
                      imageClassName="h-full w-full object-cover object-[center_22%]"
                      profileName={profilePromptName}
                      profilePhotoUrl={mainPhotoUrl}
                      returnTo={profilePath}
                      sizes="(min-width: 1280px) 300px, (min-width: 1024px) 280px, (min-width: 640px) 120px, 100px"
                    />
                  )
                ) : (
                  <div className="flex h-full items-center justify-center text-3xl font-black text-[#25302d]/20 lg:text-6xl">
                    PA
                  </div>
                )}

                {profileStory ? (
                  <ProfileStoryIndicator
                    storyId={profileStory.id}
                    href={
                      user
                        ? buildStoryHref(profileStory.id, profilePath)
                        : loginHref(profilePath)
                    }
                    imageUrl={mainPhotoUrl}
                    locked={!user}
                    variant="profile"
                  />
                ) : null}
              </div>
            </div>

            <div className="flex min-w-0 flex-col justify-center gap-2 lg:justify-start lg:gap-3 lg:p-5 lg:pb-1 xl:p-6 xl:pb-1">
              <div className="relative">
                <div className="min-w-0">
                  {profile.activity_status ? (
                    <div
                      className={`flex flex-wrap items-center gap-2 ${
                        isOwnProfile ? "" : "pr-20 lg:pr-24"
                      }`}
                    >
                      <ProfileActivityBadge
                        status={profile.activity_status}
                        t={t}
                        className="px-2 py-1 text-[0.68rem] shadow-none lg:px-2.5 lg:py-1 lg:text-[0.72rem]"
                      />
                    </div>
                  ) : null}
                  <h1
                    className={`min-w-0 break-words text-[1.25rem] font-black leading-tight tracking-normal text-[#172426] sm:text-2xl lg:text-[2.45rem] xl:text-[2.9rem] ${
                      profile.activity_status ? "mt-1" : ""
                    }`}
                  >
                    <span>
                      {profileDisplayName ??
                        (isAuPair ? t("common.auPair") : t("common.hostFamily"))}
                    </span>
                    <ProfileVerificationBadge
                      status={profile.verification_status}
                      label={t("verification.verified")}
                      className="ml-2 align-middle lg:ml-2.5"
                    />
                  </h1>

                  {showAlreadyInGermanyBadge ? (
                    <div
                      data-testid="profile-hero-already-in-germany"
                      className="mt-1.5 flex w-fit max-w-full"
                    >
                      <AlreadyInGermanyBadge
                        label={t("common.alreadyInGermany")}
                        compact
                        className="w-fit max-w-full"
                      />
                    </div>
                  ) : null}

                  <p className="mt-2 flex min-w-0 items-center gap-1.5 text-[0.78rem] font-black text-[#52666f] sm:text-sm lg:mt-3 lg:gap-2 lg:text-[0.96rem]">
                    <ProfileIconBadge
                      icon="location"
                      accent="coral"
                      className="h-7 w-7"
                    />
                    <span className="min-w-0 break-words">{locationText}</span>
                    <ProfileCountryFlagBadge
                      country={profile.country}
                      label={
                        profile.country
                          ? `${t("common.location")}: ${formatCountryName(
                              profile.country,
                              locale,
                            )}`
                          : undefined
                      }
                    />
                  </p>
                </div>

                {isOwnProfile ? null : (
                  <Link
                    href={reportProfileHref}
                    prefetch={false}
                    className="absolute right-0 top-0 inline-flex text-[0.68rem] font-bold text-[#25302d]/45 underline-offset-4 hover:text-[#9d3f2f] hover:underline lg:text-xs"
                  >
                    {t("common.reportThisProfile")}
                  </Link>
                )}
              </div>
            </div>

              <div className="col-span-2 flex flex-wrap items-center gap-2 pb-3 pt-1 sm:gap-3 sm:pb-4 lg:col-span-1 lg:col-start-2 lg:px-5 lg:pb-3 lg:pt-3 xl:px-6">
                {!user ? (
                  <Link
                    href={loginHref(profilePath)}
                    prefetch={false}
                    className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[var(--pa-primary)] px-3 text-center text-xs font-bold leading-none text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)] sm:px-4 sm:text-sm"
                  >
                    <ProfileIcon name="user" />
                    {t("nav.login")}
                  </Link>
                ) : canMessage ? (
                  <>
                    <Link
                      href={`/messages?profile=${profile.id}`}
                      prefetch={false}
                      className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[var(--pa-primary)] px-3 text-center text-xs font-bold leading-none text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)] sm:px-4 sm:text-sm"
                    >
                      <ProfileIcon name="message" />
                      {t("common.message")}
                    </Link>

                    <SaveProfileButton
                      profileId={profile.id}
                      initialSaved={isSaved}
                      variant="inline"
                    />
                  </>
                ) : null}

                <Link
                  href={backToSearchHref}
                  prefetch={false}
                  className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-black/10 bg-white px-3 text-center text-xs font-bold leading-none text-[#25302d] transition hover:bg-[#f7f3ed] sm:px-4 sm:text-sm"
                >
                  <ProfileIcon name="arrowLeft" />
                  {t("common.backToSearch")}
                </Link>
              </div>

              {heroStatDetails.length > 0 || heroFactDetails.length > 0 ? (
                <div className="col-span-2 rounded-[1rem] bg-white p-2.5 ring-1 ring-[#d6e2e8] sm:p-3 lg:col-span-1 lg:col-start-2 lg:mx-5 lg:mb-5 lg:rounded-none lg:p-0 lg:ring-0 xl:mx-6">
                  <ProfileHeroCompactFacts
                    stats={heroStatDetails}
                    facts={heroFactDetails}
                  />
                  <div className="hidden lg:block">
                    <ProfileStatStrip items={heroStatDetails} />
                    {heroFactDetails.length > 0 ? (
                      <div className={heroStatDetails.length > 0 ? "mt-2" : ""}>
                        <ProfileFactList items={heroFactDetails} />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
          </div>
        </div>

        {photosWithUrls.length > 0 ? (
          <ProfileSection
            title={t("common.photos")}
            icon="photos"
            accent="sun"
            className="mt-4"
          >
            <div className={`grid ${photoGridClass} gap-2 sm:gap-3`}>
              {photosWithUrls.map((photo) => (
                <div
                  key={photo.id}
                  data-testid="profile-photo-tile"
                  className="aspect-square overflow-hidden rounded-[0.85rem] bg-[#f7f3ed] shadow-sm ring-1 ring-[#d6e2e8]"
                >
                  {photo.public_url ? (
                    user ? (
                      <ProfilePhotoLightbox
                        src={photo.public_url}
                        className="h-full w-full object-cover object-[center_22%]"
                        sizes="(min-width: 1024px) 180px, (min-width: 640px) 220px, 48vw"
                      />
                    ) : (
                      <GuestProfilePhotoPrompt
                        imageUrl={photo.public_url}
                        imageClassName="h-full w-full object-cover object-[center_22%]"
                        profileName={profilePromptName}
                        profilePhotoUrl={mainPhotoUrl}
                        returnTo={profilePath}
                        sizes="(min-width: 1024px) 180px, (min-width: 640px) 220px, 48vw"
                      />
                    )
                  ) : null}
                </div>
              ))}
            </div>
          </ProfileSection>
        ) : null}

        {hasProfileVideo ? (
          <ProfileSection
            title={t("profile.videoTitle")}
            icon="video"
            accent="sky"
            className="mt-4"
          >
            <div
              className={`grid ${getVideoGridClass(photosWithUrls.length)} gap-2 sm:gap-3`}
            >
              <div
                data-testid="profile-video-tile"
                className="col-span-2 aspect-square overflow-hidden rounded-[0.85rem] bg-black shadow-sm ring-1 ring-[#d6e2e8]"
              >
                <ProfileIntroVideo
                  videoUrl={profileVideoUrl}
                  isAuthenticated={Boolean(user)}
                  profileName={profilePromptName}
                  profilePhotoUrl={mainPhotoUrl}
                  returnTo={profilePath}
                  posterUrl={
                    profileVideo?.poster_data_url ??
                    publicProfileVideoPreview?.poster_data_url ??
                    null
                  }
                  variant="tile"
                />
              </div>
            </div>
          </ProfileSection>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {profile.bio?.trim() ? (
            <ProfileSection
              title={
                isAuPair
                  ? t("common.introduction")
                  : t("common.familyIntroduction")
              }
              icon="message"
              accent="violet"
              className="lg:col-span-2"
            >
              <p className="whitespace-pre-wrap break-words text-sm font-bold leading-6 text-[#52666f]">
                {profile.bio}
              </p>
            </ProfileSection>
          ) : null}

          {isAuPair && (childcareExperienceText || experienceDetails.length > 0) ? (
            <ProfileSection
              title={t("profile.section.experienceSkills")}
              icon="children"
              accent="mint"
              className="lg:col-span-2"
            >
              <div className="grid gap-3">
                {childcareExperienceText ? (
                  <TextBlock
                    title={t("common.childcareExperience")}
                    value={childcareExperienceText}
                    accent="mint"
                  />
                ) : null}
                <ProfileSkillGrid items={experienceDetails} />
              </div>
            </ProfileSection>
          ) : null}

          {!isAuPair &&
          (profile.accommodation_info?.trim() || profile.expectations?.trim()) ? (
            <ProfileSection
              title={t("profile.section.familyHome")}
              icon="home"
              accent="coral"
              className="lg:col-span-2"
            >
              <div className="grid gap-3 lg:grid-cols-2">
                <TextBlock
                  title={t("common.accommodation")}
                  value={profile.accommodation_info}
                  accent="mint"
                />
                <TextBlock
                  title={t("common.expectations")}
                  value={profile.expectations}
                  accent="coral"
                />
              </div>
            </ProfileSection>
          ) : null}
        </div>
      </section>

      <LegalFooter />
    </main>
  );
}
