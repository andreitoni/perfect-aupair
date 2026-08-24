import { NextResponse } from "next/server";
import { ensureProfileForAuthUser } from "@/lib/auth/ensure-profile";
import { friendlyAuthErrorMessage } from "@/lib/auth/errors";
import { authHomeHref, safeAuthReturnTo } from "@/lib/auth/return-to";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

type VerifyEmailCodePayload = {
  email?: unknown;
  returnTo?: unknown;
  token?: unknown;
};

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | VerifyEmailCodePayload
    | null;
  const email = readString(body?.email).toLowerCase();
  const returnTo = safeAuthReturnTo(readString(body?.returnTo));
  const token = readString(body?.token).replace(/\s+/g, "");

  if (!email || !token) {
    return NextResponse.json(
      { error: "Please enter your email and confirmation code." },
      { status: 400 },
    );
  }

  if (!/^\d{6}$/.test(token)) {
    return NextResponse.json(
      { error: "Please enter the 6-digit confirmation code." },
      { status: 400 },
    );
  }

  const { supabase, applyCookies } = await createRouteHandlerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "signup",
  });

  if (error) {
    return NextResponse.json(
      { error: friendlyAuthErrorMessage(error.message) },
      { status: 400 },
    );
  }

  if (data.user) {
    await ensureProfileForAuthUser(data.user);
  }

  return applyCookies(
    NextResponse.json({ ok: true, redirectTo: authHomeHref(returnTo) }),
  );
}
