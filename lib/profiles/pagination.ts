export const PROFILE_PAGE_SIZE = 12;

type CreatedProfile = {
  created_at?: string | null;
};

type ActiveProfile = CreatedProfile & {
  activity_status?: string | null;
};

export type ProfileSearchSort =
  | "recommended"
  | "newest"
  | "oldest"
  | "recently_active";

function parseProfileTime(profile: CreatedProfile) {
  return profile.created_at ? new Date(profile.created_at).getTime() : 0;
}

function getActivitySortRank(profile: ActiveProfile) {
  if (profile.activity_status === "active") return 2;
  if (profile.activity_status === "recently_active") return 1;

  return 0;
}

export function normalizeProfileSearchSort(
  value?: string | string[] | null,
): ProfileSearchSort {
  const scalarValue = Array.isArray(value) ? value[0] : value;

  if (
    scalarValue === "newest" ||
    scalarValue === "oldest" ||
    scalarValue === "recently_active"
  ) {
    return scalarValue;
  }

  return "recommended";
}

export function sortNewestProfilesFirst<T extends CreatedProfile>(items: T[]) {
  return [...items].sort((first, second) => {
    const firstTime = parseProfileTime(first);
    const secondTime = parseProfileTime(second);

    return secondTime - firstTime;
  });
}

export function sortProfilesForSearch<T extends ActiveProfile>(
  items: T[],
  sort: ProfileSearchSort,
) {
  return [...items].sort((first, second) => {
    const firstTime = parseProfileTime(first);
    const secondTime = parseProfileTime(second);

    if (sort === "recently_active") {
      const activityDifference =
        getActivitySortRank(second) - getActivitySortRank(first);

      if (activityDifference !== 0) {
        return activityDifference;
      }

      return secondTime - firstTime;
    }

    return sort === "oldest" ? firstTime - secondTime : secondTime - firstTime;
  });
}

function parsePageNumber(value?: string | string[] | null) {
  const scalarValue = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(scalarValue ?? "1", 10);

  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function paginateProfiles<T>(
  items: T[],
  pageValue?: string | string[] | null,
  pageSize = PROFILE_PAGE_SIZE,
) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(parsePageNumber(pageValue), totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  return {
    currentPage,
    totalPages,
    pageSize,
    totalItems: items.length,
    items: items.slice(startIndex, endIndex),
  };
}
