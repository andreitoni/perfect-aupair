import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BYPASS_COOKIE = "pa_maintenance_bypass";
const BYPASS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 10;
const MODE_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);
const PUBLIC_FILE_PATTERN = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json)$/i;
const PUBLIC_LEGAL_PATHS = new Set([
  "/about",
  "/privacy",
  "/terms",
  "/cookie-policy",
  "/contact",
  "/data-deletion",
  "/safety",
]);

function isPublicGuidePath(pathname: string) {
  const normalizedPathname =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  return (
    normalizedPathname === "/guides" ||
    normalizedPathname.startsWith("/guides/")
  );
}

function isEnabledValue(value?: string) {
  return MODE_VALUES.has(value?.trim().toLowerCase() ?? "");
}

export function isMaintenanceModeEnabled() {
  return (
    process.env.NODE_ENV === "production" &&
    (isEnabledValue(process.env.MAINTENANCE_MODE) ||
      isEnabledValue(process.env.NEXT_PUBLIC_MAINTENANCE_MODE))
  );
}

function isAllowedDuringMaintenance(pathname: string) {
  const normalizedPathname =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  return (
    pathname === "/maintenance" ||
    PUBLIC_LEGAL_PATHS.has(normalizedPathname) ||
    isPublicGuidePath(pathname) ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/opengraph-image" ||
    pathname.startsWith("/api/maintenance/") ||
    pathname === "/api/email/unsubscribe" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/auth/") ||
    pathname === "/reset-password" ||
    PUBLIC_FILE_PATTERN.test(pathname)
  );
}

function hasValidBypass(request: NextRequest) {
  const bypassSecret = process.env.MAINTENANCE_BYPASS_SECRET;

  if (!bypassSecret) return false;

  return request.cookies.get(BYPASS_COOKIE)?.value === bypassSecret;
}

export function maybeHandleMaintenanceMode(request: NextRequest) {
  if (!isMaintenanceModeEnabled()) {
    if (request.nextUrl.pathname.replace(/\/+$/, "") === "/maintenance") {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = "/";
      homeUrl.search = "";

      return NextResponse.redirect(homeUrl);
    }

    return null;
  }

  const bypassSecret = process.env.MAINTENANCE_BYPASS_SECRET;
  const previewSecret = request.nextUrl.searchParams.get("preview_secret");

  if (bypassSecret && previewSecret === bypassSecret) {
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.searchParams.delete("preview_secret");

    const response = NextResponse.redirect(cleanUrl);

    response.cookies.set(BYPASS_COOKIE, bypassSecret, {
      httpOnly: true,
      maxAge: BYPASS_COOKIE_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  }

  if (hasValidBypass(request) || isAllowedDuringMaintenance(request.nextUrl.pathname)) {
    return null;
  }

  const maintenanceUrl = request.nextUrl.clone();
  maintenanceUrl.pathname = "/maintenance";
  maintenanceUrl.search = "";

  return NextResponse.redirect(maintenanceUrl);
}
