import { NextResponse } from "next/server";
import {
  authEmailRateLimitMessage,
  recordAuthEmailRequest,
} from "@/lib/auth/email-request-rate-limit";
import { resendSignupConfirmationEmail } from "@/lib/auth/confirmation-email";
import { friendlyAuthErrorMessage } from "@/lib/auth/errors";
import { safeAuthReturnTo } from "@/lib/auth/return-to";

type ResendConfirmationCodePayload = {
  email?: unknown;
  returnTo?: unknown;
};

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isSupabaseRateLimitError(message: string) {
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("too many requests")
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | ResendConfirmationCodePayload
    | null;
  const email = readString(body?.email).toLowerCase();
  const returnTo = safeAuthReturnTo(readString(body?.returnTo));

  if (!email) {
    return NextResponse.json(
      { error: "Please enter your email address." },
      { status: 400 },
    );
  }

  const emailRequestDecision = await recordAuthEmailRequest(
    "resend_confirmation",
    email,
  );

  if (!emailRequestDecision.allowed) {
    const retryAfterSeconds = emailRequestDecision.retryAfterSeconds;

    return NextResponse.json(
      {
        error: authEmailRateLimitMessage(retryAfterSeconds),
        retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds),
        },
      },
    );
  }

  let resendError: { message: string } | null = null;

  try {
    const resendResult = await resendSignupConfirmationEmail(email, returnTo);
    resendError = resendResult.error;
  } catch (error) {
    resendError = {
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }

  if (resendError && isSupabaseRateLimitError(resendError.message)) {
    return NextResponse.json(
      {
        error: friendlyAuthErrorMessage(resendError.message),
        retryAfterSeconds: 60,
      },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
        },
      },
    );
  }

  if (resendError) {
    console.error("Confirmation code resend failed", {
      message: resendError.message,
    });
  }

  return NextResponse.json({
    ok: true,
    retryAfterSeconds: Math.max(60, emailRequestDecision.retryAfterSeconds),
  });
}
