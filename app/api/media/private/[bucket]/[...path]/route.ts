import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";

import { isAdminEmail } from "@/lib/admin/access";
import {
  MESSAGE_AUDIO_BUCKET,
  MESSAGE_PHOTOS_BUCKET,
  MESSAGE_VIDEOS_BUCKET,
  PROFILE_STORIES_BUCKET,
  PROFILE_VIDEOS_BUCKET,
  VERIFICATION_SELFIES_BUCKET,
} from "@/lib/images/storage";
import {
  MESSAGE_PHOTO_PREVIEW_WIDTH,
  STORY_PHOTO_PREVIEW_WIDTH,
  STORY_PHOTO_VIEW_WIDTH,
} from "@/lib/images/optimization";
import { fetchUpstreamWithResponseTimeout } from "@/lib/media/fetch-upstream";
import { getRequestSecurityIdentifiers } from "@/lib/security/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseSessionCookie } from "@/lib/supabase/has-session-cookie";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,199}$/i;
const PRIVATE_IMAGE_CACHE_CONTROL =
  "private, no-cache, max-age=0, must-revalidate";
const PRIVATE_IMAGE_ETAG_VERSION = "v1";
const ALLOWED_BUCKETS = new Set([
  PROFILE_STORIES_BUCKET,
  PROFILE_VIDEOS_BUCKET,
  MESSAGE_PHOTOS_BUCKET,
  MESSAGE_VIDEOS_BUCKET,
  MESSAGE_AUDIO_BUCKET,
  VERIFICATION_SELFIES_BUCKET,
]);

function mediaDeliveryDisabledByEnv() {
  const value = process.env.FEATURE_PRIVATE_MEDIA_DELIVERY_ENABLED
    ?.trim()
    .toLowerCase();

  return value === "false" || value === "0";
}

type MediaAccessRow = {
  allowed: boolean;
  retry_after_seconds: number | null;
  storage_path: string | null;
  object_size_bytes: number | null;
  charged_bytes: number | null;
};

type ParsedRange = {
  start: number | null;
  end: number | null;
  suffix: number | null;
};

function privateJson(
  status: number,
  error: string,
  extraHeaders?: Record<string, string>,
) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        ...extraHeaders,
      },
    },
  );
}

function parseRangeHeader(value: string | null): ParsedRange | null {
  if (!value) {
    return { start: null, end: null, suffix: null };
  }

  const match = /^bytes=(?:(\d{1,15})-(\d{0,15})|-(\d{1,15}))$/.exec(
    value,
  );

  if (!match) {
    return null;
  }

  const suffix = match[3] ? Number(match[3]) : null;
  const start = match[1] ? Number(match[1]) : null;
  const end = match[2] ? Number(match[2]) : null;

  if (
    (start !== null && !Number.isSafeInteger(start)) ||
    (suffix !== null && (!Number.isSafeInteger(suffix) || suffix <= 0)) ||
    (end !== null &&
      (!Number.isSafeInteger(end) || start === null || end < start))
  ) {
    return null;
  }

  return { start, end, suffix };
}

function getPrivateImageTransformWidth(
  request: NextRequest,
  bucket: string,
) {
  const rawWidth = request.nextUrl.searchParams.get("width");

  if (
    bucket === MESSAGE_PHOTOS_BUCKET &&
    rawWidth === String(MESSAGE_PHOTO_PREVIEW_WIDTH)
  ) {
    return MESSAGE_PHOTO_PREVIEW_WIDTH;
  }

  if (
    bucket === PROFILE_STORIES_BUCKET &&
    (rawWidth === String(STORY_PHOTO_PREVIEW_WIDTH) ||
      rawWidth === String(STORY_PHOTO_VIEW_WIDTH))
  ) {
    return Number(rawWidth);
  }

  return null;
}

function getPrivateImageEtag(
  bucket: string,
  storagePath: string,
  width: number | null,
) {
  const digest = createHash("sha256")
    .update(
      `${PRIVATE_IMAGE_ETAG_VERSION}\0${bucket}\0${storagePath}\0${width ?? "original"}`,
    )
    .digest("base64url")
    .slice(0, 32);

  return `W/"pa-private-${PRIVATE_IMAGE_ETAG_VERSION}-${digest}"`;
}

