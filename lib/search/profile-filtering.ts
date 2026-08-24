type LanguageProfile = {
  mother_tongue?: string | null;
  fluent_languages?: string[] | null;
  basic_languages?: string[] | null;
};

export function matches(value: string | null | undefined, filter?: string) {
  return !filter || value === filter;
}

export function booleanFilterMatches(
  value: boolean | null | undefined,
  filter?: string,
) {
  if (!filter || !["1", "true", "on"].includes(filter)) return true;

  return value === true;
}

export function matchesActivity(
  value: string | null | undefined,
  filter?: string,
) {
  if (!filter) return true;
  if (filter === "active") return value === "active";
  if (filter === "recently_active") {
    return value === "active" || value === "recently_active";
  }

  return true;
}

function parseMonth(value?: string) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;

  return new Date(`${value}-01T00:00:00.000Z`);
}

function parseDate(value?: string | null) {
  if (!value) return null;

  return new Date(`${value}T00:00:00.000Z`);
}

export function monthsOverlap(
  profileFrom?: string | null,
  profileTo?: string | null,
  searchFrom?: string,
  searchTo?: string,
) {
  const requestedFrom = parseMonth(searchFrom);
  const requestedTo = parseMonth(searchTo);

  if (!requestedFrom && !requestedTo) return true;

  const profileStart = parseDate(profileFrom);
  const profileEnd = parseDate(profileTo);

  if (!profileStart || !profileEnd) return true;

  const searchStart = requestedFrom ?? requestedTo;
  const searchEnd = requestedTo ?? requestedFrom;

  if (!searchStart || !searchEnd) return true;

  return profileStart <= searchEnd && profileEnd >= searchStart;
}

export function durationOverlaps(
  profileMin?: number | null,
  profileMax?: number | null,
  searchMin?: string,
  searchMax?: string,
) {
  const requestedMin = searchMin ? Number(searchMin) : null;
  const requestedMax = searchMax ? Number(searchMax) : null;

  if (!requestedMin && !requestedMax) return true;
  if (!profileMin || !profileMax) return true;

  const min = requestedMin ?? 1;
  const max = requestedMax ?? 24;

  return profileMin <= max && profileMax >= min;
}

export function ageInRange(
  age?: number | null,
  searchMin?: string,
  searchMax?: string,
) {
  const min = searchMin ? Number(searchMin) : null;
  const max = searchMax ? Number(searchMax) : null;

  if (!min && !max) return true;
  if (!age) return false;

  if (min && age < min) return false;
  if (max && age > max) return false;

  return true;
}

const allowanceToEur: Record<string, number> = {
  EUR: 1,
  GBP: 1.17,
  USD: 0.92,
};

export function allowanceMatches(
  profileAmount?: number | null,
  profileCurrency?: string | null,
  searchAmount?: string,
  searchCurrency?: string,
) {
  const requestedAmount = searchAmount ? Number(searchAmount) : null;

  if (
    !requestedAmount ||
    !Number.isFinite(requestedAmount) ||
    requestedAmount <= 0
  ) {
    return true;
  }
  if (!profileAmount || profileAmount <= 0) return false;

  const profileRate = allowanceToEur[profileCurrency ?? ""];
  const searchRate = allowanceToEur[searchCurrency || "EUR"];

  if (!profileRate || !searchRate) return false;

  return profileAmount * profileRate >= requestedAmount * searchRate;
}

export function languageMatches(profile: LanguageProfile, filter?: string) {
  if (!filter) return true;

  return [
    profile.mother_tongue,
    ...(profile.fluent_languages ?? []),
    ...(profile.basic_languages ?? []),
  ].some((language) => language === filter);
}

export function storyFilterMatches(
  profileId: string,
  storyProfileIds: Set<string>,
  filter?: string,
) {
  return profileIdSetFilterMatches(profileId, storyProfileIds, filter);
}

export function profileIdSetFilterMatches(
  profileId: string,
  profileIds: Set<string>,
  filter?: string,
) {
  if (!filter || !["1", "true", "on"].includes(filter)) return true;

  return profileIds.has(profileId);
}
