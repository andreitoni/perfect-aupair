export const COOKIE_CONSENT_STORAGE_KEY = "pa_cookie_consent";
export const COOKIE_CONSENT_COOKIE_NAME = "pa_cookie_consent";
export const COOKIE_CONSENT_OPEN_EVENT = "pa:cookie-consent-open";
export const COOKIE_CONSENT_CHANGE_EVENT = "pa:cookie-consent-change";

export type CookieConsentChoice = "all" | "necessary";

export function parseCookieConsentChoice(
  value?: string | null,
): CookieConsentChoice | null {
  return value === "all" || value === "necessary" ? value : null;
}
