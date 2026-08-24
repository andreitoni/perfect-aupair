"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ProfileSearchSort } from "@/lib/profiles/pagination";

export type SearchSortLabels = {
  sortBy: string;
  recommended: string;
  newestFirst: string;
  oldestFirst: string;
  recentlyActive: string;
  updatingResults: string;
};

type SearchSortControlProps = {
  basePath: string;
  filters: Record<string, string | string[] | undefined>;
  labels: SearchSortLabels;
  sort: ProfileSearchSort;
  variant?: "desktop" | "mobile";
};

function getFilterValues(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value;
  }

  return value ? [value] : [];
}

function buildSortHref(
  basePath: string,
  filters: Record<string, string | string[] | undefined>,
  nextSort: ProfileSearchSort,
) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (key === "page" || key === "sort") {
      return;
    }

    getFilterValues(value).forEach((entry) => {
      const scalarValue = entry.trim();
      if (scalarValue) params.append(key, scalarValue);
    });
  });

  if (nextSort !== "recommended") {
    params.set("sort", nextSort);
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function SearchSortControl({
  basePath,
  filters,
  labels,
  sort,
  variant = "desktop",
}: SearchSortControlProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSortChange(nextSort: ProfileSearchSort) {
    if (nextSort === sort) {
      return;
    }

    startTransition(() => {
      router.push(buildSortHref(basePath, filters, nextSort));
    });
  }

  const isMobile = variant === "mobile";

  return (
    <>
      <label
        className={
          isMobile
            ? "flex min-h-10 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-white/85 px-3 font-semibold text-[#25302d]/72 shadow-sm ring-1 ring-[#c8d7de]"
            : "flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold text-[#25302d]/72"
        }
        aria-busy={isPending}
      >
        <span className={isMobile ? "hidden min-[390px]:inline" : undefined}>
          {labels.sortBy}
        </span>
        <select
          key={sort}
          defaultValue={sort}
          disabled={isPending}
          aria-label={labels.sortBy}
          onChange={(event) =>
            handleSortChange(event.target.value as ProfileSearchSort)
          }
          className={
            isMobile
              ? "min-w-0 flex-1 border-0 bg-transparent py-1 pl-0 pr-7 text-base font-black text-[var(--pa-primary)] outline-none disabled:opacity-70"
              : "rounded-[0.45rem] border-0 bg-transparent py-1 pl-1 pr-7 text-sm font-black text-[var(--pa-primary)] outline-none disabled:opacity-70"
          }
        >
          <option value="recommended">{labels.recommended}</option>
          <option value="newest">{labels.newestFirst}</option>
          <option value="recently_active">{labels.recentlyActive}</option>
          <option value="oldest">{labels.oldestFirst}</option>
        </select>
      </label>

      {isPending ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#edf5f7]/55 px-4 backdrop-blur-[4px]"
          aria-live="polite"
          aria-busy="true"
        >
          <div
            role="status"
            className="flex items-center gap-3 rounded-full border border-white/80 bg-white/80 px-5 py-3 text-sm font-black text-[#25302d] shadow-[0_18px_55px_rgba(38,63,69,0.18)] ring-1 ring-[#b9ced7]/65 backdrop-blur-xl"
          >
            <span
              className="h-5 w-5 animate-spin rounded-full border-[3px] border-[#b9d6dd] border-t-[var(--pa-primary)] motion-reduce:animate-none"
              aria-hidden="true"
            />
            {labels.updatingResults}
          </div>
        </div>
      ) : null}
    </>
  );
}
