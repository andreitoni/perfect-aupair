import { NextResponse } from "next/server";
import { friendlyAuthErrorMessage } from "@/lib/auth/errors";
import {
  authHomeHref,
  safeAuthReturnTo,
  withAuthReturnTo,
} from "@/lib/auth/return-to";
import {
  getActiveSuspensionForEmail,
  getPermanentEmailBan,
  permanentBanLoginMessage,
  suspensionLoginMessage,
} from "@/lib/moderation/auth-block";
import {
  recordSecurityRequest,
  securityRateLimitMessage,
} from "@/lib/security/rate-limit";
import { shouldRequireTurnstile } from "@/lib/security/turnstile";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { recordAccountLoginIp } from "@/lib/security/account-login-ip";

async function readCredentials(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null);

    return {
      email: String(body?.email ?? "").trim(),
      password: String(body?.password ?? ""),
      returnTo: safeAuthReturnTo(body?.returnTo),
      turnstileToken: String(body?.turnstileToken ?? ""),
      isJsonRequest: true,
    };
  }

  const formData = await request.formData().catch(() => null);

  return {
    email: String(formData?.get("email") ?? "").trim(),
    password: String(formData?.get("password") ?? ""),
    returnTo: safeAuthReturnTo(
      typeof formData?.get("returnTo") === "string"
        ? String(formData.get("returnTo"))
        : null,
    ),
    turnstileToken: String(
      formData?.get("turnstile_token") ??
        formData?.get("cf-turnstile-response") ??
        "",
    ),
    isJsonRequest: false,
  };
}

export async function POST(request: Request) {
  const { email, password, returnTo, turnstileToken, isJsonRequest } =
    await readCredentials(request);

  if (!email || !password) {
    if (isJsonRequest) {
      return NextResponse.json(
        { error: "Please enter your email and password." },
        { status: 400 },
      );
    }

    const loginUrl = new URL(withAuthReturnTo("/login", returnTo), request.url);
    loginUrl.searchParams.set("error", "Please enter your email and password.");

    return NextResponse.redirect(loginUrl, 303);
  }

  const rateLimitDecision = await recordSecurityRequest({
    action: "login",
    subject: email,
  });

  if (!rateLimitDecision.allowed) {
    const message = securityRateLimitMessage(
      rateLimitDecision.retryAfterSeconds,
    );

    if (isJsonRequest) {
      return NextResponse.json(
        {
          error: message,
          retryAfterSeconds: rateLimitDecision.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimitDecision.retryAfterSeconds),
          },
        },
      );
    }

    const loginUrl = new URL(withAuthReturnTo("/login", returnTo), request.url);
    loginUrl.searchParams.set("error", message);

    return NextResponse.redirect(loginUrl, 303);
  }

  if (
    await shouldRequireTurnstile({
      challengeRequired: rateLimitDecision.challengeRequired,
      token: turnstileToken,
    })
  ) {
    const message = "Please complete the security check and try again.";

    if (isJsonRequest) {
      return NextResponse.json(
        {
          error: message,
          challengeRequired: true,
        },
        { status: 428 },
      );
    }

    const loginUrl = new URL(withAuthReturnTo("/login", returnTo), request.url);
    loginUrl.searchParams.set("error", message);

    return NextResponse.redirect(loginUrl, 303);
  }

  const permanentBan = await getPermanentEmailBan(email);

  if (permanentBan) {
    const message = permanentBanLoginMessage(permanentBan.reason);

    if (isJsonRequest) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    const loginUrl = new URL(withAuthReturnTo("/login", returnTo), request.url);
    loginUrl.searchParams.set("error", message);

    return NextResponse.redirect(loginUrl, 303);
  }

  const activeSuspension = await getActiveSuspensionForEmail(email);

  if (activeSuspension) {
    const message = suspensionLoginMessage(activeSuspension);

    if (isJsonRequest) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    const loginUrl = new URL(withAuthReturnTo("/login", returnTo), request.url);
    loginUrl.searchParams.set("error", message);

    return NextResponse.redirect(loginUrl, 303);
  }

  const { supabase, applyCookies } = await createRouteHandlerClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    const message = friendlyAuthErrorMessage(error.message);

    if (isJsonRequest) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const loginUrl = new URL(withAuthReturnTo("/login", returnTo), request.url);
    loginUrl.searchParams.set("error", message);

    return applyCookies(NextResponse.redirect(loginUrl, 303));
  }

  if (data.user) {
    await recordAccountLoginIp({
      profileId: data.user.id,
      request,
      authMethod: "password",
    });
  }

  if (isJsonRequest) {
    return applyCookies(
      NextResponse.json({ ok: true, redirectTo: authHomeHref(returnTo) }),
    );
  }

  return applyCookies(
    NextResponse.redirect(new URL(authHomeHref(returnTo), request.url), 303),
  );
}
