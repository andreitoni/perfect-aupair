import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureProfileForAuthUser } from "@/lib/auth/ensure-profile";
import {
  GOOGLE_OAUTH_COOKIE_PATH,
  GOOGLE_OAUTH_NONCE_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  getGoogleOAuthConfig,
  googleOAuthRedirectUri,
} from "@/lib/auth/google-oauth";
import {
  OAUTH_ACCOUNT_TYPE_COOKIE,
  normalizeOAuthAccountType,
} from "@/lib/auth/oauth-account-type";
import {
  AUTH_RETURN_TO_COOKIE,
  authHomeHref,
  safeAuthReturnTo,
  withAuthReturnTo,
} from "@/lib/auth/return-to";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { recordAccountLoginIp } from "@/lib/security/account-login-ip";

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  id_token?: string;
};

function clearOAuthCookies(response: NextResponse) {
  response.cookies.delete({
    name: GOOGLE_OAUTH_STATE_COOKIE,
    path: GOOGLE_OAUTH_COOKIE_PATH,
  });
  response.cookies.delete({
    name: GOOGLE_OAUTH_NONCE_COOKIE,
    path: GOOGLE_OAUTH_COOKIE_PATH,
  });
  response.cookies.delete({
    name: OAUTH_ACCOUNT_TYPE_COOKIE,
    path: "/auth",
  });
  response.cookies.delete({
    name: AUTH_RETURN_TO_COOKIE,
    path: "/auth",
  });

  return response;
}

function redirectToLogin(origin: string, returnTo: string | null) {
  return clearOAuthCookies(
    NextResponse.redirect(
      new URL(withAuthReturnTo("/login?auth=oauth_failed", returnTo), origin),
      303,
    ),
  );
}

async function exchangeCodeForGoogleTokens({
  clientId,
  clientSecret,
  code,
  redirectUri,
}: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<GoogleTokenResponse & { id_token: string }> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | GoogleTokenResponse
    | null;

  if (!response.ok || !payload?.id_token) {
    throw new Error(
      payload?.error_description ??
        payload?.error ??
        "Google token response did not include an ID token",
    );
  }

  return {
    ...payload,
    id_token: payload.id_token,
  };
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const providerError = requestUrl.searchParams.get("error");
  const providerErrorDescription = requestUrl.searchParams.get(
    "error_description",
  );
  const cookieStore = await cookies();
  const returnTo = safeAuthReturnTo(
    cookieStore.get(AUTH_RETURN_TO_COOKIE)?.value,
  );

  if (providerError || !code || !state) {
    console.error(
      "Google OAuth callback failed",
      providerError ?? "missing_code_or_state",
      providerErrorDescription ?? "",
    );

    return redirectToLogin(origin, returnTo);
  }

  const expectedState = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const nonce = cookieStore.get(GOOGLE_OAUTH_NONCE_COOKIE)?.value;
  const pendingAccountType = normalizeOAuthAccountType(
    cookieStore.get(OAUTH_ACCOUNT_TYPE_COOKIE)?.value,
  );

  if (!expectedState || expectedState !== state || !nonce) {
    console.error("Google OAuth callback failed state validation");
    return redirectToLogin(origin, returnTo);
  }

  const config = getGoogleOAuthConfig();

  if (!config) {
    console.error("Google OAuth callback failed: missing Google OAuth credentials");
    return redirectToLogin(origin, returnTo);
  }

  const { supabase, applyCookies } = await createRouteHandlerClient();

  try {
    const tokens = await exchangeCodeForGoogleTokens({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      code,
      redirectUri: googleOAuthRedirectUri(requestUrl),
    });
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: tokens.id_token,
      access_token: tokens.access_token,
      nonce,
    });

    if (error || !data.user) {
      console.error(
        "Google OAuth session exchange failed",
        error?.message ?? "Missing user",
      );

      return applyCookies(redirectToLogin(origin, returnTo));
    }

    if (!pendingAccountType && isRecentlyCreatedOAuthUser(data.user.created_at)) {
      await supabase.auth.signOut();

      const loginUrl = new URL("/login", origin);
      loginUrl.searchParams.set("mode", "register");
      loginUrl.searchParams.set("auth", "google_choose_account_type");
      if (returnTo) loginUrl.searchParams.set("returnTo", returnTo);

      return applyCookies(clearOAuthCookies(NextResponse.redirect(loginUrl)));
    }

    await ensureProfileForAuthUser(data.user, { accountType: pendingAccountType });
    await recordAccountLoginIp({
      profileId: data.user.id,
      request,
      authMethod: "google",
    });

    return applyCookies(
      clearOAuthCookies(
        NextResponse.redirect(new URL(authHomeHref(returnTo), origin)),
      ),
    );
  } catch (error) {
    console.error("Google OAuth callback failed", error);
    return applyCookies(redirectToLogin(origin, returnTo));
  }
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
