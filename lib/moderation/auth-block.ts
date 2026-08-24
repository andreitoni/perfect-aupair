import "server-only";

import { isAdminServiceConfigured } from "@/lib/admin/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERMANENT_BAN_MESSAGE } from "@/lib/moderation/rules";

type BannedEmailRow = {
  email: string;
  reason: string | null;
};

type SuspendedEmailProfile = {
  email: string | null;
  suspended_at: string | null;
  suspended_until: string | null;
  suspended_reason: string | null;
};

export function normalizeAuthEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? "";
}

export async function getPermanentEmailBan(email?: string | null) {
  const normalizedEmail = normalizeAuthEmail(email);

  if (!normalizedEmail || !isAdminServiceConfigured()) {
    return null;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("banned_auth_emails")
    .select("email, reason")
    .eq("email", normalizedEmail)
    .maybeSingle<BannedEmailRow>();

  if (error) {
    console.error("Could not check banned email", error.message);
    return null;
  }

  return data;
}

export function permanentBanLoginMessage(reason?: string | null) {
  return reason?.trim() || PERMANENT_BAN_MESSAGE;
}

export async function getActiveSuspensionForEmail(email?: string | null) {
  const normalizedEmail = normalizeAuthEmail(email);

  if (!normalizedEmail || !isAdminServiceConfigured()) {
    return null;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("email, suspended_at, suspended_until, suspended_reason")
    .eq("email", normalizedEmail)
    .not("suspended_at", "is", null)
    .maybeSingle<SuspendedEmailProfile>();

  if (error) {
    console.error("Could not check suspended email", error.message);
    return null;
  }

  if (!data?.suspended_at) {
    return null;
  }

  if (
    data.suspended_until &&
    new Date(data.suspended_until).getTime() <= Date.now()
  ) {
    return null;
  }

  return data;
}

export function suspensionLoginMessage(profile: SuspendedEmailProfile) {
  const reason =
    profile.suspended_reason?.trim() || "violating the platform rules";

  if (!profile.suspended_until) {
    return `Your account has been suspended for ${reason}.`;
  }

  const suspendedUntil = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(profile.suspended_until));

  return `Your account has been suspended until ${suspendedUntil} for ${reason}.`;
}
