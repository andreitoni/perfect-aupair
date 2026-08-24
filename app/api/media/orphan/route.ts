import { NextResponse, type NextRequest } from "next/server";

import {
  MESSAGE_AUDIO_BUCKET,
  MESSAGE_PHOTOS_BUCKET,
  MESSAGE_VIDEOS_BUCKET,
  PROFILE_PHOTOS_BUCKET,
  PROFILE_STORIES_BUCKET,
  PROFILE_VIDEOS_BUCKET,
  VERIFICATION_SELFIES_BUCKET,
} from "@/lib/images/storage";
import {
  recordSecurityRequest,
  type SecurityRateLimitAction,
} from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_BUCKETS = new Set([
  PROFILE_PHOTOS_BUCKET,
  PROFILE_STORIES_BUCKET,
  PROFILE_VIDEOS_BUCKET,
  MESSAGE_PHOTOS_BUCKET,
  MESSAGE_VIDEOS_BUCKET,
  MESSAGE_AUDIO_BUCKET,
  VERIFICATION_SELFIES_BUCKET,
]);
const STORAGE_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z0-9][a-z0-9._-]{0,199}$/i;

function json(status: number, error?: string) {
  return NextResponse.json(
    error ? { error } : { deleted: true },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function rateLimitAction(bucket: string): SecurityRateLimitAction {
  if (bucket === PROFILE_STORIES_BUCKET) return "story_upload";
  if (bucket === PROFILE_VIDEOS_BUCKET) return "profile_video_upload";
  if (
    bucket === MESSAGE_PHOTOS_BUCKET ||
    bucket === MESSAGE_VIDEOS_BUCKET ||
    bucket === MESSAGE_AUDIO_BUCKET
  ) {
    return "message_media_upload";
  }

  return "profile_photo_upload";
}

function isSameOrigin(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site");

  if (fetchSite === "cross-site") {
    return false;
  }

  const origin = request.headers.get("origin");

  if (!origin) return true;

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

async function readLimitedBody(request: NextRequest, maxBytes: number) {
  const reader = request.body?.getReader();

  if (!reader) {
    return "";
  }

  const decoder = new TextDecoder();
  let bytesRead = 0;
  let body = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      return body + decoder.decode();
    }

    bytesRead += value.byteLength;

    if (bytesRead > maxBytes) {
      await reader.cancel();
      return null;
    }

    body += decoder.decode(value, { stream: true });
  }
}

export async function DELETE(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (
    !isSameOrigin(request) ||
    !Number.isFinite(contentLength) ||
    contentLength > 2_048
  ) {
    return json(400, "Invalid request");
  }

  let parsedBody: unknown;

  try {
    const rawBody = await readLimitedBody(request, 2_048);

    if (!rawBody) {
      return json(400, "Invalid request");
    }

    parsedBody = JSON.parse(rawBody);
  } catch {
    return json(400, "Invalid request");
  }

  if (
    !parsedBody ||
    typeof parsedBody !== "object" ||
    Array.isArray(parsedBody)
  ) {
    return json(400, "Invalid request");
  }

  const body = parsedBody as { bucket?: unknown; path?: unknown };

  const bucket = typeof body.bucket === "string" ? body.bucket : "";
  const storagePath = typeof body.path === "string" ? body.path : "";

  if (!ALLOWED_BUCKETS.has(bucket) || !STORAGE_PATH_PATTERN.test(storagePath)) {
    return json(404, "Media not found");
  }

  const { supabase, applyCookies } = await createRouteHandlerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return applyCookies(json(401, "Authentication required"));
  }

  const decision = await recordSecurityRequest({
    action: rateLimitAction(bucket),
    subject: user.id,
  });

  if (!decision.allowed) {
    const response = json(429, "Too many media requests");
    response.headers.set(
      "Retry-After",
      String(Math.max(1, decision.retryAfterSeconds || 60)),
    );
    return applyCookies(response);
  }

  let admin: ReturnType<typeof createAdminClient>;

  try {
    admin = createAdminClient();
  } catch {
    return applyCookies(json(503, "Media deletion unavailable"));
  }

  const { data: claimToken, error: claimError } = await admin.rpc(
    "claim_orphan_media_deletion",
    {
      p_bucket_id: bucket,
      p_storage_path: storagePath,
      p_uploader_id: user.id,
    },
  );

  if (claimError) {
    console.error("Could not claim orphan media deletion.", {
      bucket,
      message: claimError.message,
    });
    return applyCookies(json(503, "Media deletion unavailable"));
  }

  if (typeof claimToken !== "string") {
    return applyCookies(json(409, "Media is still in use or unavailable"));
  }

  const { error: storageError } = await admin.storage
    .from(bucket)
    .remove([storagePath]);

  if (storageError) {
    // Keep the claim queued. The protected maintenance cleanup retries it.
    console.error("Could not delete claimed orphan media.", {
      bucket,
      message: storageError.message,
    });
    return applyCookies(json(503, "Media deletion unavailable"));
  }

  const { data: completed, error: completionError } = await admin.rpc(
    "complete_orphan_media_deletion",
    {
      p_bucket_id: bucket,
      p_claim_token: claimToken,
      p_storage_path: storagePath,
      p_succeeded: true,
      p_uploader_id: user.id,
    },
  );

  if (completionError || completed !== true) {
    console.error("Could not complete orphan media deletion claim.", {
      bucket,
      message: completionError?.message ?? "Claim was no longer active.",
    });
    return applyCookies(json(503, "Media deletion unavailable"));
  }

  return applyCookies(json(200));
}
