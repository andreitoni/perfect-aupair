import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getRequestSecurityIdentifiers,
  hashSecurityIdentifier,
} from "@/lib/security/request";

export type SecurityRateLimitAction =
  | "login"
  | "signup"
  | "password_reset"
  | "report"
  | "message_send"
  | "story_upload"
  | "profile_photo_upload"
  | "profile_video_upload"
  | "message_media_upload";

type SecurityRateLimitRow = {
  allowed: boolean;
  challenge_required: boolean;
  retry_after_seconds: number | null;
  reason: string | null;
};

export type SecurityRateLimitDecision = {
  allowed: boolean;
  challengeRequired: boolean;
  retryAfterSeconds: number;
  reason: string | null;
};

function normalizeSubject(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function fallbackUnavailable(): SecurityRateLimitDecision {
  return {
    // Security-sensitive writes must not become unlimited when the shared
    // limiter is unavailable. A short retry window keeps the failure bounded.
    allowed: false,
    challengeRequired: false,
    retryAfterSeconds: 60,
    reason: "rate_limiter_unavailable",
  };
}

export function securityRateLimitMessage(retryAfterSeconds: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));

  return `Too many attempts. Please try again in ${minutes} minute${
    minutes === 1 ? "" : "s"
  }.`;
}

export async function recordSecurityRequest({
  action,
  subject,
}: {
  action: SecurityRateLimitAction;
  subject?: string | null;
}): Promise<SecurityRateLimitDecision> {
  let identifiers: Awaited<ReturnType<typeof getRequestSecurityIdentifiers>>;

  try {
    identifiers = await getRequestSecurityIdentifiers();
  } catch (error) {
    console.error("Security rate limiter could not read request headers.", {
      message: error instanceof Error ? error.message : String(error),
    });
    return fallbackUnavailable();
  }

  const normalizedSubject = normalizeSubject(subject);
  const subjectHash = normalizedSubject
    ? hashSecurityIdentifier(`subject:${action}:${normalizedSubject}`)
    : null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("record_security_rate_limit_event", {
      p_action: action,
      p_subject_hash: subjectHash,
      p_ip_hash: identifiers.ipHash,
      p_ip_prefix_hash: identifiers.ipPrefixHash,
      p_user_agent_hash: identifiers.userAgentHash,
    });

    if (error) {
      console.error("Security rate limiter failed.", {
        action,
        code: error.code,
        message: error.message,
      });
      return fallbackUnavailable();
    }

    const row = Array.isArray(data)
      ? (data[0] as SecurityRateLimitRow | undefined)
      : (data as SecurityRateLimitRow | null);

    if (!row) {
      return fallbackUnavailable();
    }

    return {
      allowed: row.allowed,
      challengeRequired: row.challenge_required,
      retryAfterSeconds: Math.max(0, row.retry_after_seconds ?? 0),
      reason: row.reason,
    };
  } catch (error) {
    console.error("Security rate limiter failed.", {
      action,
      message: error instanceof Error ? error.message : String(error),
    });
    return fallbackUnavailable();
  }
}
