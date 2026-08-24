import Image from "next/image";
import Link from "next/link";
import { MessageIcon } from "@/components/icons/MessageIcon";
import { AlreadyInGermanyBadge } from "@/components/profile/AlreadyInGermanyBadge";
import { ProfileActivityBadge } from "@/components/profile/ProfileActivityBadge";
import { ProfileCountryFlagBadge } from "@/components/profile/ProfileCountryFlagBadge";
import { ProfileNavigationLink } from "@/components/profile/ProfileNavigationLink";
import { SaveProfileButton } from "@/components/profile/SaveProfileButton";
import { ProfileStoryIndicator } from "@/components/profile/ProfileStoryIndicator";
import { ProfileVerificationBadge } from "@/components/profile/ProfileVerificationBadge";
import { ProfileCardGuestAction } from "@/components/search/ProfileCardGuestAction";
import {
  getProfileCardImageSrcSet,
  getProfilePhotoVariantUrl,
  isProfilePhotoMediaUrl,
  shouldBypassImageOptimization,
} from "@/lib/images/optimization";
import {
  type LanguageCode,
  createTranslator,
  formatAllowance,
  formatChildrenInfo,
  formatCountryName,
  formatDuration,
  formatFamilyDisplayName,
  formatLanguageName,
  formatStartWindow,
} from "@/lib/i18n/translations";

export type SearchCardProfile = {
  id: string;
  public_slug?: string | null;
  account_type: "au_pair" | "family";
  full_name: string | null;
  first_name?: string | null;
  country: string | null;
  city: string | null;
  preferred_host_countries?: string[] | null;
  mother_tongue?: string | null;
  fluent_languages?: string[] | null;
  basic_languages?: string[] | null;
  availability_start_from?: string | null;
  availability_start_to?: string | null;
  duration_min_months?: number | null;
  duration_max_months?: number | null;
  smoking_status?: string | null;
  age?: number | null;
  childcare_experience?: string | null;
  has_drivers_license?: boolean | null;
  has_childcare_experience?: boolean | null;
  has_infant_experience?: boolean | null;
  has_first_aid?: boolean | null;
  will_care_for_elderly?: boolean | null;
  will_care_for_pets?: boolean | null;
  already_in_germany?: boolean | null;
  children_info?: string | null;
  au_pair_allowance_amount?: number | null;
  au_pair_allowance_currency?: string | null;
  accommodation_info?: string | null;
  bio?: string | null;
  expectations?: string | null;
  primary_photo_path?: string | null;
  photoUrl?: string | null;
  photo_count?: number | null;
  activity_status?: string | null;
  verification_status?: string | null;
};

type ProfileSearchCardProps = {
  profile: SearchCardProfile;
  locale: LanguageCode;
  isAuthenticated: boolean;
  isSaved?: boolean;
  hasStory?: boolean;
  hasVideo?: boolean;
  storyHref?: string | null;
  storyId?: string | null;
  imagePriority?: boolean;
  headingLevel?: 2 | 3;
};

function PinIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
    >
      <path d="M12 21s7-5.3 7-12a7 7 0 0 0-14 0c0 6.7 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.4" />
    </svg>
  );
}

