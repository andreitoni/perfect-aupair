import { SITE_URL } from "@/lib/site";

export type OptionalEmailCategory =
  | "new_message"
  | "profile_completion";

export function getOptionalEmailUnsubscribeUrl(
  token: string,
  category: OptionalEmailCategory,
) {
  const url = new URL("/api/email/unsubscribe", SITE_URL);
  url.searchParams.set("token", token);
  url.searchParams.set("category", category);
  return url.toString();
}

export function getOptionalEmailUnsubscribeHeaders(
  token: string,
  category: OptionalEmailCategory,
) {
  const unsubscribeUrl = getOptionalEmailUnsubscribeUrl(token, category);

  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
