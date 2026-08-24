export function sanitizedMonitoringPath(pathname: string) {
  const pathOnly = pathname.split(/[?#]/, 1)[0] || "/";
  const normalizedPath =
    pathOnly.length > 1 && pathOnly.endsWith("/")
      ? pathOnly.slice(0, -1)
      : pathOnly;

  if (normalizedPath === "/profile/photos") return normalizedPath;
  if (normalizedPath.startsWith("/profile/")) return "/profile/[id]";
  if (normalizedPath === "/stories/new") return normalizedPath;
  if (normalizedPath.startsWith("/stories/")) return "/stories/[id]";
  if (
    normalizedPath.startsWith("/messages/") &&
    normalizedPath !== "/messages/new"
  ) {
    return "/messages/[id]";
  }
  if (normalizedPath.startsWith("/admin/profiles/")) {
    return "/admin/profiles/[id]";
  }
  if (normalizedPath.startsWith("/admin/conversations/")) {
    return "/admin/conversations/[id]";
  }
  if (normalizedPath.startsWith("/notifications/message/")) {
    return "/notifications/message/[sender]";
  }

  return normalizedPath;
}

const GENERIC_MONITORING_PAGE_TITLES: Record<string, string> = {
  "/": "Home",
  "/login": "Login",
  "/messages": "Messages",
  "/messages/[id]": "Messages",
  "/messages/new": "New message",
  "/profile/[id]": "Profile",
  "/profile/photos": "Profile media",
  "/stories/[id]": "Story",
  "/stories/new": "New story",
};

export function genericMonitoringPageTitle(pathname: string) {
  const safePath = sanitizedMonitoringPath(pathname);
  return GENERIC_MONITORING_PAGE_TITLES[safePath] ?? safePath;
}

export function sanitizedMonitoringUrl(value?: string | null) {
  if (!value) return value ?? undefined;

  try {
    const url = new URL(value, "https://perfectaupair.example");
    return `${url.origin}${sanitizedMonitoringPath(url.pathname)}`;
  } catch {
    return sanitizedMonitoringPath(value.split("?")[0]?.split("#")[0] ?? "/");
  }
}
