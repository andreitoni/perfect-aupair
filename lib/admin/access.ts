import "server-only";

import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function parseAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminConfigured() {
  return parseAdminEmails().size > 0;
}

export function isAdminEmail(email?: string | null) {
  return Boolean(email && parseAdminEmails().has(email.trim().toLowerCase()));
}

export function redirectAdminToDashboard(user?: { email?: string | null } | null) {
  if (isAdminEmail(user?.email)) {
    redirect("/admin");
  }
}

export function isAdminServiceConfigured() {
  return Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY,
  );
}

export async function requireAdminUser() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!isAdminEmail(user.email)) {
    notFound();
  }

  if (isAdminServiceConfigured()) {
    const supabaseAdmin = createAdminClient();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_admin: true })
      .eq("id", user.id);

    if (error) {
      console.error("Failed to mark admin profile", error.message);
    }
  }

  return user;
}
