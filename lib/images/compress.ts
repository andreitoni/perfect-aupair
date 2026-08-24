export const IMAGE_UPLOAD_MAX_SIZE = 5 * 1024 * 1024;
export const IMAGE_COMPRESSION_SOURCE_MAX_SIZE = 20 * 1024 * 1024;
export const IMAGE_UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp";

export const IMAGE_UPLOAD_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const IMAGE_UPLOAD_ALLOWED_TYPE_SET = new Set<string>(
  IMAGE_UPLOAD_ALLOWED_TYPES,
);

type ImageUploadValidationMessages = {
  type?: string;
  size?: string;
  compressedSize?: string;
};

export type ImageCropPixels = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CompressImageOptions = {
  maxDimension?: number;
  quality?: number;
  maxSizeBytes?: number;
  maxOutputSizeBytes?: number;
  crop?: ImageCropPixels;
  messages?: ImageUploadValidationMessages;
};

const DEFAULT_MAX_DIMENSION = 1400;
const DEFAULT_QUALITY = 0.8;
const DEFAULT_OUTPUT_TYPE = "image/webp";
const FALLBACK_OUTPUT_TYPE = "image/jpeg";

let webpSupportPromise: Promise<boolean> | null = null;

export function validateImageUploadFile(
  file: File,
  options: {
    maxSizeBytes?: number;
    messages?: ImageUploadValidationMessages;
  } = {},
) {
  const maxSizeBytes = options.maxSizeBytes ?? IMAGE_UPLOAD_MAX_SIZE;
  const messages = options.messages ?? {};

  if (!IMAGE_UPLOAD_ALLOWED_TYPE_SET.has(file.type)) {
    return messages.type ?? "Please choose a JPG, PNG or WebP image.";
  }

  if (file.size > maxSizeBytes) {
    return (
      messages.size ??
      `Image must be ${formatImageFileSize(maxSizeBytes)} or smaller.`
    );
  }

  return null;
}

export function getImageUploadFileExtension(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";

  return "jpg";
}

export function formatImageFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1).replace(/\.0$/, "")} MB`;
}

export async function compressImageForUpload(
  file: File,
  options: CompressImageOptions = {},
) {
  const maxSizeBytes = options.maxSizeBytes ?? IMAGE_UPLOAD_MAX_SIZE;
  const maxOutputSizeBytes = Math.min(
    options.maxOutputSizeBytes ?? maxSizeBytes,
    maxSizeBytes,
  );
  const validationError = validateImageUploadFile(file, {
    maxSizeBytes,
    messages: options.messages,
  });

  if (validationError) {
    throw new Error(validationError);
  }

  const image = await loadImage(file);
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const source = getSourceArea(
    image.naturalWidth,
    image.naturalHeight,
    options.crop,
  );

  const outputType = (await canEncodeWebp())
    ? DEFAULT_OUTPUT_TYPE
    : FALLBACK_OUTPUT_TYPE;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not prepare image for upload.");
  }

  const preferredQuality = options.quality ?? DEFAULT_QUALITY;
  const qualityAttempts = Array.from(
    new Set([
      preferredQuality,
      Math.min(preferredQuality, 0.7),
      0.6,
      0.5,
    ]),
  );
  const dimensionAttempts = Array.from(
    new Set(
      [1, 0.86, 0.72, 0.6, 0.5].map((scale) =>
        Math.max(480, Math.round(maxDimension * scale)),
      ),
    ),
  );
  let blob: Blob | null = null;
  let outputSize = getTargetSize(
    source.width,
    source.height,
    maxDimension,
  );
  let matchedOutputLimit = false;

  for (const dimension of dimensionAttempts) {
    outputSize = getTargetSize(
      source.width,
      source.height,
      dimension,
    );
    canvas.width = outputSize.width;
    canvas.height = outputSize.height;

    if (outputType === FALLBACK_OUTPUT_TYPE) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, outputSize.width, outputSize.height);
    } else {
      context.clearRect(0, 0, outputSize.width, outputSize.height);
    }

    context.drawImage(
      image,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      outputSize.width,
      outputSize.height,
    );

    for (const quality of qualityAttempts) {
      blob = await canvasToBlob(canvas, outputType, quality);

      if (blob && blob.size <= maxOutputSizeBytes) {
        matchedOutputLimit = true;
        break;
      }
    }

    if (matchedOutputLimit) break;
  }

  if (!blob || blob.size === 0) {
    throw new Error("Could not prepare image for upload.");
  }

  if (blob.size > maxOutputSizeBytes) {
    throw new Error(
      options.messages?.compressedSize ??
        `Compressed image must be ${formatImageFileSize(maxOutputSizeBytes)} or smaller.`,
    );
  }

  return new File([blob], replaceFileExtension(file.name, blob.type), {
    type: blob.type,
    lastModified: file.lastModified,
  });
}

function getSourceArea(
  imageWidth: number,
  imageHeight: number,
  crop?: ImageCropPixels,
) {
  if (!crop) {
    return { x: 0, y: 0, width: imageWidth, height: imageHeight };
  }

  if (
    ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) ||
    crop.width <= 0 ||
    crop.height <= 0
  ) {
    throw new Error("Could not read the selected photo crop.");
  }

  const size = Math.max(
    1,
    Math.min(
      imageWidth,
      imageHeight,
      Math.round(Math.min(crop.width, crop.height)),
    ),
  );
  const x = Math.max(0, Math.min(imageWidth - size, Math.round(crop.x)));
  const y = Math.max(0, Math.min(imageHeight - size, Math.round(crop.y)));

  return { x, y, width: size, height: size };
}

function getTargetSize(width: number, height: number, maxDimension: number) {
  if (width <= 0 || height <= 0) {
    throw new Error("Could not read image dimensions.");
  }

  const largestDimension = Math.max(width, height);

  if (largestDimension <= maxDimension) {
    return { width, height };
  }

  const scale = maxDimension / largestDimension;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    function cleanUp() {
      URL.revokeObjectURL(objectUrl);
    }

    image.onload = () => {
      cleanUp();
      resolve(image);
    };

    image.onerror = () => {
      cleanUp();
      reject(new Error("Could not read image. Please choose another photo."));
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

function canEncodeWebp() {
  webpSupportPromise ??= new Promise<boolean>((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;

    canvas.toBlob((blob) => {
      resolve(Boolean(blob && blob.type === DEFAULT_OUTPUT_TYPE));
    }, DEFAULT_OUTPUT_TYPE);
  });

  return webpSupportPromise;
}

function replaceFileExtension(fileName: string, mimeType: string) {
  const extension = mimeType === "image/webp" ? "webp" : "jpg";
  const baseName = fileName.replace(/\.[^.]+$/, "") || "image";

  return `${baseName}.${extension}`;
}
