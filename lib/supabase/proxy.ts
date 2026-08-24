import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { maybeHandleMaintenanceMode } from "@/lib/maintenance";
import { containsSupabaseSessionCookie } from "@/lib/supabase/has-session-cookie";
import {
  ROUTE_LOCALE_HEADER,
  getRouteLocale,
} from "@/lib/i18n/config";

const PUBLIC_INFO_PATHS = new Set([
  "/about",
  "/privacy",
  "/terms",
  "/cookie-policy",
  "/contact",
  "/data-deletion",
  "/safety",
]);

const PRIVATE_APP_PATHS = [
  "/account",
  "/messages",
  "/notifications",
  "/saved",
  "/profile/photos",
  "/report",
  "/stories/new",
];

function normalizePathname(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function createForwardedRequestHeaders(request: NextRequest) {
  const forwardedHeaders = new Headers(request.headers);
  const routeLocale = getRouteLocale(request.nextUrl.pathname);

  // Never trust a client-provided route locale. Only the requested canonical
  // path may select the language used by the server-rendered document.
  forwardedHeaders.delete(ROUTE_LOCALE_HEADER);
  if (routeLocale) {
    forwardedHeaders.set(ROUTE_LOCALE_HEADER, routeLocale);
  }

  return forwardedHeaders;
}

function createNextResponse(request: NextRequest) {
  return NextResponse.next({
    request: {
      headers: createForwardedRequestHeaders(request),
    },
  });
}

function isPublicInfoPath(pathname: string) {
  return PUBLIC_INFO_PATHS.has(normalizePathname(pathname));
}

function isPrivateAppPath(pathname: string) {
  const normalizedPathname = normalizePathname(pathname);
  return PRIVATE_APP_PATHS.some(
    (path) =>
      normalizedPathname === path || normalizedPathname.startsWith(`${path}/`),
  );
}

function isContentModerationReviewPath(pathname: string) {
  return (
    pathname.startsWith("/api/profile-content-moderation/") ||
    pathname.startsWith("/api/story-content-moderation/")
  );
}

function isPrivateMediaPath(pathname: string) {
  return pathname.startsWith("/api/media/private/");
}

function isProfilePhotoMediaPath(pathname: string) {
  return pathname.startsWith("/api/media/profile-photo/");
}

function isMediaDeliveryPath(pathname: string) {
  return isPrivateMediaPath(pathname) || isProfilePhotoMediaPath(pathname);
}

function isEmailUnsubscribePath(pathname: string) {
  return pathname === "/api/email/unsubscribe";
}

function shouldSkipRequiredPhotoGuard(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/check-email" ||
    pathname === "/account-deletion-pending" ||
    pathname === "/account/delete" ||
    isContentModerationReviewPath(pathname) ||
    isPrivateMediaPath(pathname) ||
    isEmailUnsubscribePath(pathname) ||
    isPublicInfoPath(pathname) ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/profile/photos")
  );
}

function shouldSkipDeletionGuard(pathname: string) {
  return (
    pathname === "/account-deletion-pending" ||
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/check-email" ||
    isPrivateMediaPath(pathname) ||
    isEmailUnsubscribePath(pathname) ||
    isPublicInfoPath(pathname) ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/auth/confirm") ||
    pathname.startsWith("/auth/signout")
  );
}

function shouldSkipSuspensionGuard(pathname: string) {
  return (
    pathname === "/account-suspended" ||
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/check-email" ||
    isPrivateMediaPath(pathname) ||
    isEmailUnsubscribePath(pathname) ||
    isPublicInfoPath(pathname) ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/auth/confirm") ||
    pathname.startsWith("/auth/signout")
  );
}

type GuardProfile = {
  account_type: "family" | "au_pair" | null;
  onboarding_completed: boolean | null;
  suspended_at: string | null;
  suspended_until: string | null;
  deletion_requested_at: string | null;
  last_active_at: string | null;
  profile_photos?: Array<{ id: string }> | null;
};

const PROFILE_ACTIVITY_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

function hasActiveSuspension(profile?: GuardProfile | null) {
  if (!profile?.suspended_at) {
    return false;
  }

  if (!profile.suspended_until) {
    return true;
  }

  return new Date(profile.suspended_until).getTime() > Date.now();
}

function shouldTouchProfileActivity(lastActiveAt?: string | null) {
  if (!lastActiveAt) {
    return true;
  }

  const lastActiveTime = new Date(lastActiveAt).getTime();

  if (Number.isNaN(lastActiveTime)) {
    return true;
  }

  return Date.now() - lastActiveTime > PROFILE_ACTIVITY_TOUCH_INTERVAL_MS;
}

export async function updateSession(
  request: NextRequest,
  waitUntil?: (promise: Promise<unknown>) => void,
) {
  const maintenanceResponse = maybeHandleMaintenanceMode(request);

  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  let response = createNextResponse(request);

  const pathname = request.nextUrl.pathname;

  // Media routes perform their own authentication, access checks, kill-switch
  // handling, and rate limiting. Running the page guards here as well would add
  // another auth call and profile queries for every displayed image.
  if (isMediaDeliveryPath(pathname)) {
    return response;
  }

  const hasSessionCookie = containsSupabaseSessionCookie(
    request.cookies.getAll(),
  );

  if (!hasSessionCookie) {
    if (isPrivateAppPath(pathname)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }

    return response;
  }

  if (
    shouldSkipDeletionGuard(pathname) &&
    shouldSkipSuspensionGuard(pathname) &&
    shouldSkipRequiredPhotoGuard(pathname) &&
    !pathname.startsWith("/admin")
  ) {
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Missing Supabase proxy environment variables");
  }

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = createNextResponse(request);

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const claims = (await supabase.auth.getClaims()).data?.claims;
  const userId = claims?.sub ?? null;

  if (!userId && isPrivateAppPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  if (
    userId &&
    (!shouldSkipDeletionGuard(pathname) ||
      !shouldSkipSuspensionGuard(pathname) ||
      !shouldSkipRequiredPhotoGuard(pathname))
  ) {
    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "account_type, onboarding_completed, suspended_at, suspended_until, deletion_requested_at, last_active_at, profile_photos(id)",
      )
      .eq("id", userId)
      .maybeSingle<GuardProfile>();

    if (profile && shouldTouchProfileActivity(profile.last_active_at)) {
      const activityTouch = Promise.resolve(
        supabase.rpc("touch_profile_activity"),
      )
        .then(({ error }) => {
          if (!error) return;

          console.warn("Could not update profile activity.", {
            message: error.message,
          });
        })
        .catch((error) => {
          console.warn("Could not update profile activity.", {
            message: error instanceof Error ? error.message : String(error),
          });
        });

      if (waitUntil) {
        waitUntil(activityTouch);
      } else {
        await activityTouch;
      }
    }

    if (!shouldSkipSuspensionGuard(pathname) && hasActiveSuspension(profile)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/account-suspended";
      redirectUrl.search = "";

      return NextResponse.redirect(redirectUrl);
    }

    if (!shouldSkipDeletionGuard(pathname) && profile?.deletion_requested_at) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/account-deletion-pending";
      redirectUrl.search = "";

      return NextResponse.redirect(redirectUrl);
    }

    if (
      !shouldSkipRequiredPhotoGuard(pathname) &&
      (profile?.account_type === "family" ||
        profile?.account_type === "au_pair") &&
      profile.onboarding_completed
    ) {
      if (!profile.profile_photos?.length) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/profile/photos";
        redirectUrl.search = "";

        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  return response;
}
