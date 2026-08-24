import "server-only";

export const OAUTH_ACCOUNT_TYPE_COOKIE = "pa_oauth_account_type";

export type OAuthAccountType = "family" | "au_pair";

export function normalizeOAuthAccountType(
  value: string | null | undefined,
): OAuthAccountType | null {
  if (value === "family" || value === "au_pair") {
    return value;
  }

  return null;
}

