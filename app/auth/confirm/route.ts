import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { authHomeHref, loginHref, safeAuthReturnTo } from "@/lib/auth/return-to";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createClient } from "@/lib/supabase/server";

const validTypes = new Set([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function normalizeType(value: string | null): EmailOtpType | null {
  if (!value || !validTypes.has(value)) {
    return null;
  }

  return value as EmailOtpType;
}

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

async function redirectForCurrentSession(
  origin: string,
  returnTo: string | null,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL(loginHref(returnTo), origin));
  }

  return NextResponse.redirect(new URL(authHomeHref(returnTo), origin));
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;

  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = normalizeType(requestUrl.searchParams.get("type"));
  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(requestUrl.searchParams.get("next"));
  const returnTo = safeAuthReturnTo(requestUrl.searchParams.get("returnTo"));

  if (code) {
    const { supabase, applyCookies } = await createRouteHandlerClient();
    await supabase.auth.exchangeCodeForSession(code);

    if (type === "recovery") {
      return applyCookies(
        NextResponse.redirect(new URL(next ?? "/reset-password", origin)),
      );
    }

    return applyCookies(
      NextResponse.redirect(new URL(authHomeHref(returnTo), origin)),
    );
  }

  if (!tokenHash || !type) {
    return redirectForCurrentSession(origin, returnTo);
  }

  const { supabase, applyCookies } = await createRouteHandlerClient();

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    return redirectForCurrentSession(origin, returnTo);
  }

  if (type === "recovery") {
    return applyCookies(
      NextResponse.redirect(new URL(next ?? "/reset-password", origin)),
    );
  }

  return applyCookies(
    NextResponse.redirect(new URL(authHomeHref(returnTo), origin)),
  );
}
