import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";

import { isAdminEmail } from "@/lib/admin/access";
import { PROFILE_PHOTOS_BUCKET } from "@/lib/images/storage";
import { fetchUpstreamWithResponseTimeout } from "@/lib/media/fetch-upstream";
import { getRequestSecurityIdentifiers } from "@/lib/security/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseSessionCookie } from "@/lib/supabase/has-session-cookie";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILE_PATTERN =
  /^[a-z0-9][a-z0-9._-]{0,199}\.(?:jpe?g|png|webp)$/i;
const PROFILE_PHOTO_TRANSFORM_WIDTHS = new Set([96, 192, 384, 640, 1200]);
const PROFILE_PHOTO_ROBOTS_HEADER = "noindex, noimageindex";
const PUBLIC_PROFILE_PHOTO_CACHE_CONTROL =
  "private, max-age=300, must-revalidate";
const AUTHENTICATED_PROFILE_PHOTO_CACHE_CONTROL =
  "private, no-cache, max-age=0, must-revalidate";
const PROFILE_PHOTO_ETAG_VERSION = "v1";

function getRequestedTransformWidth(request: NextRequest) {
  const requestedWidths = request.nextUrl.searchParams.getAll("width");

  if (requestedWidths.length !== 1) return null;

  const rawWidth = requestedWidths[0];

  if (!rawWidth || !/^\d{1,4}$/.test(rawWidth)) return null;

  const width = Number(rawWidth);
  return PROFILE_PHOTO_TRANSFORM_WIDTHS.has(width) ? width : null;
}

function getProfilePhotoTransform(width: number | null) {
  if (!width) return undefined;

  return width === 1200
    ? {
        width,
        resize: "contain" as const,
        quality: 72,
      }
    : {
        width,
        height: width,
        resize: "cover" as const,
        quality: 72,
      };
}

function isValidRangeHeader(value: string) {
  const match = /^bytes=(?:(\d{1,15})-(\d{0,15})|-(\d{1,15}))$/.exec(
    value,
  );

  if (!match) return false;

  const suffix = match[3] ? Number(match[3]) : null;
  const start = match[1] ? Number(match[1]) : null;
  const end = match[2] ? Number(match[2]) : null;

  return (
    (start === null || Number.isSafeInteger(start)) &&
    (suffix === null || (Number.isSafeInteger(suffix) && suffix > 0)) &&
    (end === null ||
      (Number.isSafeInteger(end) && start !== null && end >= start))
  );
}

function getProfilePhotoEtag(storagePath: string, width: number | null) {
  const digest = createHash("sha256")
    .update(
      `${PROFILE_PHOTO_ETAG_VERSION}\0${storagePath}\0${width ?? "original"}`,
    )
    .digest("base64url")
    .slice(0, 32);

  return `W/"pa-${PROFILE_PHOTO_ETAG_VERSION}-${digest}"`;
}

