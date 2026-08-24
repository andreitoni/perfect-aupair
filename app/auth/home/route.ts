import { NextResponse } from "next/server";
import { ensureProfileForAuthUser } from "@/lib/auth/ensure-profile";
import { isAdminEmail, isAdminServiceConfigured } from "@/lib/admin/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  loginHref,
  safeAuthReturnTo,
  withAuthReturnTo,
} from "@/lib/auth/return-to";

type AuthHomeProfile = {
  account_type: string | null;
  onboarding_completed: boolean | null;
  suspended_at: string | null;
  suspended_until: string | null;
  deletion_requested_at: string | null;
};

function destinationForProfile(
  profile?: {
    account_type: string | null;
    onboarding_completed: boolean | null;
  } | null,
) {
  if (!profile?.onboarding_completed) {
    return "/onboarding";
  }

  if (profile.account_type === "family") {
    return "/search-aupair";
  }

  if (profile.account_type === "au_pair") {
    return "/search-family";
  }

  return "/account";
}

function requiresProfilePhoto(profile?: {
  account_type: string | null;
  onboarding_completed: boolean | null;
} | null) {
  return (
    profile?.onboarding_completed === true &&
    (profile.account_type === "family" || profile.account_type === "au_pair")
  );
}

function hasActiveSuspension(profile?: {
  suspended_at?: string | null;
  suspended_until?: string | null;
} | null) {
  if (!profile?.suspended_at) return false;
  if (!profile.suspended_until) return true;

  return new Date(profile.suspended_until).getTime() > Date.now();
}

async function clearExpiredSuspension(userId: string) {
  if (!isAdminServiceConfigured()) {
    return;
  }

  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      suspended_at: null,
      suspended_until: null,
      suspension_rule: null,
      suspended_reason: null,
      suspended_by: null,
    })
    .eq("id", userId);

  if (error) {
    console.error("Could not clear expired suspension", error.message);
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const returnTo = safeAuthReturnTo(requestUrl.searchParams.get("returnTo"));
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const hasRetried = requestUrl.searchParams.get("retry") === "1";
    const loginUrl = new URL(loginHref(returnTo), origin);
    loginUrl.searchParams.set("auth", hasRetried ? "failed" : "retry");

    return NextResponse.redirect(loginUrl);
  }

  if (isAdminEmail(user.email)) {
    return NextResponse.redirect(new URL("/admin", origin));
  }

  let { data: profile } = await supabase
    .from("profiles")
    .select(
      "account_type, onboarding_completed, suspended_at, suspended_until, deletion_requested_at",
    )
    .eq("id", user.id)
    .maybeSingle<AuthHomeProfile>();

  if (!profile) {
    const ensuredProfile = await ensureProfileForAuthUser(user);

    profile = ensuredProfile
      ? {
          ...ensuredProfile,
          suspended_at: null,
          suspended_until: null,
          deletion_requested_at: null,
        }
      : null;
  }

  if (!profile) {
    await supabase.auth.signOut();
    const loginUrl = new URL(loginHref(returnTo), origin);
    loginUrl.searchParams.set("auth", "failed");

    return NextResponse.redirect(loginUrl);
  }

  if (hasActiveSuspension(profile)) {
    return NextResponse.redirect(new URL("/account-suspended", origin));
  }

  if (profile.deletion_requested_at) {
    return NextResponse.redirect(new URL("/account-deletion-pending", origin));
  }

  if (profile.suspended_at) {
    await clearExpiredSuspension(user.id);
    profile = {
      ...profile,
      suspended_at: null,
      suspended_until: null,
    };
  }

  if (!profile.onboarding_completed) {
    return NextResponse.redirect(
      new URL(withAuthReturnTo("/onboarding", returnTo), origin),
    );
  }

  if (
    profile.account_type !== "family" &&
    profile.account_type !== "au_pair"
  ) {
    return NextResponse.redirect(new URL("/account", origin));
  }

  if (requiresProfilePhoto(profile)) {
    const { count } = await supabase
      .from("profile_photos")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", user.id);

    if ((count ?? 0) < 1) {
      return NextResponse.redirect(
        new URL(withAuthReturnTo("/profile/photos", returnTo), origin),
      );
    }
  }

  if (returnTo) {
    return NextResponse.redirect(new URL(returnTo, origin));
  }

  return NextResponse.redirect(
    new URL(destinationForProfile(profile), origin),
  );
}
