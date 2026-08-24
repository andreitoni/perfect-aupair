"use client";

import Form from "next/form";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "@/components/i18n/I18nProvider";
import { AgeRangeSlider } from "@/components/search/AgeRangeSlider";
import {
  InlineToggleFilter,
  type InlineToggleOption,
} from "@/components/search/InlineToggleFilter";
import { getLocaleTag } from "@/lib/i18n/config";
import {
  addMonthsToMonthValue,
  createStartMonthOptions,
  normalizeStartMonthRange,
} from "@/lib/month-options";
import { allowanceCurrencyOptions } from "@/lib/profile-options";
import { scrollToInstantly } from "@/lib/scroll/instant";
import { useAccessibleDialog } from "@/components/ui/useAccessibleDialog";
import {
  SearchSortControl,
  type SearchSortLabels,
} from "@/components/search/SearchSortControl";
import type { ProfileSearchSort } from "@/lib/profiles/pagination";
import { useProfileSearchResultCount } from "@/components/search/useProfileSearchResultCount";
import { BookmarkIcon } from "@/components/icons/BookmarkIcon";
import { useDesktopViewport } from "@/components/ui/useDesktopViewport";

type FilterOption = {
  label: string;
  value: string;
};

type FilterGroup = {
  title: string;
  key: string;
  options: FilterOption[];
};

type SearchFiltersProps = {
  title: string;
  groups: FilterGroup[];
  currentFilters?: Record<string, string | string[] | undefined>;
  targetType: "au_pair" | "family";
  initialResultCount: number;
  initialResultCountCapped?: boolean;
  tone?: "au_pair" | "family";
  showAgeFilter?: boolean;
  showAllowanceFilter?: boolean;
  className?: string;
  initialDesktopViewport?: boolean;
  mobileHeader?: {
    eyebrow?: string;
    title: string;
    description?: string;
    savedLink?: {
      href: string;
      label: string;
      ariaLabel: string;
    };
  };
  mobileSort?: {
    basePath: string;
    filters: Record<string, string | string[] | undefined>;
    labels: SearchSortLabels;
    sort: ProfileSearchSort;
  };
};

