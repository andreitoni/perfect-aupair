const ADMIN_NAVIGATION_ORIGIN = "https://admin-navigation.invalid";
const DEFAULT_ADMIN_HREF = "/admin";
const MAX_ADMIN_HREF_LENGTH = 8_192;
const MAX_ADMIN_TRAIL_LENGTH = 6_144;
const MAX_ADMIN_TRAIL_DEPTH = 8;
export const ADMIN_TRAIL_PARAM = "adminTrail";

type AdminReturnTo = string | string[] | null | undefined;

function firstValue(value: AdminReturnTo) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeAdminHref(value: string | null | undefined) {
  if (
    !value ||
    value !== value.trim() ||
    value.length > MAX_ADMIN_HREF_LENGTH ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return null;
  }

  let decodedValue: string;

  try {
    decodedValue = decodeURIComponent(value);
  } catch {
    return null;
  }

  if (/[\\\u0000-\u001f\u007f]/u.test(decodedValue)) {
    return null;
  }

  try {
    const url = new URL(value, ADMIN_NAVIGATION_ORIGIN);

    if (
      url.origin !== ADMIN_NAVIGATION_ORIGIN ||
      (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/"))
    ) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function withoutNavigationContext(href: string) {
  const url = new URL(href, ADMIN_NAVIGATION_ORIGIN);
  url.searchParams.delete("returnTo");
  url.searchParams.delete(ADMIN_TRAIL_PARAM);

  return `${url.pathname}${url.search}${url.hash}`;
}

export function safeAdminTrail(
  trail: AdminReturnTo,
): string[] {
  const rawTrail = firstValue(trail);

  if (!rawTrail || rawTrail.length > MAX_ADMIN_TRAIL_LENGTH) return [];

  try {
    const parsed: unknown = JSON.parse(rawTrail);

    if (!Array.isArray(parsed) || parsed.length > MAX_ADMIN_TRAIL_DEPTH) {
      return [];
    }

    const normalized = parsed.map((entry) =>
      typeof entry === "string" ? normalizeAdminHref(entry) : null,
    );

    if (normalized.some((entry) => entry === null)) return [];

    return normalized.map((entry) => withoutNavigationContext(entry!));
  } catch {
    return [];
  }
}

function parentChain(returnTo: string | null) {
  const chain: string[] = [];
  let current = normalizeAdminHref(returnTo);

  for (let depth = 0; current && depth < MAX_ADMIN_TRAIL_DEPTH; depth += 1) {
    const url = new URL(current, ADMIN_NAVIGATION_ORIGIN);
    const next = normalizeAdminHref(url.searchParams.get("returnTo"));
    chain.unshift(withoutNavigationContext(current));
    current = next;
  }

  return chain;
}

export function safeAdminReturnTo(
  returnTo: AdminReturnTo,
  fallbackHref: string = DEFAULT_ADMIN_HREF,
) {
  const safeFallback =
    normalizeAdminHref(fallbackHref) ?? DEFAULT_ADMIN_HREF;

  return normalizeAdminHref(firstValue(returnTo)) ?? safeFallback;
}

export function withAdminNavigationContext(
  destinationHref: string,
  returnTo?: AdminReturnTo,
  trail?: AdminReturnTo,
) {
  const destination = safeAdminReturnTo(destinationHref);
  const url = new URL(destination, ADMIN_NAVIGATION_ORIGIN);
  const normalizedReturnTo = normalizeAdminHref(firstValue(returnTo));
  const normalizedTrail = safeAdminTrail(trail);

  url.searchParams.delete("returnTo");
  url.searchParams.delete(ADMIN_TRAIL_PARAM);

  if (normalizedReturnTo) {
    url.searchParams.set(
      "returnTo",
      withoutNavigationContext(normalizedReturnTo),
    );
  }

  if (normalizedTrail.length > 0) {
    url.searchParams.set(ADMIN_TRAIL_PARAM, JSON.stringify(normalizedTrail));
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function adminBackHref(
  returnTo: AdminReturnTo,
  trail: AdminReturnTo,
  fallbackHref: string = DEFAULT_ADMIN_HREF,
) {
  const immediateReturnTo = safeAdminReturnTo(returnTo, fallbackHref);
  const parents = safeAdminTrail(trail);
  const parent = parents.at(-1);

  return withAdminNavigationContext(
    immediateReturnTo,
    parent,
    parent ? JSON.stringify(parents.slice(0, -1)) : undefined,
  );
}

export function withAdminReturnTo(destinationHref: string, returnTo: string) {
  const destination = safeAdminReturnTo(destinationHref);
  const source = safeAdminReturnTo(returnTo);
  const sourceUrl = new URL(source, ADMIN_NAVIGATION_ORIGIN);
  const existingTrail = safeAdminTrail(
    sourceUrl.searchParams.get(ADMIN_TRAIL_PARAM),
  );
  const olderParents = parentChain(sourceUrl.searchParams.get("returnTo"));
  const nextTrail = [...existingTrail, ...olderParents].slice(
    -MAX_ADMIN_TRAIL_DEPTH,
  );

  return withAdminNavigationContext(
    destination,
    withoutNavigationContext(source),
    nextTrail.length > 0 ? JSON.stringify(nextTrail) : undefined,
  );
}
