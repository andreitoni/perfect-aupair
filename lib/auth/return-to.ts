const AUTH_RETURN_TO_ORIGIN = "https://auth-return-to.invalid";
const MAX_AUTH_RETURN_TO_LENGTH = 1_200;
const MAX_SEARCH_VALUE_LENGTH = 160;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const commonSearchKeys = new Set([
  "activity",
  "country",
  "durationMax",
  "durationMin",
  "has_stories",
  "has_video",
  "page",
  "sort",
  "startFrom",
  "startTo",
]);

const searchKeysByPath = {
  "/search-aupair": new Set([
    ...commonSearchKeys,
    "ageMax",
    "ageMin",
    "alreadyInGermany",
    "gender",
    "smoking",
    "willCareForElderly",
    "willCareForPets",
  ]),
  "/search-family": new Set([
    ...commonSearchKeys,
    "allowanceCurrency",
    "allowanceMin",
    "children",
  ]),
} as const;

export const AUTH_RETURN_TO_COOKIE = "pa_auth_return_to";

export type AuthReturnToValue =
  | string
  | string[]
  | null
  | undefined;

function firstValue(value: AuthReturnToValue) {
  return Array.isArray(value) ? value[0] : value;
}

function hasOnlyAllowedSearchParams(url: URL, allowedKeys: Set<string>) {
  const seenKeys = new Set<string>();

  for (const [key, value] of url.searchParams) {
    if (
      !allowedKeys.has(key) ||
      seenKeys.has(key) ||
      !value ||
      value.length > MAX_SEARCH_VALUE_LENGTH
    ) {
      return false;
    }

    seenKeys.add(key);
  }

  return true;
}

export function safeAuthReturnTo(value: AuthReturnToValue): string | null {
  const candidate = firstValue(value);

  if (
    !candidate ||
    candidate !== candidate.trim() ||
    candidate.length > MAX_AUTH_RETURN_TO_LENGTH ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("#")
  ) {
    return null;
  }

  let decodedCandidate: string;

  try {
    decodedCandidate = decodeURIComponent(candidate);
  } catch {
    return null;
  }

  if (
    decodedCandidate.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/u.test(decodedCandidate)
  ) {
    return null;
  }

  try {
    const url = new URL(candidate, AUTH_RETURN_TO_ORIGIN);

    if (url.origin !== AUTH_RETURN_TO_ORIGIN || url.hash) {
      return null;
    }

    if (url.pathname.startsWith("/profile/")) {
      const segments = url.pathname.split("/");
      const identifier = segments[2] ?? "";

      if (
        segments.length !== 3 ||
        url.search ||
        identifier.length > 80 ||
        (!UUID_PATTERN.test(identifier) &&
          !PROFILE_SLUG_PATTERN.test(identifier))
      ) {
        return null;
      }

      return url.pathname;
    }

    if (url.pathname === "/messages") {
      const profileIds = url.searchParams.getAll("profile");

      if (
        profileIds.length !== 1 ||
        !UUID_PATTERN.test(profileIds[0]) ||
        Array.from(url.searchParams.keys()).some((key) => key !== "profile")
      ) {
        return null;
      }

      return `${url.pathname}?${url.searchParams.toString()}`;
    }

    if (
      url.pathname === "/search-aupair" ||
      url.pathname === "/search-family"
    ) {
      if (!hasOnlyAllowedSearchParams(url, searchKeysByPath[url.pathname])) {
        return null;
      }

      const query = url.searchParams.toString();
      return query ? `${url.pathname}?${query}` : url.pathname;
    }

    return null;
  } catch {
    return null;
  }
}

export function withAuthReturnTo(
  destinationHref: string,
  returnTo: AuthReturnToValue,
) {
  const safeReturnTo = safeAuthReturnTo(returnTo);

  if (!safeReturnTo) {
    return destinationHref;
  }

  const destination = new URL(destinationHref, AUTH_RETURN_TO_ORIGIN);

  if (destination.origin !== AUTH_RETURN_TO_ORIGIN) {
    return destinationHref;
  }

  destination.searchParams.set("returnTo", safeReturnTo);

  return `${destination.pathname}${destination.search}`;
}

export function authHomeHref(returnTo: AuthReturnToValue) {
  return withAuthReturnTo("/auth/home", returnTo);
}

export function loginHref(
  returnTo: AuthReturnToValue,
  mode?: "login" | "register",
) {
  const baseHref = mode ? `/login?mode=${mode}` : "/login";

  return withAuthReturnTo(baseHref, returnTo);
}
