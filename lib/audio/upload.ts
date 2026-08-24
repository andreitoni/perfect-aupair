export const MESSAGE_AUDIO_UPLOAD_MAX_SIZE = 15 * 1024 * 1024;
export const MESSAGE_AUDIO_MAX_DURATION_SECONDS = 120;
export const MESSAGE_AUDIO_UPLOAD_ALLOWED_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "audio/x-m4a",
] as const;

const MESSAGE_AUDIO_UPLOAD_ALLOWED_TYPE_SET = new Set<string>(
  MESSAGE_AUDIO_UPLOAD_ALLOWED_TYPES,
);

const MESSAGE_AUDIO_RECORDER_TYPES = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

type AudioValidationMessages = {
  type?: string;
  size?: string;
  duration?: string;
};

export function getSupportedMessageAudioRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  return (
    MESSAGE_AUDIO_RECORDER_TYPES.find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType),
    ) ?? ""
  );
}

export function validateMessageAudioUploadFile(
  file: File,
  messages: AudioValidationMessages = {},
) {
  if (!MESSAGE_AUDIO_UPLOAD_ALLOWED_TYPE_SET.has(file.type)) {
    return messages.type ?? "Please record a supported audio message.";
  }

  if (file.size > MESSAGE_AUDIO_UPLOAD_MAX_SIZE) {
    return (
      messages.size ??
      `Audio message must be ${formatAudioFileSize(
        MESSAGE_AUDIO_UPLOAD_MAX_SIZE,
      )} or smaller.`
    );
  }

  return null;
}

export function validateMessageAudioDuration(
  seconds: number,
  messages: AudioValidationMessages = {},
) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return messages.duration ?? "Could not read this audio message.";
  }

  if (seconds > MESSAGE_AUDIO_MAX_DURATION_SECONDS + 0.5) {
    return (
      messages.duration ??
      `Audio message must be ${MESSAGE_AUDIO_MAX_DURATION_SECONDS} seconds or shorter.`
    );
  }

  return null;
}

export function getMessageAudioUploadFileExtension(file: { type: string }) {
  if (file.type === "audio/mp4" || file.type === "audio/x-m4a") return "m4a";
  if (file.type === "audio/mpeg") return "mp3";
  if (file.type === "audio/ogg") return "ogg";
  if (file.type === "audio/wav" || file.type === "audio/x-wav") return "wav";
  if (file.type === "audio/aac") return "aac";

  return "webm";
}

export function formatAudioFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1).replace(/\.0$/, "")} MB`;
}

export function formatAudioDuration(seconds?: number | null) {
  if (!seconds || !Number.isFinite(seconds)) {
    return "0:00";
  }

  const roundedSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}
