import { NextResponse } from "next/server";
import {
  recordSecurityRequest,
  securityRateLimitMessage,
} from "@/lib/security/rate-limit";
import { shouldRequireTurnstile } from "@/lib/security/turnstile";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

type PasswordResetPayload = {
  email?: unknown;
  turnstileToken?: unknown;
};

type ResetErrorCode = "reset_failed";

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function errorResponse(error: string, code: ResetErrorCode, status = 400) {
  return NextResponse.json({ error, code }, { status });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | PasswordResetPayload
    | null;
  const email = normalizeEmail(body?.email);
  const turnstileToken =
    typeof body?.turnstileToken === "string" ? body.turnstileToken : "";

  if (!email) {
    return errorResponse("Please enter your email address.", "reset_failed");
  }

  const securityDecision = await recordSecurityRequest({
    action: "password_reset",
    subject: email,
  });

  if (!securityDecision.allowed) {
    return NextResponse.json(
      {
        error: securityRateLimitMessage(securityDecision.retryAfterSeconds),
        code: "reset_failed",
        retryAfterSeconds: securityDecision.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(securityDecision.retryAfterSeconds),
        },
      },
    );
  }

  if (
    await shouldRequireTurnstile({
      challengeRequired: securityDecision.challengeRequired,
      token: turnstileToken,
    })
  ) {
    return NextResponse.json(
      {
        error: "Please complete the security check and try again.",
        code: "reset_failed",
        challengeRequired: true,
      },
      { status: 428 },
    );
  }

  const { supabase } = await createRouteHandlerClient();
  const requestUrl = new URL(request.url);
  const redirectTo = new URL(
    "/auth/confirm?next=/reset-password",
    requestUrl.origin,
  ).toString();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    // Keep the public response indistinguishable for missing, unconfirmed, and
    // existing accounts. Supabase can reject some states synchronously; exposing
    // that distinction would turn this endpoint into an account-enumeration API.
    console.error("Supabase password reset request failed.", {
      status: error.status,
      code: error.code,
    });
  }

  return NextResponse.json({ ok: true });
}
