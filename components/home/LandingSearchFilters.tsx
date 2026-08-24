"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "@/components/i18n/I18nProvider";
import { AgeRangeSlider } from "@/components/search/AgeRangeSlider";
import { InlineToggleFilter } from "@/components/search/InlineToggleFilter";
import {
  formatChildrenInfo,
  formatCountryName,
  formatGender,
} from "@/lib/i18n/formatters";
import { getLocaleTag } from "@/lib/i18n/config";
import {
  addMonthsToMonthValue,
  createStartMonthOptions,
} from "@/lib/month-options";
import { allowanceCurrencyOptions, childrenOptions } from "@/lib/profile-options";
import { scrollToInstantly } from "@/lib/scroll/instant";
import { useAccessibleDialog } from "@/components/ui/useAccessibleDialog";
import { useProfileSearchResultCount } from "@/components/search/useProfileSearchResultCount";
import { useDesktopViewport } from "@/components/ui/useDesktopViewport";

type TargetProfileType = "au_pair" | "family";

type LandingSearchFiltersProps = {
  countries: Record<TargetProfileType, string[]>;
  initialResultCounts: Record<TargetProfileType, number>;
  initialResultCountsCapped: Record<TargetProfileType, boolean>;
  className?: string;
  idPrefixBase?: string;
  initialDesktopViewport?: boolean;
  showMobileTrigger?: boolean;
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

function durationOptions() {
  return Array.from({ length: 24 }, (_, index) => index + 1);
}

function FilterIcon({
  type,
}: {
  type:
    | "sliders"
    | "pin"
    | "calendar"
    | "chat"
    | "gender"
    | "user"
    | "home"
    | "cigarette";
}) {
  const commonProps = {
    className: "h-5 w-5",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (type === "sliders") {
    return (
      <svg {...commonProps}>
        <path d="M4 7h7" />
        <path d="M15 7h5" />
        <path d="M10 5v4" />
        <path d="M4 17h5" />
        <path d="M13 17h7" />
        <path d="M9 15v4" />
      </svg>
    );
  }

  if (type === "cigarette") {
    return (
      <svg {...commonProps}>
        <path d="M3 15h12v4H3z" />
        <path d="M15 15h3v4h-3z" />
        <path d="M20 15h1" />
        <path d="M18 10c1.2-1.2 1.2-2.6 0-3.8" />
        <path d="M21 11c1.6-1.9 1.6-4 0-6" />
      </svg>
    );
  }

  if (type === "pin") {
    return (
      <svg {...commonProps}>
        <path d="M12 21s7-5.3 7-12a7 7 0 0 0-14 0c0 6.7 7 12 7 12z" />
        <circle cx="12" cy="9" r="2.4" />
      </svg>
    );
  }

  if (type === "calendar") {
    return (
      <svg {...commonProps}>
        <path d="M8 3v4" />
        <path d="M16 3v4" />
        <rect x="4" y="5" width="16" height="16" rx="3" />
        <path d="M4 10h16" />
      </svg>
    );
  }

  if (type === "chat") {
    return (
      <svg {...commonProps}>
        <path d="M21 12a8 8 0 0 1-8 8H8l-5 2 2-4a8 8 0 1 1 16-6z" />
      </svg>
    );
  }

  if (type === "home") {
    return (
      <svg {...commonProps}>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
      </svg>
    );
  }

  if (type === "gender") {
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

  return (
    <svg {...commonProps}>
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

const OPEN_LANDING_FILTERS_EVENT = "pa:open-landing-filters";

type LandingSearchFilterButtonProps = {
  className?: string;
  expanded?: boolean;
  onOpen?: () => void;
};

export function LandingSearchFilterButton({
  className,
  expanded,
  onOpen,
}: LandingSearchFilterButtonProps) {
  const t = useTranslations();

  function handleClick() {
    if (onOpen) {
      onOpen();
      return;
    }

    window.dispatchEvent(new Event(OPEN_LANDING_FILTERS_EVENT));
  }

  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={handleClick}
      className={[
        "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--pa-primary)] px-4 text-sm font-black text-[var(--pa-primary-ink)] shadow-sm ring-2 ring-[#adc9d4]/45 transition hover:bg-[var(--pa-primary-hover)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <FilterIcon type="sliders" />
      {t("filters.title")}
    </button>
  );
}

export function LandingSearchFilters({
  countries,
  initialResultCounts,
  initialResultCountsCapped,
  className,
  idPrefixBase = "landing",
  initialDesktopViewport = false,
  showMobileTrigger = true,
}: LandingSearchFiltersProps) {
  const router = useRouter();
  const isDesktopViewport = useDesktopViewport(initialDesktopViewport);
  const t = useTranslations();
  const locale = useLocale();
  const localeTag = getLocaleTag(locale);
  const durations = durationOptions();
  const [targetType, setTargetType] = useState<TargetProfileType>("au_pair");
  const [country, setCountry] = useState("");
  const [startFrom, setStartFrom] = useState("");
  const [startTo, setStartTo] = useState("");
  const months = useMemo(
    () => createStartMonthOptions(localeTag),
    [localeTag],
  );
  const [durationMin, setDurationMin] = useState("");
  const [durationMax, setDurationMax] = useState("");
  const [gender, setGender] = useState("");
  const [smoking, setSmoking] = useState("");
  const [childrenCount, setChildrenCount] = useState("");
  const [allowanceMin, setAllowanceMin] = useState("");
  const [allowanceCurrency, setAllowanceCurrency] = useState("EUR");
  const [activity, setActivity] = useState("");
  const [alreadyInGermany, setAlreadyInGermany] = useState(false);
  const [willCareForElderly, setWillCareForElderly] = useState(false);
  const [willCareForPets, setWillCareForPets] = useState(false);
  const [ageRange, setAgeRange] = useState({ min: 18, max: 30 });
  const [isAgeRangeActive, setIsAgeRangeActive] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [isOpenOnMobile, setIsOpenOnMobile] = useState(false);
  const [isNavigationPending, setIsNavigationPending] = useState(false);
  const mobileDoneButtonRef = useRef<HTMLButtonElement>(null);
  const { dialogRef, handleDialogKeyDown } =
    useAccessibleDialog<HTMLDivElement>({
      open: isOpenOnMobile,
      onClose: () => setIsOpenOnMobile(false),
      initialFocusRef: mobileDoneButtonRef,
      lockBodyScroll: false,
    });
  const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState(false);
  const showButtonToneClass =
    targetType === "au_pair"
      ? "bg-[var(--pa-aupair-cta)] text-[var(--pa-aupair-cta-text)] ring-1 ring-[var(--pa-aupair-cta-soft)] hover:bg-[var(--pa-aupair-cta-hover)] hover:shadow-md"
      : "bg-[var(--pa-family-cta)] text-[var(--pa-family-cta-text)] ring-1 ring-[#c7dce6] hover:bg-[var(--pa-family-cta-hover)] hover:shadow-md";
  const countryOptions = useMemo(
    () =>
      uniqueOptions(countries[targetType]).map(
        (option) => ({
          ...option,
          label: formatCountryName(option.value, locale, t),
        }),
      ),
    [countries, locale, t, targetType],
  );
  const childrenFilterOptions = useMemo(
    () =>
      childrenOptions.map((value) => ({
        value,
        label: formatChildrenInfo(value, t) ?? value,
      })),
    [t],
  );
  const draftFilters = useMemo(() => {
    const entries: Array<[string, string]> = [];

    if (country) entries.push(["country", country]);
    if (startFrom) entries.push(["startFrom", startFrom]);
    if (startTo) entries.push(["startTo", startTo]);
    if (durationMin) entries.push(["durationMin", durationMin]);
    if (durationMax) entries.push(["durationMax", durationMax]);
    if (activity) entries.push(["activity", activity]);
    if (hasVideo) entries.push(["has_video", "1"]);

    if (targetType === "family") {
      if (childrenCount) entries.push(["children", childrenCount]);
      if (allowanceMin) {
        entries.push(["allowanceMin", allowanceMin]);
        entries.push(["allowanceCurrency", allowanceCurrency]);
      }
    } else {
      if (gender) entries.push(["gender", gender]);
      if (smoking) entries.push(["smoking", smoking]);
      if (alreadyInGermany) entries.push(["alreadyInGermany", "1"]);
      if (willCareForElderly) entries.push(["willCareForElderly", "1"]);
      if (willCareForPets) entries.push(["willCareForPets", "1"]);
      if (isAgeRangeActive) {
        entries.push(["ageMin", String(ageRange.min)]);
        entries.push(["ageMax", String(ageRange.max)]);
      }
    }

    return Object.fromEntries(entries);
  }, [
    activity,
    ageRange.max,
    ageRange.min,
    alreadyInGermany,
    allowanceCurrency,
    allowanceMin,
    childrenCount,
    country,
    durationMax,
    durationMin,
    gender,
    hasVideo,
    isAgeRangeActive,
    smoking,
    startFrom,
    startTo,
    targetType,
    willCareForElderly,
    willCareForPets,
  ]);
  const resultCount = useProfileSearchResultCount({
    targetType,
    filters: draftFilters,
    initialCount: initialResultCounts[targetType],
    initialCapped: initialResultCountsCapped[targetType],
  });

  useEffect(() => {
    if (!isOpenOnMobile) {
      return;
    }

    const scrollY = window.scrollY;
    const originalBodyPosition = document.body.style.position;
    const originalBodyTop = document.body.style.top;
    const originalBodyWidth = document.body.style.width;
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyTouchAction = document.body.style.touchAction;

    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }

      event.preventDefault();
      setIsOpenOnMobile(false);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.position = originalBodyPosition;
      document.body.style.top = originalBodyTop;
      document.body.style.width = originalBodyWidth;
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.touchAction = originalBodyTouchAction;
      scrollToInstantly(scrollY);
    };
  }, [isOpenOnMobile]);

  useEffect(() => {
    function handleOpenLandingFilters() {
      setIsOpenOnMobile(true);
    }

    window.addEventListener(OPEN_LANDING_FILTERS_EVENT, handleOpenLandingFilters);

    return () => {
      window.removeEventListener(
        OPEN_LANDING_FILTERS_EVENT,
        handleOpenLandingFilters,
      );
    };
  }, []);

  useEffect(() => {
    if (!isNavigationPending) return;

    const timeout = window.setTimeout(
      () => setIsNavigationPending(false),
      10_000,
    );

    return () => window.clearTimeout(timeout);
  }, [isNavigationPending]);

  const advancedFilterCount =
    (activity ? 1 : 0) +
    (hasVideo ? 1 : 0) +
    (targetType === "au_pair"
      ? (gender ? 1 : 0) +
        (smoking ? 1 : 0) +
        (alreadyInGermany ? 1 : 0) +
        (willCareForElderly ? 1 : 0) +
        (willCareForPets ? 1 : 0) +
        (isAgeRangeActive ? 1 : 0)
      : (childrenCount ? 1 : 0) + (allowanceMin ? 1 : 0));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsNavigationPending(true);

    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const route = targetType === "au_pair" ? "/search-aupair" : "/search-family";

    for (const [key, value] of formData.entries()) {
      const scalarValue = String(value).trim();
      if (key === "allowanceCurrency" && !allowanceMin.trim()) continue;
      if (scalarValue) params.set(key, scalarValue);
    }

    const query = params.toString();
    router.push(query ? `${route}?${query}` : route);
  }

  function renderForm(idPrefix: string) {
    return (
      <form
        onSubmit={handleSubmit}
        className="pa-filter-panel space-y-4 lg:max-h-[calc(100vh-7rem)] lg:space-y-3 lg:overflow-y-auto lg:p-1"
      >
        <div className="hidden rounded-[1.1rem] bg-[#e7f1f5] p-3 ring-1 ring-[#c7dce6]/80 lg:block">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#45636f]">
            {t("filters.title")}
          </p>

          <h2 className="mt-2 text-lg font-black tracking-[-0.03em]">
            {t("filters.findProfiles")}
          </h2>
        </div>

        <div className="pa-filter-section">
          <p className="text-base font-black tracking-[-0.03em] lg:text-sm">
            {t("filters.imLookingFor")}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={targetType === "au_pair"}
              onClick={() => setTargetType("au_pair")}
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-black shadow-sm transition lg:h-10 ${
                targetType === "au_pair"
                  ? "bg-[var(--pa-aupair-cta)] text-[var(--pa-aupair-cta-text)] hover:bg-[var(--pa-aupair-cta-hover)]"
                  : "border border-black/10 bg-white text-[#25302d] hover:bg-[var(--background)]"
              }`}
            >
              <FilterIcon type="user" />
              {t("common.auPair")}
            </button>
            <button
              type="button"
              aria-pressed={targetType === "family"}
              onClick={() => setTargetType("family")}
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-black shadow-sm transition lg:h-10 ${
                targetType === "family"
                  ? "bg-[var(--pa-family-cta)] text-[var(--pa-family-cta-text)] hover:bg-[var(--pa-family-cta-hover)]"
                  : "border border-black/10 bg-white text-[#25302d] hover:bg-[var(--background)]"
              }`}
            >
              <FilterIcon type="home" />
              {t("common.family")}
            </button>
          </div>
        </div>

        <div className="pa-filter-section">
          <label
            htmlFor={`${idPrefix}-country`}
            className="mb-3 flex items-center gap-3 text-sm font-black"
          >
            <FilterIcon type="pin" />
            {t("common.location")}
          </label>
          <select
            id={`${idPrefix}-country`}
            name="country"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            className="h-12 w-full rounded-[1rem] border border-black/10 bg-white px-4 text-sm font-bold text-[#25302d] outline-none transition focus:border-[#6f8793]"
          >
            <option value="">{t("filters.allCountries")}</option>
            {countryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="pa-filter-section">
          <p className="flex items-center gap-3 text-sm font-black">
            <FilterIcon type="calendar" />
            {t("common.startDate")}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs font-bold text-[#25302d]/55">
              <span className="pa-filter-field-label">
                {t("common.earliest")}
              </span>
              <select
                name="startFrom"
                value={startFrom}
                onChange={(event) => {
                  const nextStartFrom = event.target.value;
                  setStartFrom(nextStartFrom);

                  if (startTo && nextStartFrom && startTo <= nextStartFrom) {
                    setStartTo(addMonthsToMonthValue(nextStartFrom, 1));
                  }
                }}
                className="mt-1 h-12 w-full rounded-[1rem] border border-black/10 bg-white px-3 text-sm font-bold text-[#25302d] outline-none transition focus:border-[#6f8793]"
              >
                <option value="">{t("common.any")}</option>
                {months.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-bold text-[#25302d]/55">
              <span className="pa-filter-field-label">
                {t("common.latest")}
              </span>
              <select
                name="startTo"
                value={startTo}
                onChange={(event) => {
                  const nextStartTo = event.target.value;
                  setStartTo(nextStartTo);

                  if (startFrom && nextStartTo && startFrom >= nextStartTo) {
                    setStartFrom("");
                  }
                }}
                className="mt-1 h-12 w-full rounded-[1rem] border border-black/10 bg-white px-3 text-sm font-bold text-[#25302d] outline-none transition focus:border-[#6f8793]"
              >
                <option value="">{t("common.any")}</option>
                {months.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="pa-filter-section">
          <p className="flex items-center gap-3 text-sm font-black">
            <FilterIcon type="calendar" />
            {t("filters.durationOfStay")}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs font-bold text-[#25302d]/55">
              <span className="pa-filter-field-label">{t("common.min")}</span>
              <select
                name="durationMin"
                value={durationMin}
                onChange={(event) => {
                  const nextDurationMin = event.target.value;
                  setDurationMin(nextDurationMin);

                  if (
                    durationMax &&
                    nextDurationMin &&
                    Number(durationMax) < Number(nextDurationMin)
                  ) {
                    setDurationMax("");
                  }
                }}
                className="mt-1 h-12 w-full rounded-[1rem] border border-black/10 bg-white px-3 text-sm font-bold text-[#25302d] outline-none transition focus:border-[#6f8793]"
              >
                <option value="">{t("common.any")}</option>
                {durations.map((duration) => (
                  <option
                    key={duration}
                    value={duration}
                    disabled={
                      durationMax ? duration > Number(durationMax) : false
                    }
                  >
                    {t(
                      duration === 1
                        ? "format.month.one"
                        : "format.month.other",
                      { count: duration },
                    )}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-bold text-[#25302d]/55">
              <span className="pa-filter-field-label">{t("common.max")}</span>
              <select
                name="durationMax"
                value={durationMax}
                onChange={(event) => {
                  const nextDurationMax = event.target.value;
                  setDurationMax(nextDurationMax);

                  if (
                    durationMin &&
                    nextDurationMax &&
                    Number(durationMin) > Number(nextDurationMax)
                  ) {
                    setDurationMin("");
                  }
                }}
                className="mt-1 h-12 w-full rounded-[1rem] border border-black/10 bg-white px-3 text-sm font-bold text-[#25302d] outline-none transition focus:border-[#6f8793]"
              >
                <option value="">{t("common.any")}</option>
                {durations.map((duration) => (
                  <option
                    key={duration}
                    value={duration}
                    disabled={
                      durationMin ? duration < Number(durationMin) : false
                    }
                  >
                    {t(
                      duration === 1
                        ? "format.month.one"
                        : "format.month.other",
                      { count: duration },
                    )}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <details
          className="pa-filter-more"
          open={isMoreFiltersOpen}
          onToggle={(event) => setIsMoreFiltersOpen(event.currentTarget.open)}
        >
          <summary className="pa-filter-more-summary">
            <span className="flex min-w-0 items-center gap-3">
              <FilterIcon type="sliders" />
              <span className="truncate">{t("filters.moreFilters")}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {advancedFilterCount > 0 ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-[#25302d] ring-1 ring-[#d6dee4]">
                  {advancedFilterCount}
                </span>
              ) : null}
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className={`h-4 w-4 transition ${
                  isMoreFiltersOpen ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.4"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </summary>

          <div className="mt-3 space-y-3">
            <div className="pa-filter-section">
              <label
                htmlFor={`${idPrefix}-activity`}
                className="mb-3 flex items-center gap-3 text-sm font-black"
              >
                <FilterIcon type="user" />
                {t("filters.activity")}
              </label>
              <select
                id={`${idPrefix}-activity`}
                name="activity"
                value={activity}
                onChange={(event) => setActivity(event.target.value)}
                className="h-12 w-full rounded-[1rem] border border-black/10 bg-white px-4 text-sm font-bold text-[#25302d] outline-none transition focus:border-[#6f8793]"
              >
                <option value="">{t("common.any")}</option>
                <option value="active">{t("activity.active")}</option>
                <option value="recently_active">
                  {t("activity.recentlyActive")}
                </option>
              </select>
            </div>

            {targetType === "au_pair" ? (
              <>
                <div className="pa-filter-section pa-filter-section--row">
                  <label
                    htmlFor={`${idPrefix}-gender`}
                    className="flex items-center gap-3 text-sm font-black"
                  >
                    <FilterIcon type="gender" />
                    {t("common.gender")}
                  </label>

                  <select
                    id={`${idPrefix}-gender`}
                    name="gender"
                    value={gender}
                    onChange={(event) => setGender(event.target.value)}
                    className="h-12 min-w-[120px] rounded-[1rem] border border-black/10 bg-white px-4 text-sm font-bold text-[#25302d] outline-none transition focus:border-[#6f8793]"
                  >
                    <option value="">{t("common.any")}</option>
                    <option value="female">
                      {formatGender("female", t) ?? "Female"}
                    </option>
                    <option value="male">
                      {formatGender("male", t) ?? "Male"}
                    </option>
                  </select>
                </div>

                <div className="pa-filter-section">
                  <InlineToggleFilter
                    title={t("common.smoking")}
                    name="smoking"
                    leadingIcon={<FilterIcon type="cigarette" />}
                    value={smoking}
                    onChange={setSmoking}
                    options={[
                      {
                        value: "non_smoker",
                        label: t("common.no"),
                        icon: "no",
                      },
                      {
                        value: "smoker",
                        label: t("common.yes"),
                        icon: "yes",
                      },
                    ]}
                  />
                </div>

                <label className="pa-filter-section pa-filter-check-row text-sm font-black">
                  <input
                    type="checkbox"
                    name="alreadyInGermany"
                    value="1"
                    checked={alreadyInGermany}
                    onChange={(event) =>
                      setAlreadyInGermany(event.target.checked)
                    }
                    className="h-5 w-5 rounded border-black/20 accent-[var(--pa-primary)]"
                  />
                  {t("common.alreadyInGermany")}
                </label>

                <label className="pa-filter-section pa-filter-check-row text-sm font-black">
                  <input
                    type="checkbox"
                    name="willCareForElderly"
                    value="1"
                    checked={willCareForElderly}
                    onChange={(event) =>
                      setWillCareForElderly(event.target.checked)
                    }
                    className="h-5 w-5 rounded border-black/20 accent-[var(--pa-primary)]"
                  />
                  {t("common.elderlyCare")}
                </label>

                <label className="pa-filter-section pa-filter-check-row text-sm font-black">
                  <input
                    type="checkbox"
                    name="willCareForPets"
                    value="1"
                    checked={willCareForPets}
                    onChange={(event) =>
                      setWillCareForPets(event.target.checked)
                    }
                    className="h-5 w-5 rounded border-black/20 accent-[var(--pa-primary)]"
                  />
                  {t("common.petCare")}
                </label>

                <div className="pa-filter-section">
                  <div className="mb-3 flex items-center gap-3 text-sm font-black">
                    <FilterIcon type="user" />
                    {t("common.age")}
                  </div>
                  <AgeRangeSlider
                    onRangeChange={(range) => {
                      setAgeRange(range);
                      setIsAgeRangeActive(true);
                    }}
                  />
                </div>
              </>
            ) : null}

            {targetType === "family" ? (
              <>
                <div className="pa-filter-section">
                  <label
                    htmlFor={`${idPrefix}-children`}
                    className="mb-3 flex items-center gap-3 text-sm font-black"
                  >
                    <FilterIcon type="home" />
                    {t("common.numberOfChildren")}
                  </label>
                  <select
                    id={`${idPrefix}-children`}
                    name="children"
                    value={childrenCount}
                    onChange={(event) => setChildrenCount(event.target.value)}
                    className="h-12 w-full rounded-[1rem] border border-black/10 bg-white px-4 text-sm font-bold text-[#25302d] outline-none transition focus:border-[#6f8793]"
                  >
                    <option value="">{t("common.any")}</option>
                    {childrenFilterOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pa-filter-section">
                  <p className="flex items-center gap-3 text-sm font-black">
                    <FilterIcon type="sliders" />
                    {t("filters.minimumAllowance")}
                  </p>
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_108px] gap-2">
                    <label className="text-xs font-bold text-[#25302d]/55">
                      <span className="pa-filter-field-label">
                        {t("filters.allowanceAmount")}
                      </span>
                      <input
                        type="number"
                        name="allowanceMin"
                        min={1}
                        max={20000}
                        step={1}
                        inputMode="numeric"
                        value={allowanceMin}
                        onChange={(event) => setAllowanceMin(event.target.value)}
                        placeholder="300"
                        className="mt-1 h-12 w-full rounded-[1rem] border border-black/10 bg-white px-3 text-sm font-bold text-[#25302d] outline-none transition focus:border-[#6f8793]"
                      />
                    </label>

                    <label className="text-xs font-bold text-[#25302d]/55">
                      <span className="pa-filter-field-label">
                        {t("common.currency")}
                      </span>
                      <select
                        name={allowanceMin ? "allowanceCurrency" : undefined}
                        value={allowanceCurrency}
                        onChange={(event) =>
                          setAllowanceCurrency(event.target.value)
                        }
                        className="mt-1 h-12 w-full rounded-[1rem] border border-black/10 bg-white px-3 text-sm font-bold text-[#25302d] outline-none transition focus:border-[#6f8793]"
                      >
                        {allowanceCurrencyOptions.map((currency) => (
                          <option key={currency} value={currency}>
                            {currency}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              </>
            ) : null}

            <label className="pa-filter-section pa-filter-check-row text-sm font-black">
              <input
                type="checkbox"
                name="has_video"
                value="1"
                checked={hasVideo}
                onChange={(event) => setHasVideo(event.target.checked)}
                className="h-5 w-5 rounded border-black/20 accent-[var(--pa-primary)]"
              />
              {t("filters.hasVideo")}
              <span className="rounded-full bg-[var(--pa-accent-soft)] px-2.5 py-1 text-xs font-black text-[#5f4638] ring-1 ring-[var(--pa-accent-ring)]/45">
                {t("common.new")}
              </span>
            </label>
          </div>
        </details>

        <div className="pa-filter-actions">
          <button
            type="submit"
            disabled={isNavigationPending}
            aria-busy={isNavigationPending || undefined}
            className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-black shadow-sm transition disabled:cursor-wait disabled:opacity-65 ${showButtonToneClass}`}
          >
            {isNavigationPending ? (
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
              />
            ) : null}
            {t("filters.showResults", { count: resultCount.label })}
          </button>
        </div>
      </form>
    );
  }

  return (
    <aside
      className={[
        "h-fit min-w-0 max-w-full lg:sticky lg:top-24",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {showMobileTrigger ? (
        <LandingSearchFilterButton
          expanded={isOpenOnMobile}
          onOpen={() => setIsOpenOnMobile(true)}
          className="lg:hidden"
        />
      ) : null}

      {isDesktopViewport ? (
        <div className="hidden rounded-[1.5rem] bg-[#fbfcfd] p-3 shadow-[0_16px_40px_rgba(38,63,69,0.08)] ring-1 ring-[#d8e0e6] lg:block">
          {renderForm(`${idPrefixBase}-desktop`)}
        </div>
      ) : null}

      {isOpenOnMobile ? (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setIsOpenOnMobile(false)}
            className="fixed inset-0 z-40 bg-black/35 lg:hidden"
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("filters.findProfiles")}
            tabIndex={-1}
            onKeyDown={handleDialogKeyDown}
            className="fixed inset-x-3 bottom-3 z-50 max-h-[calc(82dvh-1.5rem)] overflow-y-auto overscroll-contain rounded-[2rem] bg-[#fbfcfd] p-5 shadow-2xl ring-1 ring-[#d8e0e6] lg:hidden"
          >
            <div className="mx-1 mb-5 mt-1 flex items-center justify-between gap-4 rounded-[1.1rem] bg-[#e7f1f5] p-4 ring-1 ring-[#c7dce6]/80">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-[#45636f]">
                  {t("filters.title")}
                </p>
                <p className="mt-1 text-xl font-black tracking-[-0.03em]">
                  {t("filters.findProfiles")}
                </p>
              </div>

              <button
                ref={mobileDoneButtonRef}
                type="button"
                onClick={() => setIsOpenOnMobile(false)}
                className="inline-flex h-11 items-center rounded-full border border-[#d8e0e6] bg-white/95 px-4 text-sm font-black text-[#25302d]"
              >
                {t("common.done")}
              </button>
            </div>
            {renderForm(`${idPrefixBase}-mobile`)}
          </div>
        </>
      ) : null}
    </aside>
  );
}
