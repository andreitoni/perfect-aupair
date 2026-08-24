import { normalizeStartMonthRange } from "@/lib/month-options";

type SearchFilterMap = Record<string, unknown>;

function getScalarFilterValue(value: unknown) {
  if (Array.isArray(value)) {
    return getScalarFilterValue(value[0]);
  }

  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "";

  return "";
}

export function normalizeSearchMonthFilters<T extends SearchFilterMap>(
  filters: T,
  now = new Date(),
): T {
  const nextFilters = { ...filters } as SearchFilterMap;
  const { startFrom, startTo } = normalizeStartMonthRange({
    from: getScalarFilterValue(filters.startFrom),
    now,
    to: getScalarFilterValue(filters.startTo),
  });

  if (startFrom) {
    nextFilters.startFrom = startFrom;
  } else {
    delete nextFilters.startFrom;
  }

  if (startTo) {
    nextFilters.startTo = startTo;
  } else {
    delete nextFilters.startTo;
  }

  return nextFilters as T;
}
