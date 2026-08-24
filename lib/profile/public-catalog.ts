import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProfileSearchSort } from "@/lib/profiles/pagination";
import { getRequestSecurityIdentifiers } from "@/lib/security/request";

export type PublicCatalogAccountType = "au_pair" | "family";

type PublicCatalogError = {
  message: string;
};

type PublicCatalogRpcError = PublicCatalogError & {
  code?: string;
};

type PublicCatalogFilterValue = string | string[] | null | undefined;

export type PublicCatalogFilters = Record<
  string,
  PublicCatalogFilterValue
>;

export type BoundedPublicCatalogResult<T> = {
  data: T[];
  error: PublicCatalogError | null;
  totalItems: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  countries: string[];
  totalIsCapped: boolean;
};

export type PublicCatalogRequestScope = "search" | "count" | "landing";

export type PublicCatalogRequestDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
  unavailable: boolean;
};

const PUBLIC_CATALOG_QUERY_TIMEOUT_MS = 8_000;

function publicCatalogAbortSignal() {
  return AbortSignal.timeout(PUBLIC_CATALOG_QUERY_TIMEOUT_MS);
}

function isPublicCatalogTimeout(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { code?: unknown; message?: unknown; name?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const message =
    typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";

  return (
    code === "57014" ||
    name === "TimeoutError" ||
    message.includes("timeout") ||
    message.includes("operation was aborted") ||
    message.includes("statement timeout")
  );
}

class PublicCatalogQueryError extends Error {
  code: string;

  constructor(error: PublicCatalogRpcError) {
    super(error.message);
    this.name = "PublicCatalogQueryError";
    this.code = error.code ?? "";
  }
}

const COMMON_FILTERS = new Set([
  "country",
  "startFrom",
  "startTo",
  "durationMin",
  "durationMax",
  "activity",
  "has_video",
  "has_stories",
]);

const AU_PAIR_FILTERS = new Set([
  ...COMMON_FILTERS,
  "language",
  "smoking",
  "gender",
  "ageMin",
  "ageMax",
  "alreadyInGermany",
  "willCareForElderly",
  "willCareForPets",
]);

const FAMILY_FILTERS = new Set([
  ...COMMON_FILTERS,
  "children",
  "allowanceMin",
  "allowanceCurrency",
]);

function scalarFilterValue(value: PublicCatalogFilterValue) {
  const scalar = Array.isArray(value) ? value[0] : value;

  return typeof scalar === "string" ? scalar.trim().slice(0, 100) : "";
}

export function normalizePublicCatalogFilters(
  accountType: PublicCatalogAccountType,
  filters: PublicCatalogFilters = {},
) {
  const allowedFilters =
    accountType === "au_pair" ? AU_PAIR_FILTERS : FAMILY_FILTERS;
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(filters)) {
    if (!allowedFilters.has(key)) continue;

    const scalar = scalarFilterValue(value);
    if (scalar) normalized[key] = scalar;
  }

  // `has_stories` was the original query-string name for the intro-video
  // filter. Keep old shared links working without carrying two DB filters.
  if (!normalized.has_video && normalized.has_stories) {
    normalized.has_video = normalized.has_stories;
  }
  delete normalized.has_stories;

  return normalized;
}