function requestMatchesEtag(request: NextRequest, etag: string) {
  const ifNoneMatch = request.headers.get("if-none-match");

  if (!ifNoneMatch) return false;

  const normalizedEtag = etag.replace(/^W\//, "");

  return ifNoneMatch.split(",").some((candidate) => {
    const normalizedCandidate = candidate.trim().replace(/^W\//, "");

    return normalizedCandidate === "*" || normalizedCandidate === normalizedEtag;
  });
}

function setPrivateImageResponseHeaders(
  response: NextResponse,
  etag: string,
) {
  response.headers.set("Cache-Control", PRIVATE_IMAGE_CACHE_CONTROL);
  response.headers.set("Cross-Origin-Resource-Policy", "same-site");
  response.headers.set("ETag", etag);
  response.headers.set("X-Content-Type-Options", "nosniff");

  return response;
}

export function HEAD() {
  return new NextResponse(null, {
    status: 405,
    headers: {
      Allow: "GET",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ bucket: string; path: string[] }> },
) {
  const { bucket, path: segments } = await params;
  const ownerOrConversationId = segments?.[0] ?? "";
  const fileName = segments?.[1] ?? "";
  const requestedRange = request.headers.get("range");
  const parsedRange = parseRangeHeader(requestedRange);
  const privateImageTransformWidth = getPrivateImageTransformWidth(
    request,
    bucket,
  );

  if (
    !ALLOWED_BUCKETS.has(bucket) ||
    segments?.length !== 2 ||
    !UUID_PATTERN.test(ownerOrConversationId) ||
    !FILE_PATTERN.test(fileName)
  ) {
    return privateJson(404, "Not found");
  }

  if (!parsedRange) {
    return privateJson(416, "Range not satisfiable");
  }

  const requestedWidths = request.nextUrl.searchParams.getAll("width");

  if (
    requestedWidths.length > 1 ||
    (requestedWidths.length === 1 &&
      privateImageTransformWidth === null)
  ) {
    return privateJson(404, "Not found");
  }

  if (requestedRange && requestedWidths.length > 0) {
    return privateJson(416, "Range not satisfiable");
  }

  const storagePath = `${ownerOrConversationId}/${fileName}`;
  const isCacheableImageRequest =
    !requestedRange &&
    (bucket === MESSAGE_PHOTOS_BUCKET ||
      (bucket === PROFILE_STORIES_BUCKET &&
        privateImageTransformWidth !== null));
  const conditionalImageEtag =
    isCacheableImageRequest
      ? getPrivateImageEtag(
          bucket,
          storagePath,
          privateImageTransformWidth,
        )
      : null;
  const isMatchingConditionalImageRequest = Boolean(
    conditionalImageEtag &&
      requestMatchesEtag(request, conditionalImageEtag),
  );

  let admin: ReturnType<typeof createAdminClient>;

  try {
    admin = createAdminClient();
  } catch {
    return privateJson(503, "Media unavailable", { "Retry-After": "30" });
  }

  const identifiers = await getRequestSecurityIdentifiers();
  const { data: attemptRows, error: attemptError } = await admin.rpc(
    "reserve_media_request_attempt",
    {
      p_ip_hash: identifiers.ipHash,
      p_ip_prefix_hash: identifiers.ipPrefixHash,
    },
  );
  const attempt = (
    attemptRows as Array<{
      allowed: boolean;
      retry_after_seconds: number | null;
    }> | null
  )?.[0];

  if (attemptError || !attempt) {
    return privateJson(503, "Media unavailable", { "Retry-After": "30" });
  }

  if (!attempt.allowed) {
    return privateJson(429, "Too many media requests", {
      "Retry-After": String(Math.max(1, attempt.retry_after_seconds ?? 60)),
    });
  }

  if (!(await hasSupabaseSessionCookie())) {
    return privateJson(404, "Not found");
  }

  const { supabase, applyCookies } = await createRouteHandlerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return applyCookies(privateJson(404, "Not found"));
  }

  const isAdmin = isAdminEmail(user.email);

  if (!isAdmin && mediaDeliveryDisabledByEnv()) {
    return applyCookies(
      privateJson(503, "Media unavailable", { "Retry-After": "60" }),
    );
  }

  const { data: mediaAccessRows, error: mediaAccessError } = await admin.rpc(
    "get_private_media_access",
    {
      p_bucket_id: bucket,
      p_ip_hash: identifiers.ipHash,
      p_ip_prefix_hash: identifiers.ipPrefixHash,
      p_is_admin: isAdmin,
      // A matching conditional request transfers no body. Reserving a
      // one-byte range preserves all access/request limits without charging
      // the original image size for a 304 response.
      p_range_end: isMatchingConditionalImageRequest ? 0 : parsedRange.end,
      p_range_start: isMatchingConditionalImageRequest ? 0 : parsedRange.start,
      p_range_suffix: isMatchingConditionalImageRequest
        ? null
        : parsedRange.suffix,
      p_storage_path: storagePath,
      p_viewer_id: user.id,
    },
  );
  const mediaAccess = (mediaAccessRows as MediaAccessRow[] | null)?.[0];

  if (mediaAccessError) {
    console.error("Private media access check failed.", {
      bucket,
      message: mediaAccessError.message,
    });
    return applyCookies(
      privateJson(503, "Media unavailable", { "Retry-After": "30" }),
    );
  }

  if (mediaAccess && !mediaAccess.allowed) {
    if (mediaAccess.retry_after_seconds === -1) {
      const objectSize = mediaAccess.object_size_bytes;

      return applyCookies(
        privateJson(
          416,
          "Range not satisfiable",
          objectSize && objectSize > 0
            ? { "Content-Range": `bytes */${objectSize}` }
            : undefined,
        ),
      );
    }

    const retryAfter = Math.max(1, mediaAccess.retry_after_seconds ?? 60);
    return applyCookies(
      privateJson(429, "Too many media requests", {
        "Retry-After": String(retryAfter),
      }),
    );
  }

  const resolvedStoragePath = mediaAccess?.storage_path;

  if (!resolvedStoragePath) {
    return applyCookies(privateJson(404, "Not found"));
  }

  const authorizedStoragePath = resolvedStoragePath;
  const requestedImageEtag =
    isCacheableImageRequest
      ? getPrivateImageEtag(
          bucket,
          authorizedStoragePath,
          privateImageTransformWidth,
        )
      : null;

  if (
    requestedImageEtag &&
    requestMatchesEtag(request, requestedImageEtag)
  ) {
    return applyCookies(
      setPrivateImageResponseHeaders(
        new NextResponse(null, { status: 304 }),
        requestedImageEtag,
      ),
    );
  }

  const upstreamHeaders = new Headers();

  if (requestedRange) {
    upstreamHeaders.set("Range", requestedRange);
  }

  async function fetchMedia(width: number | null) {
    const { data: signedMedia, error: signedMediaError } = await admin.storage
      .from(bucket)
      .createSignedUrl(
        authorizedStoragePath,
        60,
        width
          ? {
              transform: {
                width,
                resize: "contain",
                quality: bucket === MESSAGE_PHOTOS_BUCKET ? 80 : 72,
              },
            }
          : undefined,
      );

    if (signedMediaError || !signedMedia?.signedUrl) return null;

    return fetchUpstreamWithResponseTimeout(
      signedMedia.signedUrl,
      {
        cache: "no-store",
        headers: upstreamHeaders,
        redirect: "error",
      },
      120_000,
    );
  }

  let upstreamResponse: Response | null = null;
  let servedImageTransformWidth: number | null = null;

  try {
    if (privateImageTransformWidth) {
      const transformedResponse = await fetchMedia(privateImageTransformWidth);

      if (transformedResponse?.status === 200 && transformedResponse.body) {
        upstreamResponse = transformedResponse;
        servedImageTransformWidth = privateImageTransformWidth;
      } else {
        await transformedResponse?.body?.cancel();
      }
    }

    // Image transformations depend on the active Supabase plan. Keep private
    // images available if that upstream capability is disabled.
    upstreamResponse ??= await fetchMedia(null);
  } catch (error) {
    console.error("Private media delivery failed.", {
      bucket,
      message: error instanceof Error ? error.message : String(error),
    });
    return applyCookies(
      privateJson(503, "Media unavailable", { "Retry-After": "30" }),
    );
  }

  if (!upstreamResponse) {
    return applyCookies(privateJson(404, "Not found"));
  }

  const expectedUpstreamStatus = requestedRange ? 206 : 200;
  const contentLength = Number(
    upstreamResponse.headers.get("content-length") ?? Number.NaN,
  );
  const contentRange = upstreamResponse.headers.get("content-range");
  const contentRangeMatch = contentRange
    ? /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange)
    : null;
  const rangedByteLength = contentRangeMatch
    ? Number(contentRangeMatch[2]) - Number(contentRangeMatch[1]) + 1
    : null;
  const chargedBytes = mediaAccess.charged_bytes ?? 0;
  const invalidRangeResponse = Boolean(
    requestedRange &&
      (!contentRangeMatch ||
        rangedByteLength === null ||
        rangedByteLength <= 0 ||
        rangedByteLength > chargedBytes ||
        (Number.isFinite(contentLength) && contentLength > chargedBytes)),
  );

  if (
    upstreamResponse.status !== expectedUpstreamStatus ||
    !upstreamResponse.body ||
    invalidRangeResponse
  ) {
    await upstreamResponse.body?.cancel();

    if (upstreamResponse.status === 404) {
      return applyCookies(privateJson(404, "Not found"));
    }

    return applyCookies(
      privateJson(503, "Media unavailable", { "Retry-After": "30" }),
    );
  }

  const response = new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
  });

  for (const headerName of [
    "accept-ranges",
    "content-length",
    "content-range",
    "content-type",
    "etag",
    "last-modified",
  ]) {
    const headerValue = upstreamResponse.headers.get(headerName);

    if (headerValue) {
      response.headers.set(headerName, headerValue);
    }
  }

  if (isCacheableImageRequest) {
    setPrivateImageResponseHeaders(
      response,
      getPrivateImageEtag(
        bucket,
        authorizedStoragePath,
        servedImageTransformWidth,
      ),
    );
  } else {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Cross-Origin-Resource-Policy", "same-site");
    response.headers.set("X-Content-Type-Options", "nosniff");
  }

  return applyCookies(response);
}
