import { NextResponse, type NextRequest } from "next/server";
import { runMonitoredCronJob } from "@/lib/monitoring/cron";
import { cleanupRetainedMessagePhotos } from "@/lib/messages/cleanup-retained-message-photos";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return cleanupRetainedPhotos(request);
}

export async function POST(request: NextRequest) {
  return cleanupRetainedPhotos(request);
}

async function cleanupRetainedPhotos(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runMonitoredCronJob(
      "cleanup-retained-message-photos",
      async () => {
        const supabase = createAdminClient();
        const now = new Date();
        let deletedRows = 0;
        let removedFiles = 0;
        let deletedPhotoRows = 0;
        let deletedVideoRows = 0;
        let deletedAudioRows = 0;
        let hasMore = false;
        let batches = 0;

        do {
          const batch = await cleanupRetainedMessagePhotos({
            supabase,
            batchSize: 500,
            now,
          });

          deletedRows += batch.deletedRows;
          removedFiles += batch.removedFiles;
          deletedPhotoRows += batch.deletedPhotoRows;
          deletedVideoRows += batch.deletedVideoRows;
          deletedAudioRows += batch.deletedAudioRows;
          hasMore = batch.hasMore;
          batches += 1;
        } while (hasMore && batches < 5);

        if (hasMore) {
          throw new Error(
            "Retained message media cleanup backlog remains after the maximum batch budget.",
          );
        }

        return {
          cutoff: now.toISOString(),
          batches,
          deletedRows,
          removedFiles,
          deletedPhotoRows,
          deletedVideoRows,
          deletedAudioRows,
          hasMore,
        };
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Could not clean up retained message photos", error);

    return NextResponse.json(
      { error: "Could not clean up retained message photos." },
      { status: 500 },
    );
  }
}

function isAuthorized(request: NextRequest) {
  const secret =
    process.env.MESSAGE_PHOTO_RETENTION_CLEANUP_SECRET ?? process.env.CRON_SECRET;

  if (!secret) {
    return false;
  }

  return (
    request.headers.get("authorization") === `Bearer ${secret}` ||
    request.headers.get("x-maintenance-secret") === secret
  );
}
