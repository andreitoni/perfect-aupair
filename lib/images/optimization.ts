export function shouldBypassImageOptimization(src?: string | null) {
  if (!src) return false;

  return (
    src.startsWith("/demo-pics/") ||
    src.startsWith("/api/media/profile-photo/") ||
    src.startsWith("/api/media/private/") ||
    src.includes("/storage/v1/object/sign/")
  );
}

const PROFILE_PHOTO_MEDIA_PREFIX = "/api/media/profile-photo/";
const MESSAGE_PHOTO_MEDIA_PREFIX = "/api/media/private/message-photos/";
const STORY_PHOTO_MEDIA_PREFIX = "/api/media/private/profile-stories/";
const PROFILE_CARD_IMAGE_WIDTHS = [192, 384, 640] as const;

export const PROFILE_PHOTO_PREVIEW_WIDTH = 640;
export const PROFILE_PHOTO_LIGHTBOX_WIDTH = 1200;
export const MESSAGE_PHOTO_PREVIEW_WIDTH = 640;
export const STORY_PHOTO_PREVIEW_WIDTH = 384;
export const STORY_PHOTO_VIEW_WIDTH = 960;

export function isProfilePhotoMediaUrl(src?: string | null) {
  return Boolean(src?.startsWith(PROFILE_PHOTO_MEDIA_PREFIX));
}

function getMediaWidthVariantUrl(src: string, width: number) {
  const hashIndex = src.indexOf("#");
  const hash = hashIndex >= 0 ? src.slice(hashIndex) : "";
  const urlWithoutHash = hashIndex >= 0 ? src.slice(0, hashIndex) : src;
  const queryIndex = urlWithoutHash.indexOf("?");
  const pathname =
    queryIndex >= 0 ? urlWithoutHash.slice(0, queryIndex) : urlWithoutHash;
  const searchParams = new URLSearchParams(
    queryIndex >= 0 ? urlWithoutHash.slice(queryIndex + 1) : "",
  );

  searchParams.set("width", String(width));

  return `${pathname}?${searchParams.toString()}${hash}`;
}

export function getProfilePhotoVariantUrl(src: string, width: number) {
  if (!isProfilePhotoMediaUrl(src)) return src;

  return getMediaWidthVariantUrl(src, width);
}

export function getMessagePhotoPreviewUrl(src: string) {
  if (!src.startsWith(MESSAGE_PHOTO_MEDIA_PREFIX)) return src;

  return getMediaWidthVariantUrl(src, MESSAGE_PHOTO_PREVIEW_WIDTH);
}

export function getStoryPhotoVariantUrl(src: string, width: number) {
  if (!src.startsWith(STORY_PHOTO_MEDIA_PREFIX)) return src;

  return getMediaWidthVariantUrl(src, width);
}

export function getProfileCardImageSrcSet(src: string) {
  if (!isProfilePhotoMediaUrl(src)) return undefined;

  return PROFILE_CARD_IMAGE_WIDTHS.map(
    (width) => `${getProfilePhotoVariantUrl(src, width)} ${width}w`,
  ).join(", ");
}
