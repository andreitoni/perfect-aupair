export function isAdminAnalyticsPath(pathname: string | null | undefined) {
  if (!pathname?.startsWith("/")) return false;

  const pathOnly = pathname.split(/[?#]/, 1)[0] ?? pathname;

  return pathOnly === "/admin" || pathOnly.startsWith("/admin/");
}

export function isAnalyticsAllowedPath(pathname: string | null | undefined) {
  return Boolean(pathname?.startsWith("/")) && !isAdminAnalyticsPath(pathname);
}
