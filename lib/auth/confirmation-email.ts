import "server-only";

import { headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { withAuthReturnTo } from "@/lib/auth/return-to";

export function createAuthEmailClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Missing Supabase signup environment variables");
  }

  return createSupabaseClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function getEmailRedirectOrigin() {
  const headerStore = await headers();

  return (
    headerStore.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://perfectaupair.example"
  );
}

export async function resendSignupConfirmationEmail(
  email: string,
  returnTo?: string | null,
) {
  const emailClient = createAuthEmailClient();
  const origin = await getEmailRedirectOrigin();
  const confirmationUrl = new URL(
    withAuthReturnTo("/auth/confirm", returnTo),
    origin,
  );

  return emailClient.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: confirmationUrl.toString(),
    },
  });
}
