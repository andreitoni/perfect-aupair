import { NextResponse } from "next/server";
import {
  buildGoogleOAuthUrl,
  createGoogleOAuthNonceClaim,
  createGoogleOAuthRandomValue,
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
  safeAuthReturnTo,
  withAuthReturnTo,
} from "@/lib/auth/return-to";

const COOKIE_MAX_AGE_SECONDS = 10 * 60;

function redirectToLogin(request: Request) {
  const requestUrl = new URL(request.url);
  const returnTo = safeAuthReturnTo(requestUrl.searchParams.get("returnTo"));
  const loginUrl = new URL(withAuthReturnTo("/login", returnTo), request.url);
  loginUrl.searchParams.set("auth", "oauth_failed");

  return NextResponse.redirect(loginUrl, 303);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const mode = requestUrl.searchParams.get("mode");
  const accountType = normalizeOAuthAccountType(
    requestUrl.searchParams.get("account_type"),
  );
  const returnTo = safeAuthReturnTo(requestUrl.searchParams.get("returnTo"));

  if (mode === "register" && !accountType) {
    return redirectToLogin(request);
  }

  const config = getGoogleOAuthConfig();

  if (!config) {
    console.error("Google OAuth start failed: missing Google OAuth credentials");
    return redirectToLogin(request);
  }

  const state = createGoogleOAuthRandomValue();
  const nonce = createGoogleOAuthRandomValue();
  const response = NextResponse.redirect(
    buildGoogleOAuthUrl({
      clientId: config.clientId,
      nonce: createGoogleOAuthNonceClaim(nonce),
      redirectUri: googleOAuthRedirectUri(requestUrl),
      state,
    }),
    303,
  );

  const secureCookie = process.env.NODE_ENV === "production";

  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: GOOGLE_OAUTH_COOKIE_PATH,
    sameSite: "lax",
    secure: secureCookie,
  });
  response.cookies.set(GOOGLE_OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: GOOGLE_OAUTH_COOKIE_PATH,
    sameSite: "lax",
    secure: secureCookie,
  });

  if (mode === "register" && accountType) {
    response.cookies.set(OAUTH_ACCOUNT_TYPE_COOKIE, accountType, {
      httpOnly: true,
      maxAge: COOKIE_MAX_AGE_SECONDS,
      path: "/auth",
      sameSite: "lax",
      secure: secureCookie,
    });
  } else {
    response.cookies.delete({
      name: OAUTH_ACCOUNT_TYPE_COOKIE,
      path: "/auth",
    });
  }

  if (returnTo) {
    response.cookies.set(AUTH_RETURN_TO_COOKIE, returnTo, {
      httpOnly: true,
      maxAge: COOKIE_MAX_AGE_SECONDS,
      path: "/auth",
      sameSite: "lax",
      secure: secureCookie,
    });
  } else {
    response.cookies.delete({
      name: AUTH_RETURN_TO_COOKIE,
      path: "/auth",
    });
  }

  return response;
}
