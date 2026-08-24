export type MonthOption = {
  label: string;
  value: string;
};

type ParsedMonth = {
  monthIndex: number;
  sortKey: number;
  value: string;
  year: number;
};

export const START_MONTH_ROLLOVER_TIME_ZONE = "Europe/Berlin";

function parseMonthValue(value?: string | null): ParsedMonth | null {
  const match = value?.trim().match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const monthIndex = month - 1;

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthIndex) ||
    monthIndex < 0 ||
    monthIndex > 11
  ) {
    return null;
  }

  return {
    year,
    monthIndex,
    sortKey: year * 12 + monthIndex,
    value: `${year}-${String(month).padStart(2, "0")}`,
  };
}

function createMonthValue(year: number, monthIndex: number) {
  const date = new Date(Date.UTC(year, monthIndex, 1));

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
}

function getCurrentMonthParts(
  now: Date,
  timeZone = START_MONTH_ROLLOVER_TIME_ZONE,
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(now);

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);

  if (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12
  ) {
    return { year, monthIndex: month - 1 };
  }

  return {
    year: now.getUTCFullYear(),
    monthIndex: now.getUTCMonth(),
  };
}

function createMonthOption(
  parsedMonth: ParsedMonth,
  localeTag: string,
): MonthOption & { sortKey: number } {
  const date = new Date(
    Date.UTC(parsedMonth.year, parsedMonth.monthIndex, 1),
  );

  return {
    value: parsedMonth.value,
    sortKey: parsedMonth.sortKey,
    label: new Intl.DateTimeFormat(localeTag, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date),
  };
}

export function toMonthValue(value?: string | null) {
  return parseMonthValue(value)?.value ?? "";
}

export function getCurrentMonthValue(now = new Date()) {
  const { monthIndex, year } = getCurrentMonthParts(now);

  return createMonthValue(year, monthIndex);
}

export function addMonthsToMonthValue(value: string, monthCount: number) {
  const parsedMonth = parseMonthValue(value);

  if (!parsedMonth) return "";

  return createMonthValue(parsedMonth.year, parsedMonth.monthIndex + monthCount);
}

export function normalizeStartMonthRange({
  from,
  now = new Date(),
  to,
}: {
  from?: string | null;
  now?: Date;
  to?: string | null;
}) {
  const currentMonth = getCurrentMonthValue(now);
  let startFrom = toMonthValue(from);
  let startTo = toMonthValue(to);

  if (startFrom && startFrom < currentMonth) {
    startFrom = currentMonth;
  }

  if (startTo && startTo < currentMonth) {
    startTo = currentMonth;
  }

  if (startFrom && startTo && startTo <= startFrom) {
    startTo = addMonthsToMonthValue(startFrom, 1);
  }

  return { startFrom, startTo };
}

export function createStartMonthOptions(
  localeTag: string,
  {
    monthCount = 24,
    now = new Date(),
    preservedValues = [],
  }: {
    monthCount?: number;
    now?: Date;
    preservedValues?: Array<string | null | undefined>;
  } = {},
): MonthOption[] {
  const optionsByValue = new Map<
    string,
    MonthOption & { sortKey: number }
  >();
  const { monthIndex: currentMonth, year: currentYear } =
    getCurrentMonthParts(now);

  Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(Date.UTC(currentYear, currentMonth + index, 1));
    const parsedMonth = parseMonthValue(
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
        2,
        "0",
      )}`,
    );

    if (!parsedMonth) return;

    optionsByValue.set(
      parsedMonth.value,
      createMonthOption(parsedMonth, localeTag),
    );
  });

  preservedValues.forEach((value) => {
    const parsedMonth = parseMonthValue(value);

    if (parsedMonth && !optionsByValue.has(parsedMonth.value)) {
      optionsByValue.set(
        parsedMonth.value,
        createMonthOption(parsedMonth, localeTag),
      );
    }
  });

  return Array.from(optionsByValue.values())
    .sort((left, right) => left.sortKey - right.sortKey)
    .map(({ label, value }) => ({ label, value }));
}
