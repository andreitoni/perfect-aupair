import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";

function firstHeaderAddress(value: string | null) {
  return value?.split(",")[0]?.trim() ?? "";
}

type RequestHeaderReader = {
  get(name: string): string | null;
};

export function normalizeIpAddress(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "unknown";
  }

  if (trimmed.startsWith("[") && trimmed.includes("]")) {
    return trimmed.slice(1, trimmed.indexOf("]")).toLowerCase();
  }

  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(trimmed)) {
    return trimmed.slice(0, trimmed.lastIndexOf(":"));
  }

  return trimmed.toLowerCase();
}

export function getIpPrefix(ipAddress: string) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ipAddress)) {
    const parts = ipAddress.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }

  if (ipAddress.includes(":")) {
    const parts = ipAddress.split(":").slice(0, 4).join(":");
    return `${parts}::/64`;
  }

  return ipAddress;
}

export function getTrustedClientIp(headerStore: RequestHeaderReader) {
  const isVercel =
    process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
  const trustsCloudflare =
    process.env.TRUST_CLOUDFLARE_PROXY?.trim().toLowerCase() === "true";

  if (isVercel) {
    return normalizeIpAddress(
      firstHeaderAddress(headerStore.get("x-vercel-forwarded-for")) ||
        firstHeaderAddress(headerStore.get("x-forwarded-for")) ||
        firstHeaderAddress(headerStore.get("x-real-ip")),
    );
  }

  if (trustsCloudflare) {
    return normalizeIpAddress(
      firstHeaderAddress(headerStore.get("cf-connecting-ip")) ||
        firstHeaderAddress(headerStore.get("x-forwarded-for")) ||
        firstHeaderAddress(headerStore.get("x-real-ip")),
    );
  }

  return normalizeIpAddress(
    firstHeaderAddress(headerStore.get("x-forwarded-for")) ||
      firstHeaderAddress(headerStore.get("x-real-ip")),
  );
}

function getHashSecret() {
  return (
    process.env.SECURITY_RATE_LIMIT_HASH_SECRET ??
    process.env.AUTH_RATE_LIMIT_HASH_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SERVICE_ROLE_KEY ??
    "perfect-aupair-security-rate-limit"
  );
}

export function hashSecurityIdentifier(value: string) {
  return createHmac("sha256", getHashSecret()).update(value).digest("hex");
}

export async function getRequestSecurityIdentifiers() {
  const headerStore = await headers();
  const ipAddress = getTrustedClientIp(headerStore);
  const ipPrefix = getIpPrefix(ipAddress);
  const userAgent = headerStore.get("user-agent")?.slice(0, 500) ?? "";

  return {
    ipAddress,
    ipHash: hashSecurityIdentifier(`ip:${ipAddress}`),
    ipPrefixHash: hashSecurityIdentifier(`ip-prefix:${ipPrefix}`),
    userAgentHash: userAgent
      ? hashSecurityIdentifier(`user-agent:${userAgent}`)
      : null,
  };
}
