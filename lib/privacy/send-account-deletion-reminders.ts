import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAccountDeletionReminderEmail } from "@/lib/email/account-deletion";

type AccountDeletionReminderRequest = {
  claim_token: string;
  id: string;
  profile_id: string;
  email: string | null;
  scheduled_delete_at: string;
};

type SendAccountDeletionReminderEmailsParams = {
  supabase: SupabaseClient;
  batchSize?: number;
  now?: Date;
};

async function getReminderEmail(
  supabase: SupabaseClient,
  request: AccountDeletionReminderRequest,
) {
  const { data, error } = await supabase.auth.admin.getUserById(
    request.profile_id,
  );

  if (error) {
    console.warn("Could not load account deletion reminder email.", error.message);
  }

  return data?.user?.email?.trim() || request.email?.trim() || null;
}

export async function sendAccountDeletionReminderEmails({
  supabase,
  batchSize = 50,
  now = new Date(),
}: SendAccountDeletionReminderEmailsParams) {
  const safeBatchSize = Math.max(1, Math.min(batchSize, 100));

  const { data, error } = await supabase.rpc(
    "claim_account_deletion_reminders",
    {
      p_batch_size: safeBatchSize,
      p_now: now.toISOString(),
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  const requests = ((data ?? []) as AccountDeletionReminderRequest[]).filter(
    (request) => request.id && request.profile_id && request.claim_token,
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const request of requests) {
    try {
      const email = await getReminderEmail(supabase, request);

      if (!email) {
        const { error: releaseError } = await supabase.rpc(
          "release_account_deletion_reminder_claim",
          {
            p_claim_token: request.claim_token,
            p_request_id: request.id,
          },
        );

        if (releaseError) {
          throw new Error(releaseError.message);
        }

        skipped += 1;
        continue;
      }

      const result = await sendAccountDeletionReminderEmail(
        email,
        `account-deletion-reminder/${request.id}`,
      );

      if (!result.sent) {
        const { error: releaseError } = await supabase.rpc(
          "release_account_deletion_reminder_claim",
          {
            p_claim_token: request.claim_token,
            p_request_id: request.id,
          },
        );

        if (releaseError) {
          throw new Error(releaseError.message);
        }

        skipped += 1;
        continue;
      }

      const { error: updateError } = await supabase.rpc(
        "complete_account_deletion_reminder",
        {
          p_claim_token: request.claim_token,
          p_request_id: request.id,
          p_sent_at: now.toISOString(),
        },
      );

      if (updateError) {
        throw new Error(updateError.message);
      }

      sent += 1;
    } catch (error) {
      const { error: releaseError } = await supabase.rpc(
        "release_account_deletion_reminder_claim",
        {
          p_claim_token: request.claim_token,
          p_request_id: request.id,
        },
      );

      if (releaseError) {
        console.error(
          "Failed to release account deletion reminder claim.",
          releaseError.message,
        );
      }

      failed += 1;
      console.error("Failed to send account deletion reminder email.", error);
    }
  }

  return {
    checked: requests.length,
    sent,
    skipped,
    failed,
  };
}
