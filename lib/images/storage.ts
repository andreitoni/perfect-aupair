import { getImageUploadFileExtension } from "@/lib/images/compress";
import {
  getMessageVideoUploadFileExtension,
  getProfileVideoUploadFileExtension,
} from "@/lib/videos/upload";
import { getMessageAudioUploadFileExtension } from "@/lib/audio/upload";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PROFILE_PHOTOS_BUCKET = "profile-photos";
export const PROFILE_STORIES_BUCKET = "profile-stories";
export const MESSAGE_PHOTOS_BUCKET = "message-photos";
export const MESSAGE_VIDEOS_BUCKET = "message-videos";
export const MESSAGE_AUDIO_BUCKET = "message-audio";
export const VERIFICATION_SELFIES_BUCKET = "verification-selfies";
export const PROFILE_VIDEOS_BUCKET = "profile-videos";

type StorageError = {
  message: string;
};

type UploadOptions = {
  cacheControl?: string;
  upsert?: boolean;
  contentType?: string;
};

type StorageBucket = {
  upload: (
    path: string,
    file: File,
    options?: UploadOptions,
  ) => Promise<{ error: StorageError | null }>;
  remove: (paths: string[]) => Promise<{ error: StorageError | null }>;
  getPublicUrl: (path: string) => {
    data: {
      publicUrl: string;
    };
  };
  createSignedUrl: (
    path: string,
    expiresIn: number,
  ) => Promise<{
    data: {
      signedUrl: string;
    } | null;
    error: StorageError | null;
  }>;
};

export type ImageStorageClient = {
  storage: {
    from: (bucket: string) => StorageBucket;
  };
};

type UploadStorageClient = ImageStorageClient &
  Pick<SupabaseClient, "auth" | "rpc">;

type UploadProfilePhotoParams = {
  supabase: UploadStorageClient;
  profileId: string;
  file: File;
};

type UploadStoryPhotoParams = {
  supabase: UploadStorageClient;
  profileId: string;
  file: File;
};

type UploadMessagePhotoParams = {
  supabase: UploadStorageClient;
  conversationId: string;
  file: File;
};

type UploadMessageVideoParams = {
  supabase: UploadStorageClient;
  conversationId: string;
  file: File;
  storagePath?: string;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
};

type UploadMessageAudioParams = {
  supabase: UploadStorageClient;
  conversationId: string;
  file: File;
};

type UploadVerificationSelfieParams = {
  supabase: UploadStorageClient;
  profileId: string;
  file: File;
};

type UploadProfileVideoParams = {
  supabase: UploadStorageClient;
  profileId: string;
  file: File;
};

export async function uploadProfilePhotoFile({
  supabase,
  profileId,
  file,
}: UploadProfilePhotoParams) {
  const storagePath = buildImageStoragePath(profileId, file);

  await uploadImageFile(supabase, PROFILE_PHOTOS_BUCKET, storagePath, file);

  return {
    storagePath,
    publicUrl: getProfilePhotoPublicUrl(supabase, storagePath),
  };
}

export async function uploadStoryPhotoFile({
  supabase,
  profileId,
  file,
}: UploadStoryPhotoParams) {
  const storagePath = buildImageStoragePath(profileId, file);

  await uploadImageFile(supabase, PROFILE_STORIES_BUCKET, storagePath, file);

  return { storagePath };
}

export async function uploadMessagePhotoFile({
  supabase,
  conversationId,
  file,
}: UploadMessagePhotoParams) {
  const storagePath = buildImageStoragePath(conversationId, file);

  await uploadImageFile(supabase, MESSAGE_PHOTOS_BUCKET, storagePath, file);

  return {
    storagePath,
    mimeType: file.type,
  };
}

export async function uploadMessageVideoFile({
  supabase,
  conversationId,
  file,
  storagePath = createMessageVideoStoragePath(conversationId, file),
  onProgress,
  signal,
}: UploadMessageVideoParams) {
  await uploadResumableFile(
    supabase,
    MESSAGE_VIDEOS_BUCKET,
    storagePath,
    file,
    onProgress,
    signal,
  );

  return {
    storagePath,
    mimeType: file.type,
  };
}

export async function uploadMessageAudioFile({
  supabase,
  conversationId,
  file,
}: UploadMessageAudioParams) {
  const storagePath = buildMessageAudioStoragePath(conversationId, file);

  await uploadFile(supabase, MESSAGE_AUDIO_BUCKET, storagePath, file);

  return {
    storagePath,
    mimeType: file.type,
  };
}

export async function uploadVerificationSelfieFile({
  supabase,
  profileId,
  file,
}: UploadVerificationSelfieParams) {
  const storagePath = buildImageStoragePath(profileId, file);

  await uploadImageFile(supabase, VERIFICATION_SELFIES_BUCKET, storagePath, file);

  return {
    storagePath,
    mimeType: file.type,
  };
}

