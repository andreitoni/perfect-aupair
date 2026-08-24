import { NextResponse, type NextRequest } from "next/server";
import { cleanupOrphanedMedia } from "@/lib/images/cleanup-orphaned-media";
import { runMonitoredCronJob } from "@/lib/monitoring/cron";
import { cleanupExpiredProfileStories } from "@/lib/stories/cleanup-expired-profile-stories";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return cleanupExpiredStories(request);
}

export async function POST(request: NextRequest) {
  return cleanupExpiredStories(request);
}

async function cleanupExpiredStories(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runMonitoredCronJob(
      "cleanup-expired-stories",
      async () => {
        const supabase = createAdminClient();
        const now = new Date();
        let deletedStories = 0;
        let removedFiles = 0;
        let hasMore = false;
        let batches = 0;

        do {
          const batch = await cleanupExpiredProfileStories({
            supabase,
            batchSize: 500,
            now,
          });

          deletedStories += batch.deletedStories;
          removedFiles += batch.removedFiles;
          hasMore = batch.hasMore;
          batches += 1;
        } while (hasMore && batches < 5);

        if (hasMore) {
          throw new Error(
            "Expired story cleanup backlog remains after the maximum batch budget.",
          );
        }

        let orphanBatches = 0;
        let queuedOrphanUploads = 0;
        let scannedOrphanUploads = 0;
        let processedOrphanFiles = 0;
        let deletedOrphanFiles = 0;
        let failedOrphanFiles = 0;
        let skippedOrphanFiles = 0;
        let orphanBacklog = false;
        let orphanDeletionBacklog = false;

        do {
          const orphanBatch = await cleanupOrphanedMedia({
            supabase,
            batchSize: 50,
            now,
          });

          queuedOrphanUploads += orphanBatch.queuedUploads;
          scannedOrphanUploads += orphanBatch.scannedUploads;
          processedOrphanFiles += orphanBatch.processedFiles;
          deletedOrphanFiles += orphanBatch.deletedFiles;
          failedOrphanFiles += orphanBatch.failedFiles;
          skippedOrphanFiles += orphanBatch.skippedFiles;
          orphanBacklog = orphanBatch.hasMore;
          orphanDeletionBacklog = orphanBatch.deletionHasMore;
          orphanBatches += 1;
        } while (orphanBacklog && orphanBatches < 5);

        if (failedOrphanFiles > 0 || orphanDeletionBacklog) {
          throw new Error(
            failedOrphanFiles > 0
              ? "Orphan media cleanup could not remove every claimed object."
              : "Orphan media deletion backlog remains after the maximum batch budget.",
          );
        }

        const {
          data: prunedMediaRateCounters,
          error: mediaCounterCleanupError,
        } = await supabase.rpc("cleanup_profile_media_delivery_counters");

        if (mediaCounterCleanupError) {
          throw new Error(mediaCounterCleanupError.message);
        }

        const {
          data: prunedPrivateMediaCounters,
          error: privateMediaCounterCleanupError,
        } = await supabase.rpc("cleanup_private_media_delivery_counters");

        if (privateMediaCounterCleanupError) {
          throw new Error(privateMediaCounterCleanupError.message);
        }

        return {
          cutoff: now.toISOString(),
          batches,
          deletedStories,
          removedFiles,
          hasMore,
          orphanBatches,
          queuedOrphanUploads,
          scannedOrphanUploads,
          processedOrphanFiles,
          deletedOrphanFiles,
          failedOrphanFiles,
          skippedOrphanFiles,
          orphanBacklog,
          orphanDeletionBacklog,
          prunedMediaRateCounters: prunedMediaRateCounters ?? 0,
          prunedPrivateMediaCounters: prunedPrivateMediaCounters ?? 0,
        };
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Could not clean up expired profile stories", error);

    return NextResponse.json(
      { error: "Could not clean up expired stories." },
      { status: 500 },
    );
  }
}

function isAuthorized(request: NextRequest) {
  const secret = process.env.STORY_CLEANUP_SECRET ?? process.env.CRON_SECRET;

  if (!secret) {
    return false;
  }

  return (
    request.headers.get("authorization") === `Bearer ${secret}` ||
    request.headers.get("x-maintenance-secret") === secret
  );
}