function getInitials(name?: string | null) {
  const value = name?.trim();
  if (!value) return "PA";

  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function getFirstName(profile: SearchCardProfile) {
  const directName = profile.first_name?.trim();
  if (directName) return directName;

  return profile.full_name?.trim().split(/\s+/)[0] ?? null;
}

function getDisplayName(profile: SearchCardProfile, locale: LanguageCode) {
  if (profile.account_type === "family") {
    return formatFamilyDisplayName(profile.full_name, locale);
  }

  const firstName = getFirstName(profile);
  return firstName && profile.age ? `${firstName}, ${profile.age}` : firstName;
}

function formatLanguages(profile: SearchCardProfile, locale: LanguageCode) {
  const languageCodes = Array.from(
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

  if (languageCodes.length === 0) return "";

  const visibleLanguages = languageCodes
    .slice(0, 3)
    .map((language) => formatLanguageName(language, locale));
  const remainingCount = languageCodes.length - visibleLanguages.length;

  return remainingCount > 0
    ? `${visibleLanguages.join(", ")} +${remainingCount}`
    : visibleLanguages.join(", ");
}

function formatPreferredHostCountries(
  values: string[] | null | undefined,
  locale: LanguageCode,
  maxVisible = 3,
) {
  const countries = Array.from(
    new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  );

  if (countries.length === 0) return null;

  const visibleCountries = countries
    .slice(0, maxVisible)
    .map((country) => formatCountryName(country, locale));
  const remainingCount = countries.length - visibleCountries.length;

  return remainingCount > 0
    ? `${visibleCountries.join(", ")} +${remainingCount}`
    : visibleCountries.join(", ");
}

function getIntroduction(profile: SearchCardProfile) {
  const introduction = (profile.bio || profile.expectations)
    ?.replace(/\s+/g, " ")
    .trim();
  return introduction || null;
}

function PlaneIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
    >
      <path d="m3 11 18-7-7 18-3-8-8-3Z" />
      <path d="m11 14 4-4" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
    >
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1.2-1.7h6.2L16.3 6h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
    >
      <rect x="4" y="6" width="11" height="12" rx="2" />
      <path d="m15 10 5-3v10l-5-3" />
    </svg>
  );
}

