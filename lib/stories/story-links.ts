export function buildStoryHref(storyId: string, returnTo?: string | null) {
  const baseHref = `/stories/${storyId}`;

  if (!returnTo) {
    return baseHref;
  }

  const params = new URLSearchParams({ returnTo });
  return `${baseHref}?${params.toString()}`;
}

export function buildNewStoryHref(returnTo?: string | null) {
  const baseHref = "/stories/new";

  if (!returnTo) {
    return baseHref;
  }

  const params = new URLSearchParams({ returnTo });
  return `${baseHref}?${params.toString()}`;
}

export function getSafeStoryReturnTo(
  returnTo: string | null | undefined,
  fallbackHref: string,
) {
  if (!returnTo) {
    return fallbackHref;
  }

  if (
    !returnTo.startsWith("/") ||
    returnTo.startsWith("//") ||
    returnTo.includes("\\")
  ) {
    return fallbackHref;
  }

  return returnTo;
}
