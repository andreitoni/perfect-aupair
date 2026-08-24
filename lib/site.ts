export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://perfectaupair.example";

export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.invalid";

export const SITE_NAME = "Perfect AuPair";

export const SITE_DESCRIPTION =
  "Find au pairs and host families through detailed member profiles, photos, stories, and private conversations.";

export const SOCIAL_PREVIEW_PATH =
  "/brand/perfect-aupair-social-preview-v5.jpg";

export const SOCIAL_PREVIEW_ALT =
  "Perfect AuPair — browse au pair and host family profiles";

export const AU_PAIR_SOCIAL_PREVIEW_PATH = SOCIAL_PREVIEW_PATH;

export const AU_PAIR_SOCIAL_PREVIEW_ALT = SOCIAL_PREVIEW_ALT;

export const FAMILY_SOCIAL_PREVIEW_PATH = SOCIAL_PREVIEW_PATH;

export const FAMILY_SOCIAL_PREVIEW_ALT = SOCIAL_PREVIEW_ALT;
