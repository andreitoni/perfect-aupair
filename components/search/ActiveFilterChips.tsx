import Link from "next/link";
import {
  type LanguageCode,
  createTranslator,
  formatAllowance,
  formatChildrenInfo,
  formatCountryName,
  formatDuration,
  formatGender,
  formatLanguageName,
  formatMonth,
  formatSmoking,
} from "@/lib/i18n/translations";

type SearchFilterParams = Record<string, string | string[] | undefined>;

type ActiveFilterChipsProps = {
  basePath: string;
  filters: SearchFilterParams;
  locale: LanguageCode;
  title: string;
  resultSummary: string;
};

type FilterChip = {
  id: string;
  label: string;
  href: string;
};

function getScalarFilter(filters: SearchFilterParams, key: string) {
  const value = filters[key];

  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function isTruthyFilter(value: string) {
  return ["1", "true", "on"].includes(value);
}

function parsePositiveInteger(value: string) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatMonthFilter(value: string, locale: LanguageCode) {
  return formatMonth(`${value}-01`, locale) ?? value;
}

function formatRangeLabel({
  from,
  to,
  locale,
  fromLabel,
  untilLabel,
}: {
  from: string;
  to: string;
  locale: LanguageCode;
  fromLabel: string;
  untilLabel: string;
}) {
  if (from && to) {
    return `${formatMonthFilter(from, locale)} - ${formatMonthFilter(
      to,
      locale,
    )}`;
  }

  if (from) return `${fromLabel} ${formatMonthFilter(from, locale)}`;
  return `${untilLabel} ${formatMonthFilter(to, locale)}`;
}

function buildFilterHref(
  basePath: string,
  filters: SearchFilterParams,
  keysToRemove: string[],
) {
  const removedKeys = new Set([...keysToRemove, "page"]);
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (removedKeys.has(key)) return;

    const values = Array.isArray(value) ? value : [value];

    values.forEach((entry) => {
      const scalarValue = entry?.trim();
      if (scalarValue) params.append(key, scalarValue);
    });
  });

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function ActiveFilterChips({
  basePath,
  filters,
  locale,
  title,
  resultSummary,
}: ActiveFilterChipsProps) {
  const t = createTranslator(locale);
  const chips: FilterChip[] = [];

  function addChip(id: string, label: string, keysToRemove: string[]) {
    chips.push({
      id,
      label,
      href: buildFilterHref(basePath, filters, keysToRemove),
    });
  }

  const country = getScalarFilter(filters, "country");
  const language = getScalarFilter(filters, "language");
  const startFrom = getScalarFilter(filters, "startFrom");
  const startTo = getScalarFilter(filters, "startTo");
  const durationMin = getScalarFilter(filters, "durationMin");
  const durationMax = getScalarFilter(filters, "durationMax");
  const ageMin = getScalarFilter(filters, "ageMin");
  const ageMax = getScalarFilter(filters, "ageMax");
  const activity = getScalarFilter(filters, "activity");
  const gender = getScalarFilter(filters, "gender");
  const smoking = getScalarFilter(filters, "smoking");
  const children = getScalarFilter(filters, "children");
  const allowanceMin = getScalarFilter(filters, "allowanceMin");
  const allowanceCurrency =
    getScalarFilter(filters, "allowanceCurrency") || "EUR";
  const alreadyInGermany = getScalarFilter(filters, "alreadyInGermany");
  const willCareForElderly = getScalarFilter(filters, "willCareForElderly");
  const willCareForPets = getScalarFilter(filters, "willCareForPets");
  const hasVideo = getScalarFilter(filters, "has_video");
  const hasStories = getScalarFilter(filters, "has_stories");

  if (country) {
    addChip(
      "country",
      `${t("common.location")}: ${formatCountryName(country, locale)}`,
      ["country"],
    );
  }

  if (language) {
    addChip(
      "language",
      `${t("common.languages")}: ${formatLanguageName(language, locale)}`,
      ["language"],
    );
  }

  if (startFrom || startTo) {
    addChip(
      "start",
      `${t("common.startDate")}: ${formatRangeLabel({
        from: startFrom,
        to: startTo,
        locale,
        fromLabel: t("common.from"),
        untilLabel: t("common.until"),
      })}`,
      ["startFrom", "startTo"],
    );
  }

  if (durationMin || durationMax) {
    addChip(
      "duration",
      `${t("common.duration")}: ${formatDuration(
        locale,
        parsePositiveInteger(durationMin),
        parsePositiveInteger(durationMax),
      )}`,
      ["durationMin", "durationMax"],
    );
  }

  if (ageMin || ageMax) {
    const ageLabel =
      ageMin && ageMax
        ? `${ageMin}-${ageMax}`
        : ageMin
          ? `${t("common.from")} ${ageMin}`
          : `${t("common.until")} ${ageMax}`;

    addChip("age", `${t("common.age")}: ${ageLabel}`, ["ageMin", "ageMax"]);
  }

  if (activity) {
    addChip(
      "activity",
      activity === "active"
        ? t("activity.active")
        : activity === "recently_active"
          ? t("activity.recentlyActive")
          : activity,
      ["activity"],
    );
  }

  if (isTruthyFilter(hasVideo) || isTruthyFilter(hasStories)) {
    addChip("video", t("filters.hasVideo"), ["has_video", "has_stories"]);
  }

  if (gender) {
    addChip(
      "gender",
      `${t("common.gender")}: ${formatGender(gender, locale) ?? gender}`,
      ["gender"],
    );
  }

  if (smoking) {
    addChip(
      "smoking",
      `${t("common.smoking")}: ${
        smoking === "smoker" || smoking === "non_smoker"
          ? formatSmoking(smoking, locale)
          : smoking
      }`,
      ["smoking"],
    );
  }

  if (children) {
    addChip(
      "children",
      `${t("common.children")}: ${
        formatChildrenInfo(children, locale) ?? children
      }`,
      ["children"],
    );
  }

  if (allowanceMin) {
    const amount = parsePositiveInteger(allowanceMin);

    addChip(
      "allowance",
      `${t("filters.minimumAllowance")}: ${
        amount
          ? formatAllowance(amount, allowanceCurrency, locale) ?? allowanceMin
          : allowanceMin
      }`,
      ["allowanceMin", "allowanceCurrency"],
    );
  }

  if (isTruthyFilter(alreadyInGermany)) {
    addChip("already-in-germany", t("common.alreadyInGermany"), [
      "alreadyInGermany",
    ]);
  }

  if (isTruthyFilter(willCareForElderly)) {
    addChip("elderly-care", t("common.elderlyCare"), [
      "willCareForElderly",
    ]);
  }

  if (isTruthyFilter(willCareForPets)) {
    addChip("pet-care", t("common.petCare"), ["willCareForPets"]);
  }

  if (chips.length === 0) return null;

  return (
    <div className="mb-3 rounded-[1.25rem] bg-[#f8fbfc] px-4 py-3 shadow-[0_10px_28px_rgba(38,63,69,0.05)] ring-1 ring-[#cddbe2] sm:mb-5 sm:px-5 sm:py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-black uppercase tracking-normal text-[#667985]">
            {t("filters.title")}
          </p>
          <h2 className="mt-1 text-[1.35rem] font-black leading-tight tracking-normal text-[#101817] sm:text-2xl">
            {title}
          </h2>
          <p className="mt-1 text-sm font-semibold text-[#25302d]/50">
            {resultSummary}
          </p>
        </div>

        <Link
          href={basePath}
          prefetch={false}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-[#cddbe2] bg-white/80 px-4 text-sm font-black text-[#25302d] transition hover:bg-white"
        >
          {t("filters.clear")}
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <Link
            key={chip.id}
            href={chip.href}
            prefetch={false}
            aria-label={`${t("common.remove")} ${chip.label}`}
            className="group inline-flex max-w-full items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#25302d] ring-1 ring-[#cddbe2] transition hover:bg-[#edf3f6]"
          >
            <span className="min-w-0 truncate">{chip.label}</span>
            <span
              aria-hidden="true"
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white text-[0.8rem] leading-none text-[#6f8793] ring-1 ring-[#d6dee4] transition group-hover:text-[#25302d]"
            >
              x
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
