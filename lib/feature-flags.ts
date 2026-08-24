import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export const ANALYTICS_FEATURE_FLAGS_CACHE_TAG =
  "analytics-feature-flags";
const ANALYTICS_FEATURE_FLAG_TIMEOUT_MS = 1_500;

export const FEATURE_FLAGS = {
  stories: true,
  uploads: true,
  profile_videos: true,
  message_send: true,
  message_media_uploads: true,
  private_media_delivery: true,
  engagement_emails: true,
  clarity: true,
  hotjar: true,
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export const FEATURE_FLAG_DESCRIPTIONS: Record<FeatureFlagKey, string> = {
  stories: "Allow users to create and view active stories.",
  uploads: "Allow user-generated media uploads.",
  profile_videos: "Allow optional profile intro video uploads.",
  message_send: "Allow users to send private messages.",
  message_media_uploads: "Allow photo, video, and voice message attachments.",
  private_media_delivery:
    "Emergency kill switch for all same-origin private media delivery.",
  engagement_emails:
    "Allow bounded first-message notification emails.",
  clarity: "Allow Microsoft Clarity when optional analytics consent is granted.",
  hotjar: "Allow Hotjar when optional analytics consent is granted.",
};

export const FULLY_LINKED_FEATURE_FLAGS = new Set<FeatureFlagKey>([
  "message_send",
  "message_media_uploads",
  "private_media_delivery",
  "engagement_emails",
]);

type FeatureFlagRow = {
  enabled: boolean;
};

type AnalyticsFeatureFlagRow = FeatureFlagRow & {
  key: "clarity" | "hotjar";
};

const loadAnalyticsFeatureFlags = unstable_cache(
  async () => {
    // Session-replay tools are privacy-sensitive and must require an explicit,
    // successful DB flag lookup. A timeout, missing row, or service-role
    // configuration problem therefore fails closed.
    const fallback = {
      clarity: false,
      hotjar: false,
    };
    const abortController = new AbortController();
    const timeout = setTimeout(
      () => abortController.abort(),
      ANALYTICS_FEATURE_FLAG_TIMEOUT_MS,
    );

    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("feature_flags")
        .select("key, enabled")
        .in("key", ["clarity", "hotjar"])
        .abortSignal(abortController.signal)
        .returns<AnalyticsFeatureFlagRow[]>();

      if (error) {
        console.warn("Analytics feature flag lookup failed.", {
          message: error.message,
        });
        return fallback;
      }

      return (data ?? []).reduce(
        (flags, row) => ({ ...flags, [row.key]: row.enabled }),
        fallback,
      );
    } catch (error) {
      console.warn("Analytics feature flag lookup failed.", {
        message: error instanceof Error ? error.message : String(error),
      });
      return fallback;
    } finally {
      clearTimeout(timeout);
    }
  },
  ["analytics-feature-flags-v1"],
  {
    revalidate: 60,
    tags: [ANALYTICS_FEATURE_FLAGS_CACHE_TAG],
  },
);

function applyFeatureFlagEnvOverride(
  key: "clarity" | "hotjar",
  fallback: boolean,
) {
  const envOverride = process.env[`FEATURE_${key.toUpperCase()}_ENABLED`];

  if (envOverride === "false" || envOverride === "0") return false;
  if (envOverride === "true" || envOverride === "1") return true;

  return fallback;
}

export async function getAnalyticsFeatureFlags() {
  const flags = await loadAnalyticsFeatureFlags();

  return {
    clarity: applyFeatureFlagEnvOverride("clarity", flags.clarity),
    hotjar: applyFeatureFlagEnvOverride("hotjar", flags.hotjar),
  };
}

export async function isFeatureEnabled(key: FeatureFlagKey) {
  const envOverride = process.env[`FEATURE_${key.toUpperCase()}_ENABLED`];

  if (envOverride === "false" || envOverride === "0") {
    return false;
  }

  if (envOverride === "true" || envOverride === "1") {
    return true;
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("feature_flags")
      .select("enabled")
      .eq("key", key)
      .maybeSingle<FeatureFlagRow>();

    if (error) {
      console.warn("Feature flag lookup failed.", {
        key,
        message: error.message,
      });

      return FEATURE_FLAGS[key];
    }

    return data?.enabled ?? FEATURE_FLAGS[key];
  } catch (error) {
    console.warn("Feature flag lookup failed.", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });

    return FEATURE_FLAGS[key];
  }
}

export async function assertFeatureEnabled(
  key: FeatureFlagKey,
  message = "This feature is temporarily unavailable. Please try again later.",
) {
  if (!(await isFeatureEnabled(key))) {
    throw new Error(message);
  }
}
