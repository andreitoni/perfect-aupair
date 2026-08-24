import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIpPrefix, getTrustedClientIp } from "@/lib/security/request";

export type AuthEmailRequestAction =
  | "signup_confirmation"
  | "resend_confirmation";

type AuthEmailRateLimitRow = {
  allowed: boolean;
  retry_after_seconds: number | null;
  reason: string | null;
};

export type AuthEmailRateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
  reason: string | null;
};

const DEFAULT_RETRY_AFTER_SECONDS = 60;

function getHashSecret() {
  return (
    process.env.AUTH_RATE_LIMIT_HASH_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SERVICE_ROLE_KEY ??
    "perfect-aupair-auth-email-rate-limit"
  );
}

function hashIdentifier(value: string) {
  return createHmac("sha256", getHashSecret()).update(value).digest("hex");
}

export function normalizeAuthEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const atIndex = normalizedEmail.lastIndexOf("@");

  if (atIndex <= 0 || atIndex === normalizedEmail.length - 1) {
    return normalizedEmail;
  }

  const localPart = normalizedEmail.slice(0, atIndex);
  const rawDomain = normalizedEmail.slice(atIndex + 1);
  const domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain;

  if (domain === "gmail.com") {
    const gmailLocalPart = localPart.split("+")[0].replace(/\./g, "");
    return `${gmailLocalPart}@${domain}`;
  }

  return `${localPart}@${domain}`;
}

function getEmailDomain(email: string) {
  const atIndex = email.lastIndexOf("@");

  if (atIndex < 0 || atIndex === email.length - 1) {
    return "unknown";
  }

  return email.slice(atIndex + 1).toLowerCase();
}

function getRetryAfterSeconds(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) {
    return DEFAULT_RETRY_AFTER_SECONDS;
  }

  return Math.max(DEFAULT_RETRY_AFTER_SECONDS, Math.ceil(value));
}

export function authEmailRateLimitMessage(retryAfterSeconds: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));

  return `Too many confirmation email requests. Please try again in ${minutes} minute${
    minutes === 1 ? "" : "s"
  }.`;
}

export async function recordAuthEmailRequest(
  action: AuthEmailRequestAction,
  email: string,
): Promise<AuthEmailRateLimitDecision> {
  const normalizedEmail = normalizeAuthEmail(email);
  const headerStore = await headers();
  const ipAddress = getTrustedClientIp(headerStore);
  const ipPrefix = getIpPrefix(ipAddress);
  const userAgent = headerStore.get("user-agent")?.slice(0, 500) ?? "";

  let data: unknown;

  try {
    const adminClient = createAdminClient();
    const result = await adminClient.rpc("record_auth_email_request", {
      p_action: action,
      p_email_hash: hashIdentifier(`email:${normalizedEmail}`),
      p_email_domain: getEmailDomain(normalizedEmail),
      p_ip_hash: hashIdentifier(`ip:${ipAddress}`),
      p_ip_prefix_hash: hashIdentifier(`ip-prefix:${ipPrefix}`),
      p_user_agent_hash: userAgent
        ? hashIdentifier(`user-agent:${userAgent}`)
        : null,
    });

    if (result.error) {
      console.error("Auth email request limiter failed", {
        code: result.error.code,
        message: result.error.message,
      });

      return {
        allowed: false,
        retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS,
        reason: "rate_limiter_unavailable",
      };
    }

    data = result.data;
  } catch (error) {
    console.error("Auth email request limiter failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });

    return {
      allowed: false,
      retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS,
      reason: "rate_limiter_unavailable",
    };
  }

  const row = Array.isArray(data)
    ? (data[0] as AuthEmailRateLimitRow | undefined)
    : (data as AuthEmailRateLimitRow | null);

  if (!row?.allowed) {
    return {
      allowed: false,
      retryAfterSeconds: getRetryAfterSeconds(row?.retry_after_seconds),
      reason: row?.reason ?? "rate_limited",
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: getRetryAfterSeconds(row.retry_after_seconds),
    reason: null,
  };
}
