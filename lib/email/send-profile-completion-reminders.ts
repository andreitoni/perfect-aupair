import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sendProfileCompletionReminderEmail,
  type ProfileCompletionReminderAccountType,
} from "@/lib/email/profile-completion-reminder";

type ClaimedProfileCompletionReminder = {
  account_type: ProfileCompletionReminderAccountType;
  claim_token: string;
  delivery_id: string;
  first_name: string | null;
  full_name: string | null;
  profile_id: string;
};

type ReminderProfile = {
  account_type: ProfileCompletionReminderAccountType | null;
  deletion_requested_at: string | null;
  email: string | null;
  email_unsubscribe_token: string | null;
  first_name: string | null;
  full_name: string | null;
  is_admin: boolean | null;
  profile_completion_emails_enabled: boolean | null;
  onboarding_completed: boolean | null;
  suspended_at: string | null;
};

function getFirstName(profile: ReminderProfile) {
  return (
    profile.first_name?.trim() ||
    profile.full_name?.trim().split(/\s+/)[0] ||
    null
  );
}

function isEligibleProfile(profile: ReminderProfile | null) {
  return Boolean(
    profile &&
      (profile.account_type === "au_pair" || profile.account_type === "family") &&
      profile.onboarding_completed &&
      profile.profile_completion_emails_enabled &&
      profile.email_unsubscribe_token &&
      !profile.is_admin &&
      !profile.suspended_at &&
      !profile.deletion_requested_at,
  );
}

async function completeClaim(
  supabase: SupabaseClient,
  claim: ClaimedProfileCompletionReminder,
  outcome: "sent" | "suppressed",
  completedAt: string,
) {
  const { data, error } = await supabase.rpc(
    "complete_profile_completion_reminder",
    {
      p_claim_token: claim.claim_token,
      p_completed_at: completedAt,
      p_outcome: outcome,
      p_profile_id: claim.profile_id,
    },
  );

  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("Profile completion reminder claim expired.");
}

async function releaseClaim(
  supabase: SupabaseClient,
  claim: ClaimedProfileCompletionReminder,
) {
  const { error } = await supabase.rpc("release_profile_completion_reminder", {
    p_claim_token: claim.claim_token,
    p_profile_id: claim.profile_id,
  });

  if (error) {
    console.error("Could not release profile completion reminder claim.", {
      message: error.message,
      profileId: claim.profile_id,
    });
  }
}

export async function sendPendingProfileCompletionReminders({
  supabase,
  batchSize = 25,
  forceProfileId,
  now = new Date(),
}: {
  supabase: SupabaseClient;
  batchSize?: number;
  forceProfileId?: string;
  now?: Date;
}) {
  const safeBatchSize = Math.max(1, Math.min(batchSize, 50));
  const { data, error } = forceProfileId
    ? await supabase.rpc("claim_profile_completion_reminder_now", {
        p_now: now.toISOString(),
        p_profile_id: forceProfileId,
      })
    : await supabase.rpc("claim_profile_completion_reminders", {
        p_batch_size: safeBatchSize,
        p_now: now.toISOString(),
      });

  if (error) throw new Error(error.message);

  const claims = ((data ?? []) as ClaimedProfileCompletionReminder[]).filter(
    (claim) =>
      claim.profile_id &&
      claim.claim_token &&
      claim.delivery_id &&
      (claim.account_type === "au_pair" || claim.account_type === "family"),
  );

  let sent = 0;
  let suppressed = 0;
  let retryableFailures = 0;

  for (const claim of claims) {
    let providerAcceptedEmail = false;

    try {
      const [{ data: profile, error: profileError }, photoResult] =
        await Promise.all([
          supabase
            .from("profiles")
            .select(
              "email, account_type, full_name, first_name, onboarding_completed, suspended_at, deletion_requested_at, is_admin, profile_completion_emails_enabled, email_unsubscribe_token",
            )
            .eq("id", claim.profile_id)
            .maybeSingle<ReminderProfile>(),
          supabase
            .from("profile_photos")
            .select("id", { count: "exact", head: true })
            .eq("profile_id", claim.profile_id),
        ]);

      if (profileError) throw new Error(profileError.message);
      if (photoResult.error) throw new Error(photoResult.error.message);

      if (!isEligibleProfile(profile) || (photoResult.count ?? 0) > 0) {
        await completeClaim(
          supabase,
          claim,
          "suppressed",
          now.toISOString(),
        );
        suppressed += 1;
        continue;
      }

      const { data: authUser, error: authError } =
        await supabase.auth.admin.getUserById(claim.profile_id);

      if (authError) {
        console.warn("Could not load profile completion reminder auth email.", {
          message: authError.message,
          profileId: claim.profile_id,
        });
      }

      const email = authUser?.user?.email?.trim() || profile?.email?.trim();

      if (!email || !profile) {
        await completeClaim(
          supabase,
          claim,
          "suppressed",
          now.toISOString(),
        );
        suppressed += 1;
        continue;
      }

      const result = await sendProfileCompletionReminderEmail({
        accountType: profile.account_type as ProfileCompletionReminderAccountType,
        deliveryId: claim.delivery_id,
        email,
        firstName: getFirstName(profile),
        unsubscribeToken: profile.email_unsubscribe_token as string,
      });

      if (!result.sent) {
        await releaseClaim(supabase, claim);
        retryableFailures += 1;
        continue;
      }

      providerAcceptedEmail = true;
      await completeClaim(supabase, claim, "sent", now.toISOString());
      sent += 1;
    } catch (error) {
      if (!providerAcceptedEmail) {
        await releaseClaim(supabase, claim);
      }

      retryableFailures += 1;
      console.error("Failed to send profile completion reminder email.", {
        message: error instanceof Error ? error.message : String(error),
        profileId: claim.profile_id,
      });
    }
  }

  return {
    checked: claims.length,
    sent,
    suppressed,
    retryableFailures,
  };
}