function DetailItem({
  label,
  value,
  withDivider = false,
}: {
  label: string;
  value: string;
  withDivider?: boolean;
}) {
  return (
    <div
      className={[
        "min-w-0",
        withDivider ? "sm:border-l sm:border-[#d8e0e6] sm:pl-5" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="block text-[0.72rem] font-bold leading-none text-[#25302d]/58">
        {label}
      </span>
      <span className="mt-1 block min-w-0 break-words text-[0.86rem] font-black leading-tight text-[#101817]">
        {value}
      </span>
    </div>
  );
}

function MobileFactChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex min-w-0 max-w-full rounded-full bg-[#eef6f8] px-2.5 py-1 text-[0.72rem] font-black leading-none text-[#286778]">
      <span className="truncate">
        {label}: {value}
      </span>
    </span>
  );
}

export function ProfileSearchCard({
  profile,
  locale,
  isAuthenticated,
  isSaved = false,
  hasStory = false,
  hasVideo = false,
  storyHref = null,
  storyId = null,
  imagePriority = false,
  headingLevel = 3,
}: ProfileSearchCardProps) {
  const t = createTranslator(locale);
  const profileHref = `/profile/${profile.public_slug ?? profile.id}`;
  const displayName =
    getDisplayName(profile, locale) ??
    (profile.account_type === "family"
      ? t("common.hostFamily")
      : t("common.auPair"));
  const HeadingTag = headingLevel === 2 ? "h2" : "h3";
  const languageSummary = formatLanguages(profile, locale);
  const startWindow = formatStartWindow(
    locale,
    profile.availability_start_from,
    profile.availability_start_to,
  );
  const duration = formatDuration(
    locale,
    profile.duration_min_months,
    profile.duration_max_months,
  );
  const childrenLabel =
    profile.account_type === "family" && profile.children_info
      ? formatChildrenInfo(profile.children_info, locale)
      : null;
  const allowanceLabel =
    profile.account_type === "family"
      ? formatAllowance(
          profile.au_pair_allowance_amount,
          profile.au_pair_allowance_currency,
          locale,
        )
      : null;
  const preferredHostCountries =
    profile.account_type === "au_pair"
      ? formatPreferredHostCountries(profile.preferred_host_countries, locale, 2)
      : null;
  const introduction = getIntroduction(profile);
  const imageUrl = profile.photoUrl ?? null;
  const messageHref = `/messages?profile=${profile.id}`;
  const photoCount = Number(profile.photo_count ?? 0);
  const detailItems = [
    { label: t("common.availability"), value: startWindow },
    { label: t("common.duration"), value: duration },
    profile.account_type === "family" && childrenLabel
      ? { label: t("common.children"), value: childrenLabel }
      : null,
    profile.account_type === "family" && allowanceLabel
      ? { label: t("common.monthlyAllowance"), value: allowanceLabel }
      : null,
    profile.account_type === "au_pair" && languageSummary
      ? { label: t("common.languages"), value: languageSummary }
      : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));
  const skillHighlights =
    profile.account_type === "au_pair"
      ? [
          profile.will_care_for_elderly ? t("common.elderlyCare") : null,
          profile.will_care_for_pets ? t("common.petCare") : null,
        ].filter((item): item is string => Boolean(item))
      : [];
  const imageSizes =
    "(min-width: 1280px) 270px, (min-width: 1024px) 250px, (min-width: 640px) 160px, 42vw";
  const responsiveProfilePhoto = isProfilePhotoMediaUrl(imageUrl);
  const profilePhotoSrcSet = imageUrl
    ? getProfileCardImageSrcSet(imageUrl)
    : undefined;
  const profilePhotoSrc = imageUrl
    ? getProfilePhotoVariantUrl(imageUrl, 640)
    : "";

  return (
    <article
      data-profile-search-card="true"
      className="relative grid w-full min-w-0 max-w-full grid-cols-[minmax(8.8rem,42vw)_minmax(0,1fr)] gap-2 overflow-hidden rounded-[0.85rem] border border-[#d8e0e6] bg-white p-2 shadow-[0_8px_22px_rgba(38,63,69,0.05)] transition hover:border-[#c9d3d9] hover:shadow-[0_12px_30px_rgba(38,63,69,0.08)] sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4 sm:rounded-[0.95rem] sm:p-3 lg:grid-cols-[minmax(220px,250px)_minmax(0,1fr)] lg:gap-5 lg:p-4 xl:grid-cols-[minmax(240px,270px)_minmax(0,1fr)]"
    >
      <ProfileNavigationLink
        href={profileHref}
        aria-label={displayName}
        className="absolute inset-0 z-[1] cursor-pointer"
      />

      <div className="min-w-0">
        <div className="relative block aspect-square overflow-hidden rounded-[0.8rem] bg-[#e9eef2]">
          {imageUrl ? (
            responsiveProfilePhoto ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- protected profile photos use the bounded same-origin transform route, not Next's shared optimizer */}
                <img
                  src={profilePhotoSrc}
                  srcSet={profilePhotoSrcSet}
                  sizes={imageSizes}
                  alt=""
                  width={640}
                  height={640}
                  loading={imagePriority ? "eager" : "lazy"}
                  fetchPriority={imagePriority ? "high" : "low"}
                  decoding="async"
                  draggable={false}
                  className="pa-protected-media absolute inset-0 h-full w-full object-cover object-[center_22%]"
                />
              </>
            ) : (
              <Image
                src={imageUrl}
                alt=""
                fill
                loading={imagePriority ? "eager" : "lazy"}
                fetchPriority={imagePriority ? "high" : "low"}
                sizes={imageSizes}
                unoptimized={shouldBypassImageOptimization(imageUrl)}
                draggable={false}
                className="pa-protected-media object-cover object-[center_22%]"
              />
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-black text-[#25302d]/20 lg:text-4xl">
              {getInitials(displayName)}
            </div>
          )}

          {photoCount > 1 ? (
            <span className="absolute bottom-2 left-2 hidden h-7 items-center gap-1 rounded-full bg-[#101817]/76 px-2.5 text-xs font-black text-white shadow-sm backdrop-blur sm:inline-flex">
              <CameraIcon />
              1 / {photoCount}
            </span>
          ) : null}

          {hasStory && storyHref && storyId ? (
            <ProfileStoryIndicator
              href={storyHref}
              imageUrl={imageUrl}
              locked={!isAuthenticated}
              storyId={storyId}
              variant="card"
            />
          ) : null}

          <div
            className={[
              "absolute top-2 flex flex-col gap-1.5",
              hasStory && storyHref && storyId ? "left-2" : "right-2",
            ].join(" ")}
          >
            {hasStory && (!storyHref || !storyId) ? (
              <span className="inline-flex h-7 items-center justify-center rounded-full bg-white/95 px-2 text-[0.68rem] font-black text-[var(--pa-primary)] shadow-sm ring-1 ring-black/10">
                {t("common.story")}
              </span>
            ) : null}
            {hasVideo ? (
              <span
                role="img"
                aria-label={t("common.video")}
                title={t("common.video")}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-[var(--pa-primary)] shadow-sm ring-1 ring-black/10"
              >
                <VideoIcon />
              </span>
            ) : null}
          </div>
        </div>

        {introduction ? (
          <p className="pa-card-introduction pa-card-introduction--mobile mt-2 min-w-0 break-words text-[0.76rem] font-semibold leading-[1.12rem] text-[#25302d]/62 sm:text-[0.82rem] sm:leading-[1.2rem]">
            {introduction}
          </p>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col bg-white">
        <div className="flex min-w-0 items-start justify-between gap-2 lg:gap-4">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 lg:gap-x-2.5 lg:gap-y-1.5">
              <HeadingTag className="max-w-full truncate text-[1.08rem] font-black leading-tight tracking-normal text-[#101817] sm:text-[1.22rem] lg:break-words lg:text-[1.55rem] xl:text-[1.65rem]">
                {displayName}
              </HeadingTag>
              <ProfileVerificationBadge
                status={profile.verification_status}
                label={t("verification.verified")}
                compact
              />
              <ProfileActivityBadge
                status={profile.activity_status}
                t={t}
                className="px-2 py-1 text-[0.68rem] shadow-none lg:px-2.5 lg:py-1 lg:text-[0.72rem]"
              />
            </div>

            {profile.account_type === "au_pair" &&
            profile.already_in_germany ? (
              <AlreadyInGermanyBadge
                label={t("common.alreadyInGermany")}
                compact
                className="mt-1.5 w-fit max-w-full shrink-0 self-center"
              />
            ) : null}

            <div className="mt-1.5 grid min-w-0 gap-1.5 text-[0.78rem] font-semibold text-[#25302d]/68 lg:mt-2 lg:gap-2 lg:text-[0.95rem]">
              <span className="inline-flex min-w-0 max-w-full items-center gap-2">
                <PinIcon />
                <span className="min-w-0 truncate">
                  {[
                    profile.country
                      ? formatCountryName(profile.country, locale)
                      : null,
                    profile.city,
                  ]
                    .filter(Boolean)
                    .join(", ") || t("common.locationNotSet")}
                </span>
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
              </span>
              {preferredHostCountries ? (
                <span
                  title={`${t("profile.wantsToAuPairIn")} ${preferredHostCountries}`}
                  className="flex w-full min-w-0 max-w-full items-start gap-1.5 rounded-[0.85rem] bg-[#e7f1f5] px-2.5 py-1 text-[0.7rem] font-black leading-tight text-[#286778] lg:w-fit lg:rounded-full lg:px-3 lg:py-1.5 lg:text-[0.78rem]"
                >
                  <PlaneIcon />
                  <span className="line-clamp-2 min-w-0">
                    {t("profile.wantsToAuPairIn")} {preferredHostCountries}
                  </span>
                </span>
              ) : null}
            </div>
          </div>

          <div className="relative z-[3] -mr-1 -mt-1 shrink-0">
            {isAuthenticated ? (
              <SaveProfileButton
                profileId={profile.id}
                initialSaved={isSaved}
                variant="compact"
                refreshOnToggle={false}
              />
            ) : (
              <ProfileCardGuestAction
                profileName={displayName}
                profilePhotoUrl={imageUrl}
                returnTo={profileHref}
                variant="save"
              />
            )}
          </div>
        </div>

        <div className="my-3 hidden h-px bg-[#d8e0e6] lg:block" />

        {detailItems.length > 0 ? (
          <div className="mt-2 flex min-w-0 flex-wrap gap-1.5 lg:hidden">
            {detailItems.slice(0, 3).map((item) => (
              <MobileFactChip
                key={`${item.label}-${item.value}`}
                label={item.label}
                value={item.value}
              />
            ))}
          </div>
        ) : null}

        {detailItems.length > 0 ? (
          <div className="hidden min-w-0 grid-cols-1 gap-3 sm:grid-cols-3 lg:grid">
            {detailItems.map((item, index) => (
              <DetailItem
                key={`${item.label}-${item.value}`}
                label={item.label}
                value={item.value}
                withDivider={index > 0}
              />
            ))}
          </div>
        ) : null}

        {skillHighlights.length > 0 ? (
          <div className="mt-2 flex min-w-0 flex-wrap gap-1.5 lg:mt-3">
            {skillHighlights.map((label) => (
              <span
                key={label}
                className="inline-flex max-w-full rounded-full bg-[#f3f7f5] px-2.5 py-1 text-[0.72rem] font-black leading-none text-[#2f6f5d] ring-1 ring-[#d6e7df]"
              >
                <span className="truncate">{label}</span>
              </span>
            ))}
          </div>
        ) : null}

        {introduction ? (
          <p className="pa-card-introduction pa-card-introduction--desktop min-h-0 min-w-0 break-words text-[0.82rem] font-semibold leading-[1.2rem] text-[#25302d]/62 lg:mt-4 lg:text-[0.98rem] lg:leading-[1.48rem]">
            {introduction}
          </p>
        ) : null}

        <div className="relative z-[3] mt-auto grid grid-cols-2 gap-2 pt-3 lg:gap-3 lg:pt-5">
          <ProfileNavigationLink
            href={profileHref}
            className="inline-flex h-11 min-w-0 items-center justify-center truncate whitespace-nowrap rounded-[0.55rem] border border-[#9faeb8] bg-white px-2 text-[0.78rem] font-black text-[#25302d] transition hover:bg-[#f8fafb] sm:px-4 lg:px-3 lg:text-[0.92rem]"
          >
            {t("common.viewProfile")}
          </ProfileNavigationLink>

          {isAuthenticated ? (
            <Link
              href={messageHref}
              prefetch={false}
              className="inline-flex h-11 min-w-0 cursor-pointer items-center justify-center gap-1 truncate whitespace-nowrap rounded-[0.55rem] bg-[var(--pa-primary)] px-2 text-[0.78rem] font-black text-[var(--pa-primary-ink)] shadow-sm transition hover:bg-[var(--pa-primary-hover)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-primary-focus-ring)] focus-visible:ring-offset-2 sm:gap-2 sm:px-4 lg:px-3 lg:text-[0.92rem]"
            >
              <MessageIcon className="h-4 w-4 shrink-0 lg:h-5 lg:w-5" />
              {t("common.message")}
            </Link>
          ) : (
            <ProfileCardGuestAction
              profileName={displayName}
              profilePhotoUrl={imageUrl}
              returnTo={messageHref}
              variant="message"
              className="inline-flex h-11 min-w-0 cursor-pointer items-center justify-center gap-1 truncate whitespace-nowrap rounded-[0.55rem] bg-[var(--pa-primary)] px-2 text-[0.78rem] font-black text-[var(--pa-primary-ink)] shadow-sm transition hover:bg-[var(--pa-primary-hover)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-primary-focus-ring)] focus-visible:ring-offset-2 sm:gap-2 sm:px-4 lg:px-3 lg:text-[0.92rem]"
            />
          )}
        </div>
      </div>
    </article>
  );
}
