import { isAnalyticsAllowedPath } from "@/lib/analytics/route-privacy";

const SESSION_REPLAY_PRIVATE_PATH_PREFIXES = ["/messages"] as const;

export function isSessionReplayAllowedPath(pathname: string | null | undefined) {
  if (!pathname?.startsWith("/")) {
    return false;
  }

  const normalizedPath =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  return (
    isAnalyticsAllowedPath(normalizedPath) &&
    !SESSION_REPLAY_PRIVATE_PATH_PREFIXES.some(
      (privatePath) =>
        normalizedPath === privatePath ||
        normalizedPath.startsWith(`${privatePath}/`),
    )
  );
}
