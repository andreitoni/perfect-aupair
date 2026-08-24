import type { SupabaseClient } from "@supabase/supabase-js";

type PendingMediaDeletion = {
  bucket_id: string;
  object_name: string;
  uploader_id: string;
};

type CleanupOrphanedMediaParams = {
  supabase: SupabaseClient;
  batchSize?: number;
  now?: Date;
};

type OrphanSweepResult = {
  queued?: unknown;
  scanned?: unknown;
};

const STALE_MEDIA_CLAIM_MS = 5 * 60 * 1_000;

export async function cleanupOrphanedMedia({
  supabase,
  batchSize = 100,
  now = new Date(),
}: CleanupOrphanedMediaParams) {
  const safeBatchSize = Math.max(1, Math.min(batchSize, 500));
  const staleClaimCutoff = new Date(
    now.getTime() - STALE_MEDIA_CLAIM_MS,
  ).toISOString();
  const { data: queuedUploads, error: queueError } = await supabase.rpc(
    "queue_stale_orphaned_media_uploads",
    { p_batch_size: safeBatchSize },
  );

  if (queueError) {
    throw new Error(queueError.message);
  }

  const { data, error: selectError } = await supabase
    .from("storage_upload_usage_events")
    .select("bucket_id, object_name, uploader_id")
    .is("deleted_at", null)
    .not("deletion_claim_token", "is", null)
    .lte("deletion_claimed_at", staleClaimCutoff)
    .order("deletion_claimed_at", { ascending: true })
    .limit(safeBatchSize);

  if (selectError) {
    throw new Error(selectError.message);
  }

  const pending = (data ?? []) as PendingMediaDeletion[];
  const outcomes: Array<"deleted" | "failed" | "skipped"> = [];

  async function processMedia(media: PendingMediaDeletion) {
    const { data: claimToken, error: claimError } = await supabase.rpc(
      "claim_orphan_media_deletion",
      {
        p_bucket_id: media.bucket_id,
        p_storage_path: media.object_name,
        p_uploader_id: media.uploader_id,
      },
    );

    if (claimError) {
      console.error("Could not claim queued orphan media.", {
        bucket: media.bucket_id,
        message: claimError.message,
      });
      return "failed" as const;
    }

    if (typeof claimToken !== "string") {
      return "skipped" as const;
    }

    const { error: storageError } = await supabase.storage
      .from(media.bucket_id)
      .remove([media.object_name]);

    if (storageError) {
      console.error("Could not delete queued orphan media.", {
        bucket: media.bucket_id,
        message: storageError.message,
      });
      return "failed" as const;
    }

    const { data: completed, error: completionError } = await supabase.rpc(
      "complete_orphan_media_deletion",
      {
        p_bucket_id: media.bucket_id,
        p_claim_token: claimToken,
        p_storage_path: media.object_name,
        p_succeeded: true,
        p_uploader_id: media.uploader_id,
      },
    );

    if (completionError || completed !== true) {
      console.error("Could not finalize queued orphan media deletion.", {
        bucket: media.bucket_id,
        message: completionError?.message ?? "Claim was no longer active.",
      });
      return "failed" as const;
    }

    return "deleted" as const;
  }

  for (let index = 0; index < pending.length; index += 5) {
    outcomes.push(
      ...(await Promise.all(pending.slice(index, index + 5).map(processMedia))),
    );
  }

  const sweep = (queuedUploads ?? {}) as OrphanSweepResult;
  const queuedCount = Number(sweep.queued) || 0;
  const scannedCount = Number(sweep.scanned) || 0;
  const deletedFiles = outcomes.filter((outcome) => outcome === "deleted").length;
  const failedFiles = outcomes.filter((outcome) => outcome === "failed").length;
  const skippedFiles = outcomes.filter((outcome) => outcome === "skipped").length;

  return {
    cutoff: now.toISOString(),
    queuedUploads: queuedCount,
    scannedUploads: scannedCount,
    processedFiles: pending.length,
    deletedFiles,
    failedFiles,
    skippedFiles,
    scanHasMore: scannedCount >= safeBatchSize,
    deletionHasMore: pending.length >= safeBatchSize,
    hasMore:
      scannedCount >= safeBatchSize || pending.length >= safeBatchSize,
  };
}