export async function uploadProfileVideoFile({
  supabase,
  profileId,
  file,
}: UploadProfileVideoParams) {
  const storagePath = buildVideoStoragePath(profileId, file);

  await uploadFile(supabase, PROFILE_VIDEOS_BUCKET, storagePath, file);

  return {
    storagePath,
    mimeType: file.type,
  };
}

export function getProfilePhotoPublicUrl(
  _supabase: ImageStorageClient,
  storagePath: string,
) {
  const encodedPath = storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `/api/media/profile-photo/${encodedPath}`;
}

function getPrivateMediaUrl(bucket: string, storagePath: string) {
  const encodedPath = storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `/api/media/private/${encodeURIComponent(bucket)}/${encodedPath}`;
}

export async function getSignedStoryPhotoUrl(
  _supabase: ImageStorageClient,
  storagePath?: string | null,
  storyExpiresAt?: string | Date | null,
) {
  if (!storagePath) {
    return null;
  }

  if (storyExpiresAt) {
    const remainingSeconds = Math.floor(
      (new Date(storyExpiresAt).getTime() - Date.now()) / 1_000,
    );

    if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) {
      return null;
    }
  }

  return getPrivateMediaUrl(PROFILE_STORIES_BUCKET, storagePath);
}

export async function getSignedMessagePhotoUrl(
  _supabase: ImageStorageClient,
  storagePath?: string | null,
) {
  if (!storagePath) {
    return null;
  }

  return getPrivateMediaUrl(MESSAGE_PHOTOS_BUCKET, storagePath);
}

export async function getSignedMessageVideoUrl(
  _supabase: ImageStorageClient,
  storagePath?: string | null,
) {
  if (!storagePath) {
    return null;
  }

  return getPrivateMediaUrl(MESSAGE_VIDEOS_BUCKET, storagePath);
}

export async function getSignedMessageAudioUrl(
  _supabase: ImageStorageClient,
  storagePath?: string | null,
) {
  if (!storagePath) {
    return null;
  }

  return getPrivateMediaUrl(MESSAGE_AUDIO_BUCKET, storagePath);
}

export async function getSignedVerificationSelfieUrl(
  _supabase: ImageStorageClient,
  storagePath?: string | null,
) {
  if (!storagePath) {
    return null;
  }

  return getPrivateMediaUrl(VERIFICATION_SELFIES_BUCKET, storagePath);
}

export async function getSignedProfileVideoUrl(
  _supabase: ImageStorageClient,
  storagePath?: string | null,
) {
  if (!storagePath) {
    return null;
  }

  return getPrivateMediaUrl(PROFILE_VIDEOS_BUCKET, storagePath);
}

export function removeProfilePhotoFiles(
  supabase: ImageStorageClient,
  paths: string | string[],
) {
  return removeImageFiles(supabase, PROFILE_PHOTOS_BUCKET, paths);
}

export function removeStoryPhotoFiles(
  supabase: ImageStorageClient,
  paths: string | string[],
) {
  return removeImageFiles(supabase, PROFILE_STORIES_BUCKET, paths);
}

export function removeMessagePhotoFiles(
  supabase: ImageStorageClient,
  paths: string | string[],
) {
  return removeImageFiles(supabase, MESSAGE_PHOTOS_BUCKET, paths);
}

export function removeMessageVideoFiles(
  supabase: ImageStorageClient,
  paths: string | string[],
) {
  return removeImageFiles(supabase, MESSAGE_VIDEOS_BUCKET, paths);
}

export function removeMessageAudioFiles(
  supabase: ImageStorageClient,
  paths: string | string[],
) {
  return removeImageFiles(supabase, MESSAGE_AUDIO_BUCKET, paths);
}

export function removeProfileVideoFiles(
  supabase: ImageStorageClient,
  paths: string | string[],
) {
  return removeImageFiles(supabase, PROFILE_VIDEOS_BUCKET, paths);
}

export function removeVerificationSelfieFiles(
  supabase: ImageStorageClient,
  paths: string | string[],
) {
  return removeImageFiles(supabase, VERIFICATION_SELFIES_BUCKET, paths);
}

function buildImageStoragePath(ownerId: string, file: File) {
  return `${ownerId}/${crypto.randomUUID()}.${getImageUploadFileExtension(file)}`;
}

function buildVideoStoragePath(ownerId: string, file: File) {
  return `${ownerId}/${crypto.randomUUID()}.${getProfileVideoUploadFileExtension(file)}`;
}

export function createMessageVideoStoragePath(ownerId: string, file: File) {
  return `${ownerId}/${crypto.randomUUID()}.${getMessageVideoUploadFileExtension(file)}`;
}

function buildMessageAudioStoragePath(ownerId: string, file: File) {
  return `${ownerId}/${crypto.randomUUID()}.${getMessageAudioUploadFileExtension(file)}`;
}

async function uploadImageFile(
  supabase: UploadStorageClient,
  bucket: string,
  storagePath: string,
  file: File,
) {
  return uploadFile(supabase, bucket, storagePath, file);
}

