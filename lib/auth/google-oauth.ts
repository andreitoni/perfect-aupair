import "server-only";

import { createHash, randomBytes } from "crypto";

export const GOOGLE_OAUTH_STATE_COOKIE = "pa_google_oauth_state";
export const GOOGLE_OAUTH_NONCE_COOKIE = "pa_google_oauth_nonce";
export const GOOGLE_OAUTH_COOKIE_PATH = "/auth/oauth/google";

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
};

export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId =
    process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret =
    process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
  };
}

export function createGoogleOAuthRandomValue() {
  return randomBytes(32).toString("base64url");
}

// Google receives the SHA-256 nonce claim while Supabase receives the original
// high-entropy value and performs the same OIDC verification. This is a nonce,
// not a password or a stored credential.
export function createGoogleOAuthNonceClaim(nonce: string) {
  return createHash("sha256").update(nonce).digest("hex");
}

export function googleOAuthRedirectUri(requestUrl: URL) {
  return new URL("/auth/oauth/google/callback", requestUrl.origin).toString();
}

export function buildGoogleOAuthUrl({
  clientId,
  nonce,
  redirectUri,
  state,
}: {
  clientId: string;
  nonce: string;
  redirectUri: string;
  state: string;
}) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("prompt", "select_account");

  return url;
}
