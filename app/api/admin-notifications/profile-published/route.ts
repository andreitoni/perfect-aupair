import { sendNewPublicProfileAdminEmail } from "@/lib/email/admin-notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { after } from "next/server";
import { NextResponse } from "next/server";

type PublicProfileEmailRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  account_type: string | null;
  city: string | null;
  country: string | null;
  created_at: string | null;
};

export async function POST() {
  const { supabase, applyCookies } = await createRouteHandlerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return applyCookies(
      NextResponse.json({ queued: false }, { status: 401 }),
    );
  }

  const admin = createAdminClient();
  const { data: claimToken, error: claimError } = await admin.rpc(
    "claim_admin_profile_publication_notification",
    { p_profile_id: user.id },
  );

  if (claimError) {
    console.error("Could not claim new public profile notification.", {
      message: claimError.message,
      profileId: user.id,
    });
    return applyCookies(
      NextResponse.json({ queued: false }, { status: 503 }),
    );
  }

  if (typeof claimToken !== "string" || !claimToken) {
    return applyCookies(NextResponse.json({ queued: false }));
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, email, account_type, city, country, created_at")
    .eq("id", user.id)
    .single<PublicProfileEmailRow>();

  if (profileError || !profile) {
    await admin.rpc("release_admin_profile_publication_notification", {
      p_claim_token: claimToken,
      p_profile_id: user.id,
    });
    return applyCookies(
      NextResponse.json({ queued: false }, { status: 503 }),
    );
  }

  after(async () => {
    try {
      const delivery = await sendNewPublicProfileAdminEmail({
        profileId: profile.id,
        profileName: profile.full_name,
        profileEmail: profile.email,
        accountType: profile.account_type,
        city: profile.city,
        country: profile.country,
        createdAt: profile.created_at,
      });

      const operation = delivery.sent
        ? "complete_admin_profile_publication_notification"
        : "release_admin_profile_publication_notification";
      const { error: settlementError } = await admin.rpc(operation, {
        p_claim_token: claimToken,
        p_profile_id: user.id,
        ...(delivery.sent ? { p_sent_at: new Date().toISOString() } : {}),
      });

      if (settlementError) {
        console.error("Could not settle new public profile notification.", {
          message: settlementError.message,
          profileId: user.id,
        });
      }
    } catch (error) {
      await admin.rpc("release_admin_profile_publication_notification", {
        p_claim_token: claimToken,
        p_profile_id: user.id,
      });
      console.error("New public profile notification failed.", {
        message: error instanceof Error ? error.message : String(error),
        profileId: user.id,
      });
    }
  });

  return applyCookies(NextResponse.json({ queued: true }));
}
