export const LIVE_SITE_PRESENCE_CHANNEL = "live-site-presence-v1";

export type LivePresenceAudience = "authenticated" | "visitor";

export type LivePresencePayload = {
  audience?: LivePresenceAudience;
  online_at?: string;
};
