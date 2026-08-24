import "server-only";

import { getRequestSecurityIdentifiers } from "@/lib/security/request";

type TurnstileSiteverifyResponse = {
  success?: boolean;
  "error-codes"?: string[];
};

const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function isTurnstileConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() &&
      process.env.TURNSTILE_SECRET_KEY?.trim(),
  );
}

export async function verifyTurnstileToken(token?: string | null) {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  const response = token?.trim();

  if (!secret || !response) {
    return false;
  }

  const identifiers = await getRequestSecurityIdentifiers();
  const body = new URLSearchParams({
    secret,
    response,
  });

  if (identifiers.ipAddress !== "unknown") {
    body.set("remoteip", identifiers.ipAddress);
  }

  try {
    const result = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });

    if (!result.ok) {
      console.warn("Turnstile verification failed.", {
        status: result.status,
      });
      return false;
    }

    const payload = (await result.json()) as TurnstileSiteverifyResponse;

    if (!payload.success) {
      console.warn("Turnstile rejected token.", {
        codes: payload["error-codes"] ?? [],
      });
    }

    return Boolean(payload.success);
  } catch (error) {
    console.warn("Turnstile verification failed.", {
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function shouldRequireTurnstile({
  challengeRequired,
  token,
}: {
  challengeRequired: boolean;
  token?: string | null;
}) {
  if (!challengeRequired || !isTurnstileConfigured()) {
    return false;
  }

  return !(await verifyTurnstileToken(token));
}
