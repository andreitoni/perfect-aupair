export const PROFILE_VIDEO_UPLOAD_MAX_SIZE = 60 * 1024 * 1024;
export const PROFILE_VIDEO_MAX_DURATION_SECONDS = 60;
export const PROFILE_VIDEO_UPLOAD_ACCEPT =
  "video/mp4,video/webm,video/quicktime,video/x-m4v";
export const MESSAGE_VIDEO_UPLOAD_MAX_SIZE = 100 * 1024 * 1024;
export const MESSAGE_VIDEO_COMPRESSION_THRESHOLD_SIZE = 50 * 1024 * 1024;
export const MESSAGE_VIDEO_STORAGE_MAX_SIZE = MESSAGE_VIDEO_UPLOAD_MAX_SIZE;
export const MESSAGE_VIDEO_MAX_DURATION_SECONDS = 60;
export const MESSAGE_VIDEO_UPLOAD_ACCEPT = PROFILE_VIDEO_UPLOAD_ACCEPT;

export const PROFILE_VIDEO_UPLOAD_ALLOWED_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
] as const;
export const MESSAGE_VIDEO_UPLOAD_ALLOWED_TYPES =
  PROFILE_VIDEO_UPLOAD_ALLOWED_TYPES;

const PROFILE_VIDEO_UPLOAD_ALLOWED_TYPE_SET = new Set<string>(
  PROFILE_VIDEO_UPLOAD_ALLOWED_TYPES,
);
const MESSAGE_VIDEO_UPLOAD_ALLOWED_TYPE_SET = new Set<string>(
  MESSAGE_VIDEO_UPLOAD_ALLOWED_TYPES,
);

type VideoUploadValidationMessages = {
  type?: string;
  size?: string;
  duration?: string;
  metadata?: string;
};

export type ProfileVideoMetadata = {
  durationSeconds: number;
  width: number | null;
  height: number | null;
};

export function validateProfileVideoUploadFile(
  file: File,
  messages: VideoUploadValidationMessages = {},
) {
  return validateVideoUploadFile(file, {
    allowedTypes: PROFILE_VIDEO_UPLOAD_ALLOWED_TYPE_SET,
    maxSizeBytes: PROFILE_VIDEO_UPLOAD_MAX_SIZE,
    messages,
  });
}

export function validateMessageVideoUploadFile(
  file: File,
  messages: VideoUploadValidationMessages = {},
) {
  return validateVideoUploadFile(file, {
    allowedTypes: MESSAGE_VIDEO_UPLOAD_ALLOWED_TYPE_SET,
    maxSizeBytes: MESSAGE_VIDEO_UPLOAD_MAX_SIZE,
    messages,
  });
}

export async function getProfileVideoMetadata(
  file: File,
  messages: VideoUploadValidationMessages = {},
): Promise<ProfileVideoMetadata> {
  return getVideoMetadata(file, PROFILE_VIDEO_MAX_DURATION_SECONDS, messages);
}

export async function getMessageVideoMetadata(
  file: File,
  messages: VideoUploadValidationMessages = {},
): Promise<ProfileVideoMetadata> {
  return getVideoMetadata(file, MESSAGE_VIDEO_MAX_DURATION_SECONDS, messages);
}

export function getProfileVideoUploadFileExtension(file: File) {
  return getVideoUploadFileExtension(file);
}

export function getMessageVideoUploadFileExtension(file: File) {
  return getVideoUploadFileExtension(file);
}

function getVideoUploadFileExtension(file: File) {
  if (file.type === "video/webm") return "webm";
  if (file.type === "video/quicktime") return "mov";
  if (file.type === "video/x-m4v") return "m4v";

  return "mp4";
}

export function formatVideoFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1).replace(/\.0$/, "")} MB`;
}

function loadVideoMetadata(
  file: File,
  messages: VideoUploadValidationMessages,
) {
  return new Promise<ProfileVideoMetadata>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    let verifiedObjectUrl: string;

    try {
      const parsedObjectUrl = new URL(objectUrl);

      if (parsedObjectUrl.protocol !== "blob:") {
        throw new Error("Unexpected video object URL protocol");
      }

      verifiedObjectUrl = parsedObjectUrl.href;
    } catch {
      URL.revokeObjectURL(objectUrl);
      reject(
        new Error(
          messages.metadata ??
            "Could not read this video. Please choose another file.",
        ),
      );
      return;
    }

    function cleanUp() {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    }

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const metadata = {
        durationSeconds: video.duration,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
      };

      cleanUp();
      resolve(metadata);
    };
    video.onerror = () => {
      cleanUp();
      reject(
        new Error(messages.metadata ?? "Could not read this video. Please choose another file."),
      );
    };
    video.src = verifiedObjectUrl;
  });
}

function validateVideoUploadFile(
  file: File,
  {
    allowedTypes,
    maxSizeBytes,
    messages,
  }: {
    allowedTypes: Set<string>;
    maxSizeBytes: number;
    messages: VideoUploadValidationMessages;
  },
) {
  if (!allowedTypes.has(file.type)) {
    return messages.type ?? "Please choose an MP4, WebM or MOV video.";
  }

  if (file.size > maxSizeBytes) {
    return (
      messages.size ??
      `Video must be ${formatVideoFileSize(maxSizeBytes)} or smaller.`
    );
  }

  return null;
}

async function getVideoMetadata(
  file: File,
  maxDurationSeconds: number,
  messages: VideoUploadValidationMessages,
): Promise<ProfileVideoMetadata> {
  const metadata = await loadVideoMetadata(file, messages);

  if (
    !Number.isFinite(metadata.durationSeconds) ||
    metadata.durationSeconds <= 0
  ) {
    throw new Error(messages.metadata ?? "Could not read this video.");
  }

  if (metadata.durationSeconds > maxDurationSeconds + 0.5) {
    throw new Error(
      messages.duration ??
        `Video must be ${maxDurationSeconds} seconds or shorter.`,
    );
  }

  return metadata;
}