function getFilterValue(
  filters: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = filters[key];

  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function durationOptions() {
  return Array.from({ length: 24 }, (_, index) => index + 1);
}

function shouldKeepHiddenFilter(key: string) {
  return ![
    "startFrom",
    "startTo",
    "durationMin",
    "durationMax",
    "ageMin",
    "ageMax",
    "allowanceMin",
    "allowanceCurrency",
    "has_video",
    "has_stories",
    "language",
    "page",
  ].includes(key);
}

function countActiveFilters(
  filters: Record<string, string | string[] | undefined>,
) {
  return Object.entries(filters).filter(([key, value]) => {
    if (key === "page" || key === "sort") {
      return false;
    }

    const scalarValue = Array.isArray(value) ? value[0] : value;

    if (key === "allowanceCurrency" && !getFilterValue(filters, "allowanceMin")) {
      return false;
    }

    return Boolean(scalarValue);
  }).length;
}

function canonicalSearchParams(params: URLSearchParams) {
  return Array.from(params.entries())
    .sort(([firstKey, firstValue], [secondKey, secondValue]) =>
      firstKey === secondKey
        ? firstValue.localeCompare(secondValue)
        : firstKey.localeCompare(secondKey),
    )
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
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

function getGroupIcon(
  key: string,
):
  | "sliders"
  | "pin"
  | "calendar"
  | "chat"
  | "gender"
  | "user"
  | "home"
  | "cigarette" {
  if (key === "country") return "pin";
  if (key === "children") return "home";
  if (key === "gender") return "gender";
  if (key === "smoking") return "cigarette";
  if (key === "activity") return "user";
  if (key === "alreadyInGermany") return "pin";
  if (key === "willCareForElderly") return "user";
  if (key === "willCareForPets") return "home";
  return "sliders";
}

export function SearchFilters({
  title,
  groups,
  currentFilters = {},
  targetType,
  initialResultCount,
  initialResultCountCapped = false,
  showAgeFilter = false,
  showAllowanceFilter = false,
  className,
  initialDesktopViewport = false,
  mobileHeader,
  mobileSort,
}: SearchFiltersProps) {
  const pathname = usePathname();
  const isDesktopViewport = useDesktopViewport(initialDesktopViewport);
  const t = useTranslations();
  const locale = useLocale();
  const localeTag = getLocaleTag(locale);
  const durations = durationOptions();

  const initialStartWindow = normalizeStartMonthRange({
    from: getFilterValue(currentFilters, "startFrom"),
    to: getFilterValue(currentFilters, "startTo"),
  });
  const [startFrom, setStartFrom] = useState(initialStartWindow.startFrom);
  const [startTo, setStartTo] = useState(initialStartWindow.startTo);
  const months = useMemo(
    () => createStartMonthOptions(localeTag),
    [localeTag],
  );
  const [durationMin, setDurationMin] = useState(
    getFilterValue(currentFilters, "durationMin"),
  );
  const [durationMax, setDurationMax] = useState(
    getFilterValue(currentFilters, "durationMax"),
  );
  const [allowanceMin, setAllowanceMin] = useState(
    getFilterValue(currentFilters, "allowanceMin"),
  );
  const [allowanceCurrency, setAllowanceCurrency] = useState(
    getFilterValue(currentFilters, "allowanceCurrency") || "EUR",
  );
  const [groupValues, setGroupValues] = useState(() =>
    Object.fromEntries(
      groups.map((group) => [
        group.key,
        getFilterValue(currentFilters, group.key),
      ]),
    ),
  );
  const [ageRange, setAgeRange] = useState({
    min: Number(getFilterValue(currentFilters, "ageMin") || 18),
    max: Number(getFilterValue(currentFilters, "ageMax") || 30),
  });
  const [isAgeRangeActive, setIsAgeRangeActive] = useState(
    Boolean(
      getFilterValue(currentFilters, "ageMin") ||
        getFilterValue(currentFilters, "ageMax"),
    ),
  );
  const [hasVideo, setHasVideo] = useState(
    Boolean(
      getFilterValue(currentFilters, "has_video") ||
        getFilterValue(currentFilters, "has_stories"),
    ),
  );
  const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState(() =>
    Boolean(
      getFilterValue(currentFilters, "allowanceMin") ||
        getFilterValue(currentFilters, "ageMin") ||
        getFilterValue(currentFilters, "ageMax") ||
        getFilterValue(currentFilters, "has_video") ||
        getFilterValue(currentFilters, "has_stories") ||
        groups.some(
          (group) =>
            group.key !== "country" &&
            Boolean(getFilterValue(currentFilters, group.key)),
        ),
    ),
  );
  const [isOpenOnMobile, setIsOpenOnMobile] = useState(false);
  const [isSavedNavigationPending, setIsSavedNavigationPending] =
    useState(false);
  const [isFilterNavigationPending, setIsFilterNavigationPending] =
    useState(false);
  const mobileDoneButtonRef = useRef<HTMLButtonElement>(null);
  const { dialogRef, handleDialogKeyDown } =
    useAccessibleDialog<HTMLFormElement>({
      open: isOpenOnMobile,
      onClose: () => setIsOpenOnMobile(false),
      initialFocusRef: mobileDoneButtonRef,
      lockBodyScroll: false,
    });
  const activeFilterCount = countActiveFilters(currentFilters);

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
    if (!isFilterNavigationPending && !isSavedNavigationPending) return;

    const timeout = window.setTimeout(() => {
      setIsFilterNavigationPending(false);
      setIsSavedNavigationPending(false);
    }, 10_000);

    return () => window.clearTimeout(timeout);
  }, [isFilterNavigationPending, isSavedNavigationPending]);

  const showButtonToneClass =
    "bg-[var(--pa-primary)] text-[var(--pa-primary-ink)] hover:bg-[var(--pa-primary-hover)] hover:shadow-md";
  const primaryGroups = groups.filter((group) => group.key === "country");
  const secondaryGroups = groups.filter((group) => group.key !== "country");
  const renderedGroupKeys = useMemo(
    () => new Set(groups.map((group) => group.key)),
    [groups],
  );
  const draftFilters = useMemo(() => {
    const entries: Array<[string, string]> = [];

    Object.entries(currentFilters).forEach(([key, value]) => {
      const scalarValue = Array.isArray(value) ? value[0] : value;

      if (
        scalarValue &&
        shouldKeepHiddenFilter(key) &&
        !renderedGroupKeys.has(key)
      ) {
        entries.push([key, scalarValue]);
      }
    });

    Object.entries(groupValues).forEach(([key, value]) => {
      if (value) entries.push([key, value]);
    });

    if (startFrom) entries.push(["startFrom", startFrom]);
    if (startTo) entries.push(["startTo", startTo]);
    if (durationMin) entries.push(["durationMin", durationMin]);
    if (durationMax) entries.push(["durationMax", durationMax]);
    if (showAgeFilter && isAgeRangeActive) {
      entries.push(["ageMin", String(ageRange.min)]);
      entries.push(["ageMax", String(ageRange.max)]);
    }
    if (showAllowanceFilter && allowanceMin) {
      entries.push(["allowanceMin", allowanceMin]);
      entries.push(["allowanceCurrency", allowanceCurrency]);
    }
    if (hasVideo) entries.push(["has_video", "1"]);

    return Object.fromEntries(entries);
  }, [
    ageRange.max,
    ageRange.min,
    allowanceCurrency,
    allowanceMin,
    currentFilters,
    durationMax,
    durationMin,
    groupValues,
    hasVideo,
    isAgeRangeActive,
    renderedGroupKeys,
    showAgeFilter,
    showAllowanceFilter,
    startFrom,
    startTo,
  ]);
  const resultCount = useProfileSearchResultCount({
    targetType,
    filters: draftFilters,
    initialFilters: currentFilters,
    initialCount: initialResultCount,
    initialCapped: initialResultCountCapped,
  });
  const advancedFilterCount = useMemo(() => {
    return (
      secondaryGroups.filter((group) => Boolean(groupValues[group.key])).length +
      (showAllowanceFilter && allowanceMin ? 1 : 0) +
      (showAgeFilter && isAgeRangeActive ? 1 : 0) +
      (hasVideo ? 1 : 0)
    );
  }, [
    allowanceMin,
    groupValues,
    hasVideo,
    isAgeRangeActive,
    secondaryGroups,
    showAgeFilter,
    showAllowanceFilter,
  ]);
  return (
    <aside
      className={[
        "h-fit min-w-0 max-w-full lg:sticky lg:top-24",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {mobileHeader ? (
        <div className="rounded-[1rem] bg-[#f8fbfc] px-3 py-2 shadow-sm ring-1 ring-[#cddbe2] lg:hidden">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <button
              type="button"
              aria-label={`${mobileHeader.title}. ${t("filters.title")}`}
              aria-expanded={isOpenOnMobile}
              onClick={() => setIsOpenOnMobile(true)}
              className="min-w-0 rounded-lg text-left outline-none transition hover:text-[var(--pa-primary)] focus-visible:ring-2 focus-visible:ring-[var(--pa-primary)]/35"
            >
              {mobileHeader.eyebrow ? (
                <span className="block text-[0.7rem] font-black uppercase tracking-[0.18em] text-[#6f8793]">
                  {mobileHeader.eyebrow}
                </span>
              ) : null}

              <span className="block truncate text-[1.05rem] font-black leading-tight tracking-normal sm:text-2xl">
                {mobileHeader.title}
              </span>

              {mobileHeader.description ? (
                <span className="mt-0.5 block truncate text-[0.78rem] font-bold leading-tight text-[#536360] sm:text-sm">
                  {mobileHeader.description}
                </span>
              ) : null}
            </button>

            {mobileHeader.savedLink ? (
              <Link
                href={mobileHeader.savedLink.href}
                prefetch={false}
                aria-label={mobileHeader.savedLink.ariaLabel}
                title={mobileHeader.savedLink.ariaLabel}
                aria-busy={isSavedNavigationPending || undefined}
                onClick={(event) => {
                  if (
                    event.defaultPrevented ||
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return;
                  }

                  setIsSavedNavigationPending(true);
                }}
                className="inline-flex h-10 max-w-[7.75rem] shrink-0 items-center gap-1.5 rounded-full border border-[#b9cfd8] bg-[#e9f3f6] px-3 text-sm font-black text-[#285464] shadow-sm transition hover:bg-[#dcecf1] active:scale-[0.98] aria-busy:pointer-events-none aria-busy:opacity-65"
              >
                <BookmarkIcon
                  filled
                  className="h-[1.05rem] w-[1.05rem] shrink-0"
                />
                <span className="truncate">{mobileHeader.savedLink.label}</span>
                {isSavedNavigationPending ? (
                  <span
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
                  />
                ) : (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    className="h-3.5 w-3.5 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.2"
                  >
                    <path d="m7.5 4.5 5 5-5 5" />
                  </svg>
                )}
              </Link>
            ) : null}

            {!mobileSort ? (
              <button
                type="button"
                aria-label={t("filters.title")}
                aria-expanded={isOpenOnMobile}
                title={t("filters.title")}
                onClick={() => setIsOpenOnMobile((current) => !current)}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--pa-primary)] px-4 text-sm font-black text-[var(--pa-primary-ink)] shadow-sm ring-2 ring-[#adc9d4]/45 transition hover:bg-[var(--pa-primary-hover)]"
              >
                <FilterIcon type="sliders" />
                <span>{t("filters.title")}</span>
                {activeFilterCount > 0 ? (
                  <span>· {activeFilterCount}</span>
                ) : null}
              </button>
            ) : null}
          </div>

          {mobileSort ? (
            <div className="mt-2 flex min-w-0 items-center gap-2 border-t border-[#d5e1e6] pt-2">
              <SearchSortControl
                basePath={mobileSort.basePath}
                filters={mobileSort.filters}
                labels={mobileSort.labels}
                sort={mobileSort.sort}
                variant="mobile"
              />

              <button
                type="button"
                aria-label={t("filters.title")}
                aria-expanded={isOpenOnMobile}
                title={t("filters.title")}
                onClick={() => setIsOpenOnMobile((current) => !current)}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--pa-primary)] px-3 text-sm font-black text-[var(--pa-primary-ink)] shadow-sm ring-2 ring-[#adc9d4]/45 transition hover:bg-[var(--pa-primary-hover)] sm:px-4"
              >
                <FilterIcon type="sliders" />
                <span>{t("filters.title")}</span>
                {activeFilterCount > 0 ? (
                  <span>· {activeFilterCount}</span>
                ) : null}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          aria-expanded={isOpenOnMobile}
          onClick={() => setIsOpenOnMobile((current) => !current)}
          className="inline-flex h-12 items-center justify-center gap-3 rounded-full bg-[var(--pa-primary)] px-6 text-base font-black text-[var(--pa-primary-ink)] shadow-sm ring-4 ring-[#adc9d4]/45 transition hover:bg-[var(--pa-primary-hover)] lg:hidden"
        >
          <FilterIcon type="sliders" />
          {t("filters.title")}
          {activeFilterCount > 0 ? (
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs">
              {activeFilterCount}
            </span>
          ) : null}
        </button>
      )}

      {isOpenOnMobile ? (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setIsOpenOnMobile(false)}
          className="fixed inset-0 z-40 bg-black/35 lg:hidden"
        />
      ) : null}

      {isDesktopViewport || isOpenOnMobile ? (
      <Form
        action={pathname}
        ref={dialogRef}
        role={isOpenOnMobile ? "dialog" : undefined}
        aria-modal={isOpenOnMobile ? true : undefined}
        aria-label={isOpenOnMobile ? title : undefined}
        tabIndex={isOpenOnMobile ? -1 : undefined}
        onSubmit={(event) => {
          const submittedParams = new URLSearchParams();

          for (const [key, value] of new FormData(event.currentTarget)) {
            if (typeof value === "string" && value) {
              submittedParams.append(key, value);
            }
          }

          if (
            canonicalSearchParams(submittedParams) !==
            canonicalSearchParams(new URLSearchParams(window.location.search))
          ) {
            setIsFilterNavigationPending(true);
          }
          setIsOpenOnMobile(false);
        }}
        onKeyDown={isOpenOnMobile ? handleDialogKeyDown : undefined}
        className={`pa-filter-panel ${
          isOpenOnMobile
            ? "fixed inset-x-0 bottom-0 z-50 block max-h-[82dvh] overflow-y-auto overscroll-contain rounded-t-[2rem] bg-white p-5 shadow-2xl ring-1 ring-[#d8e0e6]"
            : "hidden"
        } space-y-0 lg:static lg:block lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:rounded-[0.95rem] lg:bg-white lg:p-4 lg:shadow-[0_10px_26px_rgba(38,63,69,0.05)] lg:ring-1 lg:ring-[#d8e0e6]`}
      >
        <input
          type="hidden"
          data-search-draft-filters="true"
          value={JSON.stringify(draftFilters)}
          readOnly
        />
        <input
          type="hidden"
          data-search-draft-result-count="true"
          value={resultCount.count}
          readOnly
        />
        <input
          type="hidden"
          data-search-draft-result-count-capped="true"
          value={String(resultCount.capped)}
          readOnly
        />

        <div className="hidden border-b border-[#d8e0e6] pb-4 lg:block">
          <p className="flex items-center gap-3 text-[1.05rem] font-black text-[#101817]">
            <FilterIcon type="sliders" />
            <span>{t("filters.title")}</span>
          </p>

          <h2 className="mt-3 text-[0.98rem] font-black tracking-normal text-[#101817]">
            {title}
          </h2>
        </div>
        <div className="flex items-center justify-between gap-4 border-b border-[#d8e0e6] pb-4 lg:hidden">
          <div>
            <p className="flex items-center gap-3 text-xl font-black tracking-normal text-[#101817]">
              <FilterIcon type="sliders" />
              <span>{t("filters.title")}</span>
            </p>
            <p className="mt-3 text-base font-black tracking-normal text-[#101817]">
              {title}
            </p>
          </div>

          <button
            ref={mobileDoneButtonRef}
            type="button"
            onClick={() => setIsOpenOnMobile(false)}
            className="rounded-[0.55rem] border border-[#9faeb8] bg-white px-4 py-2 text-sm font-black text-[#25302d]"
          >
            {t("common.done")}
          </button>
        </div>

        {Object.entries(currentFilters).map(([key, value]) => {
          const scalarValue = Array.isArray(value) ? value[0] : value;

          if (
            !scalarValue ||
            !shouldKeepHiddenFilter(key) ||
            renderedGroupKeys.has(key)
          ) {
            return null;
          }

          return (
            <input key={key} type="hidden" name={key} value={scalarValue} />
          );
        })}

        {primaryGroups.map((group) => (
          <div key={group.key} className="pa-filter-section">
            <p className="mb-3 flex items-center gap-3 text-sm font-black">
              <FilterIcon type={getGroupIcon(group.key)} />
              {group.title}
            </p>

            <select
              aria-label={group.title}
              name={group.key}
              value={groupValues[group.key] ?? ""}
              onChange={(event) =>
                setGroupValues((current) => ({
                  ...current,
                  [group.key]: event.target.value,
                }))
              }
              className="h-12 w-full rounded-[1rem] border border-black/10 bg-white px-4 text-sm font-bold text-[#25302d] outline-none transition focus:border-[#6f8793]"
            >
              <option value="">
                {group.key === "country"
                  ? t("filters.allCountries")
                  : t("common.any")}
              </option>
              {group.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}

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
            {showAllowanceFilter ? (
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
            ) : null}

            {secondaryGroups.map((group) => {
              if (group.key === "gender") {
                return (
                  <div
                    key={group.key}
                    className="pa-filter-section pa-filter-section--row"
                  >
                    <label
                      htmlFor={`search-filter-${group.key}`}
                      className="flex items-center gap-3 text-sm font-black"
                    >
                      <FilterIcon type={getGroupIcon(group.key)} />
                      {group.title}
                    </label>

                    <select
                      id={`search-filter-${group.key}`}
                      name={group.key}
                      value={groupValues[group.key] ?? ""}
                      onChange={(event) =>
                        setGroupValues((current) => ({
                          ...current,
                          [group.key]: event.target.value,
                        }))
                      }
                      className="h-12 min-w-[120px] rounded-[1rem] border border-black/10 bg-white px-4 text-sm font-bold text-[#25302d] outline-none transition focus:border-[#6f8793]"
                    >
                      <option value="">{t("common.any")}</option>
                      {group.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }

              if (group.key === "smoking") {
                const inlineOptions: InlineToggleOption[] = [
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
                ];

                return (
                  <div key={group.key} className="pa-filter-section">
                    <InlineToggleFilter
                      title={group.title}
                      name={group.key}
                      leadingIcon={<FilterIcon type={getGroupIcon(group.key)} />}
                      value={groupValues[group.key] ?? ""}
                      options={inlineOptions}
                      onChange={(nextValue) =>
                        setGroupValues((current) => ({
                          ...current,
                          [group.key]: nextValue,
                        }))
                      }
                    />
                  </div>
                );
              }

              return (
                <div key={group.key} className="pa-filter-section">
                  <p className="mb-3 flex items-center gap-3 text-sm font-black">
                    <FilterIcon type={getGroupIcon(group.key)} />
                    {group.title}
                  </p>

                  <select
                    name={group.key}
                    value={groupValues[group.key] ?? ""}
                    onChange={(event) =>
                      setGroupValues((current) => ({
                        ...current,
                        [group.key]: event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-[1rem] border border-black/10 bg-white px-4 text-sm font-bold text-[#25302d] outline-none transition focus:border-[#6f8793]"
                  >
                    <option value="">{t("common.any")}</option>
                    {group.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}

            {showAgeFilter ? (
              <div className="pa-filter-section">
                <p className="mb-3 flex items-center gap-3 text-sm font-black">
                  <FilterIcon type="user" />
                  {t("common.age")}
                </p>
                <AgeRangeSlider
                  initialMin={getFilterValue(currentFilters, "ageMin")}
                  initialMax={getFilterValue(currentFilters, "ageMax")}
                  onRangeChange={(range) => {
                    setAgeRange(range);
                    setIsAgeRangeActive(true);
                  }}
                />
              </div>
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

        <div className="pa-filter-actions flex flex-col gap-2 sm:flex-row lg:flex-col">
          <button
            type="submit"
            disabled={isFilterNavigationPending}
            aria-busy={isFilterNavigationPending || undefined}
            className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-[0.55rem] px-4 text-sm font-black shadow-sm transition disabled:cursor-wait disabled:opacity-65 ${showButtonToneClass}`}
          >
            {isFilterNavigationPending ? (
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
              />
            ) : null}
            {t("filters.showResults", { count: resultCount.label })}
          </button>

          <Link
            href="?"
            prefetch={false}
            className="inline-flex h-10 items-center justify-center rounded-[0.55rem] border border-[#9faeb8] bg-white px-4 text-sm font-black text-[#25302d] transition hover:bg-[#f8fafb]"
          >
            {t("filters.clear")}
          </Link>
        </div>
      </Form>
      ) : null}
    </aside>
  );
}