function positiveInteger(value: number | string | string[] | null | undefined) {
  const scalar = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(String(scalar ?? "1"), 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function numberFromJson(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : fallback;
}

function emptyResult<T>(
  page: number,
  pageSize: number,
  error: PublicCatalogError | null = null,
): BoundedPublicCatalogResult<T> {
  return {
    data: [],
    error,
    totalItems: 0,
    currentPage: page,
    totalPages: 1,
    pageSize,
    countries: [],
    totalIsCapped: false,
  };
}

export function createClosedPublicCatalogResult<T>({
  message,
  page = 1,
  pageSize = 12,
}: {
  message: string;
  page?: number | string | string[] | null;
  pageSize?: number;
}): BoundedPublicCatalogResult<T> {
  return emptyResult(
    Math.min(100, positiveInteger(page)),
    Math.min(24, Math.max(1, positiveInteger(pageSize))),
    { message },
  );
}

export async function reservePublicCatalogRequest(
  scope: PublicCatalogRequestScope,
): Promise<PublicCatalogRequestDecision> {
  try {
    const identifiers = await getRequestSecurityIdentifiers();
    const { data, error } = await createAdminClient()
      .rpc("reserve_public_catalog_request", {
        p_ip_hash: identifiers.ipHash,
        p_ip_prefix_hash: identifiers.ipPrefixHash,
        p_scope: scope,
      })
      .abortSignal(publicCatalogAbortSignal());

    if (error) {
      console.error("Public catalog rate limiter failed", {
        scope,
        code: error.code,
        message: error.message,
      });
      return { allowed: false, retryAfterSeconds: 60, unavailable: true };
    }

    const row = Array.isArray(data)
      ? (data[0] as
          | { allowed?: unknown; retry_after_seconds?: unknown }
          | undefined)
      : (data as
          | { allowed?: unknown; retry_after_seconds?: unknown }
          | null);

    if (!row || typeof row.allowed !== "boolean") {
      return { allowed: false, retryAfterSeconds: 60, unavailable: true };
    }

    return {
      allowed: row.allowed,
      retryAfterSeconds:
        typeof row.retry_after_seconds === "number" &&
        Number.isFinite(row.retry_after_seconds)
          ? Math.max(0, Math.trunc(row.retry_after_seconds))
          : row.allowed
            ? 0
            : 60,
      unavailable: false,
    };
  } catch (error) {
    console.error("Public catalog rate limiter unavailable", {
      scope,
      message: error instanceof Error ? error.message : String(error),
    });
    return { allowed: false, retryAfterSeconds: 60, unavailable: true };
  }
}

export async function loadBoundedPublicProfileCards<T>({
  accountType,
  filters = {},
  viewerId = null,
  sort = "recommended",
  page = 1,
  pageSize = 12,
  guestPageLimit = null,
  includeCountries = true,
}: {
  accountType: PublicCatalogAccountType;
  filters?: PublicCatalogFilters;
  viewerId?: string | null;
  sort?: ProfileSearchSort;
  page?: number | string | string[] | null;
  pageSize?: number;
  guestPageLimit?: number | null;
  includeCountries?: boolean;
}): Promise<BoundedPublicCatalogResult<T>> {
  const normalizedPage = Math.min(100, positiveInteger(page));
  const normalizedPageSize = Math.min(24, Math.max(1, positiveInteger(pageSize)));
  const normalizedFilters = normalizePublicCatalogFilters(accountType, filters);

  // Guest catalog responses contain only bounded public RPC data and can be
  // reused briefly. Authenticated requests stay uncached because the RPC
  // applies viewer-specific blocking/privacy rules.
  const loadCatalog = async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const { data, error } = await createAdminClient()
          .rpc("get_bounded_public_profile_cards", {
            p_account_type: accountType,
            p_filters: normalizedFilters,
            p_viewer_id: viewerId,
            p_sort: sort,
            p_page: normalizedPage,
            p_page_size: normalizedPageSize,
            p_guest_page_limit: guestPageLimit,
            p_include_countries: includeCountries,
          })
          .abortSignal(publicCatalogAbortSignal());

        if (!error) return data;

        if (attempt === 0 && isPublicCatalogTimeout(error)) {
          continue;
        }

        throw new PublicCatalogQueryError(error);
      } catch (error) {
        if (attempt === 0 && isPublicCatalogTimeout(error)) {
          continue;
        }

        throw error;
      }
    }

    throw new Error("Public catalog retry exhausted");
  };

  try {
    // Cache only successful guest responses. Rejected promises are not cached,
    // so one transient database timeout cannot poison the public feed for the
    // next 30 seconds.
    const data =
      viewerId === null
        ? await unstable_cache(
            loadCatalog,
            [
              "public-profile-catalog",
              accountType,
              JSON.stringify(normalizedFilters),
              sort,
              String(normalizedPage),
              String(normalizedPageSize),
              String(guestPageLimit ?? "all"),
              String(includeCountries),
            ],
            { revalidate: 30 },
          )()
        : await loadCatalog();

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return emptyResult(normalizedPage, normalizedPageSize, {
        message: "Invalid public catalog response",
      });
    }

    const payload = data as Record<string, unknown>;
    const totalItems = numberFromJson(payload.total, 0);
    const currentPage = Math.max(
      1,
      numberFromJson(payload.current_page, normalizedPage),
    );
    const totalPages = Math.max(
      1,
      numberFromJson(payload.total_pages, Math.ceil(totalItems / normalizedPageSize)),
    );

    return {
      data: Array.isArray(payload.items) ? (payload.items as T[]) : [],
      error: null,
      totalItems,
      currentPage,
      totalPages,
      pageSize: Math.max(
        1,
        numberFromJson(payload.page_size, normalizedPageSize),
      ),
      countries: Array.isArray(payload.countries)
        ? payload.countries.filter(
            (country): country is string => typeof country === "string",
          )
        : [],
      totalIsCapped: payload.total_is_capped === true,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Public catalog unavailable";

    console.error(`Could not load bounded ${accountType} public catalog`, message);
    return emptyResult(normalizedPage, normalizedPageSize, { message });
  }
}

export async function loadFeaturedPublicProfileCards<T>(): Promise<{
  data: T[];
  error: PublicCatalogError | null;
}> {
  try {
    const { data, error } = await createAdminClient()
      .rpc("get_featured_public_profile_cards", { p_limit: 5 })
      .abortSignal(publicCatalogAbortSignal());

    if (error) {
      console.error("Could not load featured public profiles", {
        code: error.code,
        message: error.message,
      });
      return { data: [], error: { message: error.message } };
    }

    const payload =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>).items
        : data;

    return {
      data: Array.isArray(payload) ? (payload.slice(0, 5) as T[]) : [],
      error: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Featured profiles unavailable";

    console.error("Could not load featured public profiles", message);
    return { data: [], error: { message } };
  }
}

export async function loadBoundedPublicStoryCards<T>(
  accountType: PublicCatalogAccountType,
  viewerId: string | null,
): Promise<{ data: T[]; error: PublicCatalogError | null }> {
  const loadStories = async () => {
    const { data, error } = await createAdminClient()
      .rpc("get_bounded_public_story_cards", {
        p_account_type: accountType,
        p_viewer_id: viewerId,
      })
      .abortSignal(publicCatalogAbortSignal());

    if (error) {
      throw new PublicCatalogQueryError(error);
    }

    return data ?? [];
  };

  try {
    const data =
      viewerId === null
        ? await unstable_cache(
            loadStories,
            ["public-story-cards", accountType],
            { revalidate: 30 },
          )()
        : await loadStories();

    return { data: data as T[], error: null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Story cards unavailable";

    console.error(`Could not load bounded ${accountType} story cards`, message);
    return { data: [], error: { message } };
  }
}