function requestMatchesEtag(request: NextRequest, etag: string) {
  const ifNoneMatch = request.headers.get("if-none-match");

  if (!ifNoneMatch) return false;

  const normalizedEtag = etag.replace(/^W\//, "");

  return ifNoneMatch
    .split(",")
    .some((candidate) => {
      const normalizedCandidate = candidate.trim().replace(/^W\//, "");

      return (
        normalizedCandidate === "*" || normalizedCandidate === normalizedEtag
      );
    });
}

function setProfilePhotoResponseHeaders(
  response: NextResponse,
  authenticated: boolean,
  etag?: string,
) {
  response.headers.set(
    "Cache-Control",
    authenticated
      ? AUTHENTICATED_PROFILE_PHOTO_CACHE_CONTROL
      : PUBLIC_PROFILE_PHOTO_CACHE_CONTROL,
  );
  response.headers.set("Cross-Origin-Resource-Policy", "same-site");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Robots-Tag", PROFILE_PHOTO_ROBOTS_HEADER);

  if (etag) {
    response.headers.set("ETag", etag);
  }

  return response;
}

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
};

function notFound(applyCookies: (response: NextResponse) => NextResponse) {
  return applyCookies(
    NextResponse.json(
      { error: "Not found" },
      {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      },
    ),
  );
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
  { params }: { params: Promise<{ path: string[] }> },
) {
  const segments = (await params).path;
  const ownerId = segments?.[0] ?? "";
  const fileName = segments?.[1] ?? "";

  if (
    segments?.length !== 2 ||
    !UUID_PATTERN.test(ownerId) ||
    !FILE_PATTERN.test(fileName)
  ) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const storagePath = `${ownerId}/${fileName}`;
  const requestedRange = request.headers.get("range");
  const requestedWidths = request.nextUrl.searchParams.getAll("width");
  const transformWidth = getRequestedTransformWidth(request);
  const acceptedImageTypes =
    request.headers.get("accept") ?? "image/avif,image/webp,image/*,*/*";

  if (requestedRange && !isValidRangeHeader(requestedRange)) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (requestedWidths.length > 0 && transformWidth === null) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  if (requestedRange && transformWidth !== null) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  }

  let admin: ReturnType<typeof createAdminClient>;
  // The stream download builder intentionally exposes only the body. Capture
  // its single fetch response so the proxy can keep the upstream status and
  // media headers without buffering the image into a Blob.
  let captureDirectStorageResponse:
    | ((response: Response) => void)
    | null = null;

  try {
    admin = createAdminClient({
      customFetch: async (input, init) => {
        const captureResponse = captureDirectStorageResponse;

        if (!captureResponse) {
          return fetch(input, init);
        }

        const headers = new Headers(init?.headers);
        headers.set("Accept", acceptedImageTypes);

        const response = await fetch(input, {
          ...init,
          headers,
          redirect: "error",
        });
        captureResponse(response);
        return response;
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Media unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
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
    return NextResponse.json(
      { error: "Media unavailable" },
      {
        status: 503,
        headers: {
          "Cache-Control": "private, no-store",
          "Retry-After": "30",
        },
      },
    );
  }

  if (!attempt.allowed) {
    return NextResponse.json(
      { error: "Too many media requests" },
      {
        status: 429,
        headers: {
          "Cache-Control": "private, no-store",
          "Retry-After": String(
            Math.max(1, attempt.retry_after_seconds ?? 60),
          ),
        },
      },
    );
  }

  const { supabase, applyCookies } = await createRouteHandlerClient();
  const user = (await hasSupabaseSessionCookie())
    ? (await supabase.auth.getUser()).data.user
    : null;
  const isAdmin = Boolean(user && isAdminEmail(user.email));

  if (!isAdmin && mediaDeliveryDisabledByEnv()) {
    return applyCookies(
      NextResponse.json(
        { error: "Media unavailable" },
        {
          status: 503,
          headers: {
            "Cache-Control": "private, no-store",
            "Retry-After": "60",
          },
        },
      ),
    );
  }
  const { data: mediaAccessRows, error: mediaAccessError } = await admin.rpc(
    "get_profile_photo_media_access",
    {
      p_ip_hash: identifiers.ipHash,
      p_ip_prefix_hash: identifiers.ipPrefixHash,
      p_is_admin: isAdmin,
      p_storage_path: storagePath,
      p_viewer_id: user?.id ?? null,
    },
  );
  const mediaAccess = (mediaAccessRows as MediaAccessRow[] | null)?.[0];

  const resolvedStoragePath = mediaAccess?.storage_path ?? null;

  if (mediaAccessError) {
    console.error("Profile media access check failed.", {
      message: mediaAccessError.message,
    });
    return applyCookies(
      NextResponse.json(
        { error: "Media unavailable" },
        {
          status: 503,
          headers: {
            "Cache-Control": "private, no-store",
            "Retry-After": "30",
          },
        },
      ),
    );
  }

  if (mediaAccess && !mediaAccess.allowed) {
    const retryAfter = Math.max(1, mediaAccess.retry_after_seconds ?? 60);

    return applyCookies(
      NextResponse.json(
        { error: "Too many media requests" },
        {
          status: 429,
          headers: {
            "Cache-Control": "private, no-store",
            "Retry-After": String(retryAfter),
          },
        },
      ),
    );
  }

  if (!resolvedStoragePath) {
    return notFound(applyCookies);
  }

  const authorizedStoragePath = resolvedStoragePath;
  const responseEtag = getProfilePhotoEtag(
    authorizedStoragePath,
    transformWidth,
  );

  if (!requestedRange && requestMatchesEtag(request, responseEtag)) {
    return applyCookies(
      setProfilePhotoResponseHeaders(
        new NextResponse(null, { status: 304 }),
        Boolean(user),
        responseEtag,
      ),
    );
  }

  const upstreamHeaders = new Headers();

  if (requestedRange) {
    upstreamHeaders.set("Range", requestedRange);
  }

  upstreamHeaders.set("Accept", acceptedImageTypes);

  async function downloadPhoto(width: number | null) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(
        new DOMException(
          "The upstream response timed out.",
          "TimeoutError",
        ),
      );
    }, 15_000);
    let directStorageResponse: Response | null = null;

    captureDirectStorageResponse = (response) => {
      directStorageResponse = response;
    };

    try {
      const transform = getProfilePhotoTransform(width);
      const { data: body, error } = await admin.storage
        .from(PROFILE_PHOTOS_BUCKET)
        .download(
          authorizedStoragePath,
          transform ? { transform } : {},
          {
            cache: "no-store",
            signal: controller.signal,
          },
        )
        .asStream();
      const response = directStorageResponse as Response | null;

      if (error || !body || !response) {
        await body?.cancel();

        return response
          ? new Response(null, {
              status: response.status,
              headers: response.headers,
            })
          : null;
      }

      return new Response(body, {
        status: response.status,
        headers: response.headers,
      });
    } finally {
      captureDirectStorageResponse = null;
      // download().asStream() resolves once the upstream headers arrive. Keep
      // the body stream alive after handing it to Next.js, matching the signed
      // URL fetch path's response-timeout behavior.
      clearTimeout(timeoutId);
    }
  }

  async function fetchPhoto(width: number | null) {
    if (!requestedRange) {
      return downloadPhoto(width);
    }

    const transform = getProfilePhotoTransform(width);
    const { data: signedPhoto, error: signedPhotoError } = await admin.storage
      .from(PROFILE_PHOTOS_BUCKET)
      .createSignedUrl(
        authorizedStoragePath,
        60,
        transform
          ? {
              transform,
            }
          : undefined,
      );

    if (signedPhotoError || !signedPhoto?.signedUrl) return null;

    return fetchUpstreamWithResponseTimeout(
      signedPhoto.signedUrl,
      {
        cache: "no-store",
        headers: upstreamHeaders,
        redirect: "error",
      },
      15_000,
    );
  }

  let upstreamResponse: Response | null = null;
  let servedTransformWidth: number | null = null;

  try {
    if (transformWidth) {
      const transformedResponse = await fetchPhoto(transformWidth);

      if (transformedResponse?.status === 200 && transformedResponse.body) {
        upstreamResponse = transformedResponse;
        servedTransformWidth = transformWidth;
      } else {
        await transformedResponse?.body?.cancel();
      }
    }

    // Image transformations depend on the active Supabase plan. Falling back
    // keeps existing photos available if that upstream capability is disabled.
    upstreamResponse ??= await fetchPhoto(null);
  } catch (error) {
    console.error("Profile media delivery failed.", {
      message: error instanceof Error ? error.message : String(error),
    });
    return applyCookies(
      NextResponse.json(
        { error: "Media unavailable" },
        {
          status: 503,
          headers: {
            "Cache-Control": "private, no-store",
            "Retry-After": "30",
          },
        },
      ),
    );
  }

  const expectedUpstreamStatus = requestedRange ? 206 : 200;

  if (requestedRange && upstreamResponse?.status === 416) {
    await upstreamResponse.body?.cancel();

    const response = new NextResponse(null, {
      status: 416,
      headers: { "Cache-Control": "private, no-store" },
    });
    const contentRange = upstreamResponse.headers.get("content-range");

    if (contentRange && /^bytes \*\/\d+$/.test(contentRange)) {
      response.headers.set("Content-Range", contentRange);
    }

    return applyCookies(response);
  }

  if (
    !upstreamResponse ||
    upstreamResponse.status !== expectedUpstreamStatus ||
    !upstreamResponse.body
  ) {
    await upstreamResponse?.body?.cancel();

    if (upstreamResponse?.status === 404) {
      return notFound(applyCookies);
    }

    return applyCookies(
      NextResponse.json(
        { error: "Media unavailable" },
        {
          status: 503,
          headers: {
            "Cache-Control": "private, no-store",
            "Retry-After": "30",
          },
        },
      ),
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

  return applyCookies(
    setProfilePhotoResponseHeaders(
      response,
      Boolean(user),
      getProfilePhotoEtag(authorizedStoragePath, servedTransformWidth),
    ),
  );
}
