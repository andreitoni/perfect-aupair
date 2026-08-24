import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ensureProfileForAuthUser } from "@/lib/auth/ensure-profile";
import {
  authHomeHref,
  safeAuthReturnTo,
  withAuthReturnTo,
} from "@/lib/auth/return-to";
import {
  OAUTH_ACCOUNT_TYPE_COOKIE,
  normalizeOAuthAccountType,
} from "@/lib/auth/oauth-account-type";
import { recordAccountLoginIp } from "@/lib/security/account-login-ip";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const code = requestUrl.searchParams.get("code");
  const returnTo = safeAuthReturnTo(requestUrl.searchParams.get("returnTo"));
  const providerError = requestUrl.searchParams.get("error");
  const providerErrorDescription = requestUrl.searchParams.get("error_description");

  if (providerError || !code) {
    console.error(
      "OAuth callback failed",
      providerError ?? "missing_code",
      providerErrorDescription ?? "",
    );

    return NextResponse.redirect(
      new URL(withAuthReturnTo("/login?auth=oauth_failed", returnTo), origin),
    );
  }

  const { supabase, applyCookies } = await createRouteHandlerClient();

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("OAuth session exchange failed", error.message);
    return applyCookies(
      NextResponse.redirect(
        new URL(withAuthReturnTo("/login?auth=oauth_failed", returnTo), origin),
      ),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.error("OAuth callback did not create a user session");
    return applyCookies(
      NextResponse.redirect(
        new URL(withAuthReturnTo("/login?auth=oauth_failed", returnTo), origin),
      ),
    );
  }

  const cookieStore = await cookies();
  const pendingAccountType = normalizeOAuthAccountType(
    cookieStore.get(OAUTH_ACCOUNT_TYPE_COOKIE)?.value,
  );

  if (!pendingAccountType && isRecentlyCreatedOAuthUser(user.created_at)) {
    await supabase.auth.signOut();

    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("mode", "register");
    loginUrl.searchParams.set("auth", "google_choose_account_type");
    if (returnTo) loginUrl.searchParams.set("returnTo", returnTo);

    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete({
      name: OAUTH_ACCOUNT_TYPE_COOKIE,
      path: "/auth",
    });

    return applyCookies(response);
  }

  await ensureProfileForAuthUser(user, { accountType: pendingAccountType });
  await recordAccountLoginIp({
    profileId: user.id,
    request,
    authMethod:
      user.app_metadata.provider === "facebook" ? "facebook" : "google",
  });

  const response = NextResponse.redirect(new URL(authHomeHref(returnTo), origin));
  response.cookies.delete({
    name: OAUTH_ACCOUNT_TYPE_COOKIE,
    path: "/auth",
  });

  return applyCookies(response);
}

function isRecentlyCreatedOAuthUser(createdAt?: string) {
  if (!createdAt) {
    return false;
  }

  const createdTime = new Date(createdAt).getTime();

  if (Number.isNaN(createdTime)) {
    return false;
  }

  return Date.now() - createdTime < 5 * 60 * 1000;
}
