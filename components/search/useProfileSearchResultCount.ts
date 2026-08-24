"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCatalogResultCount } from "@/lib/search/catalog-ui";

type TargetProfileType = "au_pair" | "family";
type FilterMap = Record<string, string | string[] | null | undefined>;

function scalarValue(value: FilterMap[string]) {
  return Array.isArray(value) ? value[0] : value;
}

function buildFilterQuery(filters: FilterMap) {
  const params = new URLSearchParams();

  Object.entries(filters)
    .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
    .forEach(([key, value]) => {
      if (key === "page" || key === "sort") return;

      const scalar = scalarValue(value)?.trim();
      if (scalar) params.set(key, scalar);
    });

  return params.toString();
}

export function useProfileSearchResultCount({
  targetType,
  filters,
  initialFilters = {},
  initialCount,
  initialCapped = false,
}: {
  targetType: TargetProfileType;
  filters: FilterMap;
  initialFilters?: FilterMap;
  initialCount: number;
  initialCapped?: boolean;
}) {
  const filterQuery = useMemo(() => buildFilterQuery(filters), [filters]);
  const initialFilterQuery = useMemo(
    () => buildFilterQuery(initialFilters),
    [initialFilters],
  );
  const [remoteResult, setRemoteResult] = useState({
    count: initialCount,
    capped: initialCapped,
  });

  useEffect(() => {
    if (filterQuery === initialFilterQuery) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      const query = new URLSearchParams(filterQuery);
      query.set("target", targetType);

      try {
        const response = await fetch(`/api/profile-search/count?${query}`, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });

        if (!response.ok) return;

        const payload = (await response.json()) as {
          capped?: unknown;
          count?: unknown;
        };
        if (
          typeof payload.count === "number" &&
          Number.isFinite(payload.count) &&
          payload.count >= 0
        ) {
          setRemoteResult({
            count: Math.trunc(payload.count),
            capped: payload.capped === true,
          });
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // Keep the last known count. Filtering and navigation still work if
          // this optional preview request is unavailable.
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [filterQuery, initialFilterQuery, targetType]);

  const result =
    filterQuery === initialFilterQuery
      ? { count: initialCount, capped: initialCapped }
      : remoteResult;

  return {
    ...result,
    label: formatCatalogResultCount(result.count, result.capped),
  };
}
