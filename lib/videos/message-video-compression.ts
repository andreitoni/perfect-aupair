"use client";

import { MESSAGE_VIDEO_COMPRESSION_THRESHOLD_SIZE } from "@/lib/videos/upload";
import type { Conversion, InputAudioTrack } from "mediabunny";

const MESSAGE_VIDEO_TARGET_BITRATE = 2_000_000;
const MESSAGE_VIDEO_MAX_LONG_EDGE = 1280;
const MESSAGE_VIDEO_MAX_PIXEL_COUNT = 1280 * 720;
const MESSAGE_VIDEO_TARGET_FRAME_RATE = 30;
const MESSAGE_VIDEO_TARGET_AUDIO_BITRATE = 96_000;
const MESSAGE_VIDEO_CONVERSION_STALL_TIMEOUT_MS = 60_000;

export type PreparedMessageVideo = {
  file: File;
  compressionAttempted: boolean;
  compressed: boolean;
};

let compressionTail = Promise.resolve();

export function shouldCompressMessageVideo(file: File) {
  return file.size > MESSAGE_VIDEO_COMPRESSION_THRESHOLD_SIZE;
}

function buildCompressedVideoFileName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "").trim() || "message-video";

  return `${baseName}-compressed.mp4`;
}

function getEvenDimension(value: number) {
  return Math.max(2, Math.floor(value / 2) * 2);
}

function getTargetDimensions(width: number, height: number) {
  const longEdgeScale = MESSAGE_VIDEO_MAX_LONG_EDGE / Math.max(width, height);
  const pixelScale = Math.sqrt(
    MESSAGE_VIDEO_MAX_PIXEL_COUNT / (width * height),
  );
  const scale = Math.min(1, longEdgeScale, pixelScale);

  return {
    width: getEvenDimension(width * scale),
    height: getEvenDimension(height * scale),
  };
}

async function executeConversionWithStallTimeout(
  conversion: Conversion,
  onProgress?: (progress: number) => void,
) {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let stallTimeout = 0;

    const clearTimeouts = () => {
      if (stallTimeout) {
        window.clearTimeout(stallTimeout);
        stallTimeout = 0;
      }
    };
    const armStallTimeout = () => {
      if (settled) return;

      if (stallTimeout) {
        window.clearTimeout(stallTimeout);
      }

      stallTimeout = window.setTimeout(() => {
        if (settled) return;

        settled = true;
        clearTimeouts();
        const timeoutError = new Error("Video compression timed out.");
        void conversion.cancel().catch(() => undefined);
        reject(timeoutError);
      }, MESSAGE_VIDEO_CONVERSION_STALL_TIMEOUT_MS);
    };

    // Slower phones may need several times the clip duration. Keep working while
    // frames are progressing and stop only when the conversion has truly stalled.
    conversion.onProgress = (progress) => {
      armStallTimeout();
      onProgress?.(progress);
    };
    armStallTimeout();

    void conversion.execute().then(
      () => {
        if (settled) return;

        settled = true;
        clearTimeouts();
        resolve();
      },
      (error: unknown) => {
        if (settled) return;

        settled = true;
        clearTimeouts();
        reject(error);
      },
    );
  });
}

async function getAudioConversionOptions(track: InputAudioTrack) {
  const codec = await track.getCodec();

  if (codec === "aac") {
    return {};
  }

  return {
    codec: "aac" as const,
    bitrate: MESSAGE_VIDEO_TARGET_AUDIO_BITRATE,
    numberOfChannels: Math.min(2, await track.getNumberOfChannels()),
    sampleRate: Math.min(48_000, await track.getSampleRate()),
  };
}

async function compressMessageVideo(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<File> {
  const {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    Conversion,
    Input,
    Mp4OutputFormat,
    Output,
  } = await import("mediabunny");
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file),
  });

  try {
    if (!(await input.canRead())) {
      throw new Error("Unsupported video container.");
    }

    const [videoTrack, audioTrack] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.getPrimaryAudioTrack(),
    ]);

    if (!videoTrack || !(await videoTrack.canDecode())) {
      throw new Error("This browser cannot decode the selected video.");
    }

    const [sourceWidth, sourceHeight, packetStats] = await Promise.all([
      videoTrack.getDisplayWidth(),
      videoTrack.getDisplayHeight(),
      videoTrack.computePacketStats(90),
    ]);
    const sourceFrameRate = packetStats.averagePacketRate;
    const targetFrameRate = Number.isFinite(sourceFrameRate)
      ? Math.min(
          MESSAGE_VIDEO_TARGET_FRAME_RATE,
          Math.max(1, Math.round(sourceFrameRate * 100) / 100),
        )
      : MESSAGE_VIDEO_TARGET_FRAME_RATE;
    const targetDimensions = getTargetDimensions(sourceWidth, sourceHeight);
    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target,
    });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      tags: {},
      showWarnings: false,
      video: {
        codec: "avc",
        width: targetDimensions.width,
        height: targetDimensions.height,
        fit: "fill",
        frameRate: targetFrameRate,
        bitrate: MESSAGE_VIDEO_TARGET_BITRATE,
        keyFrameInterval: 2,
        hardwareAcceleration: "no-preference",
        forceTranscode: true,
      },
      audio: (track) => getAudioConversionOptions(track),
    });

    if (
      !conversion.isValid ||
      !conversion.utilizedTracks.includes(videoTrack) ||
      (audioTrack && !conversion.utilizedTracks.includes(audioTrack))
    ) {
      throw new Error("The video could not be converted without losing media.");
    }

    await executeConversionWithStallTimeout(conversion, onProgress);

    if (!target.buffer || target.buffer.byteLength <= 0) {
      throw new Error("Video compression produced an empty file.");
    }

    return new File(
      [target.buffer],
      buildCompressedVideoFileName(file.name),
      { type: "video/mp4", lastModified: Date.now() },
    );
  } finally {
    input.dispose();
  }
}

export async function prepareMessageVideoForUpload(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<PreparedMessageVideo> {
  if (!shouldCompressMessageVideo(file)) {
    return {
      file,
      compressionAttempted: false,
      compressed: false,
    };
  }

  const compressionTask = compressionTail.then(() =>
    compressMessageVideo(file, onProgress),
  );

  compressionTail = compressionTask.then(
    () => undefined,
    () => undefined,
  );

  try {
    const compressedFile = await compressionTask;

    if (
      compressedFile.size <= 0 ||
      compressedFile.size >= file.size * 0.92
    ) {
      return {
        file,
        compressionAttempted: true,
        compressed: false,
      };
    }

    return {
      file: compressedFile,
      compressionAttempted: true,
      compressed: true,
    };
  } catch {
    return {
      file,
      compressionAttempted: true,
      compressed: false,
    };
  }
}
