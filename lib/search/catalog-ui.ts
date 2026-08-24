type SearchFilterValue = string | string[] | null | undefined;

export function buildSearchFiltersStateKey(
  filters: Record<string, SearchFilterValue>,
) {
  return JSON.stringify(
    Object.entries(filters)
      .map(([key, value]) => [
        key,
        Array.isArray(value) ? value : value ?? "",
      ] as const)
      .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey)),
  );
}

export function formatCatalogResultCount(count: number, capped: boolean) {
  const normalizedCount = Number.isFinite(count)
    ? Math.max(0, Math.trunc(count))
    : 0;

  return `${normalizedCount}${capped ? "+" : ""}`;
}
