import type { SupabaseClient } from "@supabase/supabase-js";
import {
  drainMessageDigestBatches,
  type MessageDigestBatchResult,
} from "@/lib/email/message-digest-drain";
import { sendUnreadMessageDigestEmail } from "@/lib/email/profile-notifications";

type ClaimedMessageDigest = {
  claim_token: string;
  delivery_id: string;
  latest_message_at: string;
  recipient_id: string;
  unread_conversation_count: number;
  unread_message_count: number;
};

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_MAX_BATCHES = 10;
// Vercel Hobby allows 300 seconds. Keep 60 seconds for route/monitor overhead,
// and reserve enough time for ten emails with two 8-second Resend attempts.
const DEFAULT_TIME_BUDGET_MS = 240_000;
const DEFAULT_MINIMUM_BATCH_BUDGET_MS = 180_000;

async function sendMessageDigestBatch({
  supabase,
  batchSize,
  now = new Date(),
}: {
  supabase: SupabaseClient;
  batchSize: number;
  now?: Date;
}): Promise<MessageDigestBatchResult> {
  const safeBatchSize = Math.max(1, Math.min(batchSize, 50));
  const { data, error } = await supabase.rpc(
    "claim_message_digest_email_deliveries",
    {
      p_batch_size: safeBatchSize,
      p_now: now.toISOString(),
    },
  );

  if (error) throw new Error(error.message);

  const claims = ((data ?? []) as ClaimedMessageDigest[]).filter(
    (claim) =>
      claim.recipient_id &&
      claim.delivery_id &&
      claim.claim_token &&
      claim.latest_message_at,
  );

  let sent = 0;
  let suppressed = 0;
  let retryableFailures = 0;

  for (const claim of claims) {
    const delivery = await sendUnreadMessageDigestEmail({
      deliveryId: claim.delivery_id,
      latestMessageAt: claim.latest_message_at,
      recipientId: claim.recipient_id,
      unreadConversationCount: claim.unread_conversation_count,
      unreadMessageCount: claim.unread_message_count,
    });

    if (delivery.status === "retryable_failure") {
      const { error: releaseError } = await supabase.rpc(
        "release_message_digest_email_delivery",
        {
          p_claim_token: claim.claim_token,
          p_recipient_id: claim.recipient_id,
        },
      );

      if (releaseError) {
        console.error("Could not release message digest claim.", {
          message: releaseError.message,
          recipientId: claim.recipient_id,
        });
      }

      retryableFailures += 1;
      continue;
    }

    const outcome = delivery.status === "sent" ? "sent" : "suppressed";
    const { data: completed, error: completionError } = await supabase.rpc(
      "complete_message_digest_email_delivery",
      {
        p_claim_token: claim.claim_token,
        p_completed_at: now.toISOString(),
        p_outcome: outcome,
        p_recipient_id: claim.recipient_id,
      },
    );

    if (completionError || completed !== true) {
      throw new Error(
        completionError?.message ?? "Message digest claim expired.",
      );
    }

    if (outcome === "sent") sent += 1;
    else suppressed += 1;
  }

  return {
    checked: claims.length,
    sent,
    suppressed,
    retryableFailures,
  };
}

export async function sendPendingMessageDigests({
  supabase,
  batchSize = DEFAULT_BATCH_SIZE,
  maxBatches = DEFAULT_MAX_BATCHES,
  timeBudgetMs = DEFAULT_TIME_BUDGET_MS,
  minimumBatchBudgetMs = DEFAULT_MINIMUM_BATCH_BUDGET_MS,
  now = Date.now,
}: {
  supabase: SupabaseClient;
  batchSize?: number;
  maxBatches?: number;
  timeBudgetMs?: number;
  minimumBatchBudgetMs?: number;
  now?: () => number;
}) {
  const safeBatchSize = Math.max(1, Math.min(Math.trunc(batchSize), 50));

  return drainMessageDigestBatches({
    batchSize: safeBatchSize,
    maxBatches,
    minimumBatchBudgetMs,
    timeBudgetMs,
    now,
    runBatch: () =>
      sendMessageDigestBatch({
        supabase,
        batchSize: safeBatchSize,
        now: new Date(now()),
      }),
  });
}