async function uploadFile(
  supabase: UploadStorageClient,
  bucket: string,
  storagePath: string,
  file: File,
) {
  await reserveUploadQuota(supabase, bucket, storagePath, file.size);

  const { error } = await supabase.storage.from(bucket).upload(storagePath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });

  if (error) {
    throw new Error(error.message);
  }
}

const RESUMABLE_UPLOAD_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;
const RESUMABLE_UPLOAD_RETRY_DELAYS_MS = [0, 3_000, 5_000, 10_000, 20_000];

async function reserveUploadQuota(
  supabase: UploadStorageClient,
  bucket: string,
  storagePath: string,
  sizeBytes: number,
) {
  const { data: quotaReserved, error: quotaError } = await supabase.rpc(
    "reserve_storage_upload_quota",
    {
      p_bucket_id: bucket,
      p_object_name: storagePath,
      p_size_bytes: sizeBytes,
    },
  );

  if (quotaError || quotaReserved !== true) {
    throw new Error(
      quotaError?.message ??
        "Upload limit reached. Please remove unused media or try again later.",
    );
  }
}

function getResumableUploadEndpoint() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!configuredUrl) {
    throw new Error("Missing Supabase URL.");
  }

  const supabaseUrl = new URL(configuredUrl);
  const productionHostnameMatch = supabaseUrl.hostname.match(
    /^([a-z0-9]+)\.supabase\.co$/i,
  );
  const uploadOrigin = productionHostnameMatch
    ? `${supabaseUrl.protocol}//${productionHostnameMatch[1]}.storage.supabase.co`
    : supabaseUrl.origin;

  return new URL("/storage/v1/upload/resumable", uploadOrigin).toString();
}

async function uploadResumableFile(
  supabase: UploadStorageClient,
  bucket: string,
  storagePath: string,
  file: File,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
) {
  throwIfUploadAborted(signal);
  await reserveUploadQuota(supabase, bucket, storagePath, file.size);
  throwIfUploadAborted(signal);

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error("Your session expired. Please sign in and try again.");
  }

  throwIfUploadAborted(signal);
  const { Upload } = await import("tus-js-client");
  throwIfUploadAborted(signal);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let aborting = false;
    const cleanUp = () => signal?.removeEventListener("abort", handleAbort);
    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanUp();
      resolve();
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanUp();
      reject(error);
    };
    const upload = new Upload(file, {
      endpoint: getResumableUploadEndpoint(),
      retryDelays: RESUMABLE_UPLOAD_RETRY_DELAYS_MS,
      headers: {
        authorization: `Bearer ${session.access_token}`,
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      fingerprint: () =>
        Promise.resolve(
          [
            "perfect-aupair",
            bucket,
            storagePath,
            file.name,
            file.type,
            file.size,
            file.lastModified,
          ].join(":"),
        ),
      metadata: {
        bucketName: bucket,
        objectName: storagePath,
        contentType: file.type,
        cacheControl: "3600",
      },
      chunkSize: RESUMABLE_UPLOAD_CHUNK_SIZE_BYTES,
      onError: fail,
      onProgress: (bytesUploaded, bytesTotal) => {
        if (bytesTotal > 0) {
          onProgress?.(Math.min(1, bytesUploaded / bytesTotal));
        }
      },
      onSuccess: succeed,
    });

    function handleAbort() {
      if (settled || aborting) return;

      aborting = true;
      void upload.abort().then(
        () =>
          fail(
            new DOMException(
              "Video upload was cancelled.",
              "AbortError",
            ),
          ),
        fail,
      );
    }

    if (signal?.aborted) {
      handleAbort();
      return;
    }

    signal?.addEventListener("abort", handleAbort, { once: true });

    void upload.findPreviousUploads().then(
      (previousUploads) => {
        if (settled) return;

        if (signal?.aborted) {
          handleAbort();
          return;
        }

        if (previousUploads.length) {
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }

        if (settled || signal?.aborted) {
          handleAbort();
          return;
        }

        upload.start();
      },
      fail,
    );
  });
}

function throwIfUploadAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Video upload was cancelled.", "AbortError");
  }
}

async function removeImageFiles(
  supabase: ImageStorageClient,
  bucket: string,
  paths: string | string[],
) {
  const normalizedPaths = Array.isArray(paths) ? paths : [paths];

  if (typeof window === "undefined") {
    return supabase.storage.from(bucket).remove(normalizedPaths);
  }

  for (const path of normalizedPaths) {
    try {
      const response = await fetch("/api/media/orphan", {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bucket, path }),
      });
      const payload = (await response.json().catch(() => null)) as {
        deleted?: unknown;
      } | null;

      if (!response.ok || payload?.deleted !== true) {
        return {
          error: {
            message:
              response.status === 409
                ? "Media is still in use or has already been removed."
                : "Could not remove media. Please try again.",
          },
        };
      }
    } catch {
      return {
        error: { message: "Could not remove media. Please try again." },
      };
    }
  }

  return { error: null };
}
