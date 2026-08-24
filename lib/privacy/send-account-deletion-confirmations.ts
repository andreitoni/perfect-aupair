import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAccountDeletionRequestedEmail } from "@/lib/email/account-deletion";

const CONFIRMATION_EMAIL_CLAIM_TIMEOUT_MS = 15 * 60 * 1000;

type PendingConfirmationRequest = {
  id: string;
  profile_id: string;
  email: string | null;
};

type SendPendingConfirmationParams = {
  supabase: SupabaseClient;
  profileId: string;
  fallbackEmail?: string | null;
  now?: Date;
};

async function releaseConfirmationClaim(
  supabase: SupabaseClient,
  requestId: string,
  claimedAt: string,
) {
  const { error } = await supabase
    .from("account_deletion_requests")
    .update({ confirmation_email_sending_at: null })
    .eq("id", requestId)
    .eq("status", "pending")
    .eq("confirmation_email_sending_at", claimedAt)
    .is("confirmation_email_sent_at", null);

  if (error) {
    console.error(
      "Could not release account deletion confirmation email claim.",
      error.message,
    );
  }
}

async function resolveCurrentAuthEmail(
  supabase: SupabaseClient,
  profileId: string,
  fallbackEmail?: string | null,
) {
  const { data, error } = await supabase.auth.admin.getUserById(profileId);

  if (error) {
    console.warn(
      "Could not load current account deletion confirmation email.",
      error.message,
    );
  }

  return data?.user?.email?.trim() || fallbackEmail?.trim() || null;
}

export async function sendPendingAccountDeletionConfirmation({
  supabase,
  profileId,
  fallbackEmail = null,
  now = new Date(),
}: SendPendingConfirmationParams) {
  const claimedAt = now.toISOString();
  const staleClaimCutoff = new Date(
    now.getTime() - CONFIRMATION_EMAIL_CLAIM_TIMEOUT_MS,
  ).toISOString();
  const { data: request, error: claimError } = await supabase
    .from("account_deletion_requests")
    .update({ confirmation_email_sending_at: claimedAt })
    .eq("profile_id", profileId)
    .eq("status", "pending")
    .is("confirmation_email_sent_at", null)
    .or(
      `confirmation_email_sending_at.is.null,confirmation_email_sending_at.lte.${staleClaimCutoff}`,
    )
    .select("id, profile_id, email")
    .maybeSingle<PendingConfirmationRequest>();

  if (claimError) {
    throw new Error(claimError.message);
  }

  if (!request) {
    return { attempted: false, sent: false };
  }

  let providerAcceptedEmail = false;

  try {
    const email = await resolveCurrentAuthEmail(
      supabase,
      profileId,
      fallbackEmail ?? request.email,
    );

    if (!email) {
      await releaseConfirmationClaim(supabase, request.id, claimedAt);
      return { attempted: true, sent: false };
    }

    const result = await sendAccountDeletionRequestedEmail(
      email,
      `account-deletion-requested/${request.id}`,
    );

    if (!result.sent) {
      await releaseConfirmationClaim(supabase, request.id, claimedAt);
      return { attempted: true, sent: false };
    }

    providerAcceptedEmail = true;
    const { error: completionError } = await supabase
      .from("account_deletion_requests")
      .update({
        confirmation_email_sent_at: claimedAt,
        confirmation_email_sending_at: null,
      })
      .eq("id", request.id)
      .eq("status", "pending")
      .eq("confirmation_email_sending_at", claimedAt);

    if (completionError) {
      throw new Error(completionError.message);
    }

    return { attempted: true, sent: true };
  } catch (error) {
    if (!providerAcceptedEmail) {
      await releaseConfirmationClaim(supabase, request.id, claimedAt);
    }

    throw error;
  }
}

export async function sendPendingAccountDeletionConfirmations({
  supabase,
  batchSize = 25,
  now = new Date(),
}: {
  supabase: SupabaseClient;
  batchSize?: number;
  now?: Date;
}) {
  const safeBatchSize = Math.max(1, Math.min(batchSize, 100));
  const { data, error } = await supabase
    .from("account_deletion_requests")
    .select("profile_id")
    .eq("status", "pending")
    .is("confirmation_email_sent_at", null)
    .order("requested_at", { ascending: true })
    .limit(safeBatchSize);

  if (error) {
    throw new Error(error.message);
  }

  let attempted = 0;
  let sent = 0;
  let failed = 0;

  for (const request of data ?? []) {
    try {
      const result = await sendPendingAccountDeletionConfirmation({
        supabase,
        profileId: String(request.profile_id),
        now,
      });

      if (result.attempted) attempted += 1;
      if (result.sent) sent += 1;
    } catch (error) {
      failed += 1;
      console.error("Failed to send account deletion confirmation email.", error);
    }
  }

  return { checked: data?.length ?? 0, attempted, sent, failed };
}
