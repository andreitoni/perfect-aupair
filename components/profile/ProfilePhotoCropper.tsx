"use client";

import Cropper, { type Area, type Point } from "react-easy-crop";
import { createPortal } from "react-dom";
import { useId, useRef, useState } from "react";
import { useTranslations } from "@/components/i18n/I18nProvider";
import { useAccessibleDialog } from "@/components/ui/useAccessibleDialog";
import type { ImageCropPixels } from "@/lib/images/compress";

export type CroppedProfilePhoto = {
  file: File;
  crop: ImageCropPixels;
};

export type ProfilePhotoCropSource = {
  file: File;
  imageUrl: string;
};

type ProfilePhotoCropperProps = {
  photos: ProfilePhotoCropSource[];
  onCancel: () => void;
  onComplete: (photos: CroppedProfilePhoto[]) => void;
};

type PhotoEdit = {
  position: Point;
  zoom: number;
  pixels: Area | null;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

function createPhotoEdit(): PhotoEdit {
  return {
    position: { x: 0, y: 0 },
    zoom: MIN_ZOOM,
    pixels: null,
  };
}

export function ProfilePhotoCropper({
  photos,
  onCancel,
  onComplete,
}: ProfilePhotoCropperProps) {
  const t = useTranslations();
  const titleId = useId();
  const helpId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const [edits, setEdits] = useState<PhotoEdit[]>(() =>
    photos.map(() => createPhotoEdit()),
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [readyImageIndex, setReadyImageIndex] = useState<number | null>(
    null,
  );

  const currentEdit = edits[currentIndex] ?? createPhotoEdit();
  const isLastPhoto = currentIndex === photos.length - 1;
  const currentPhoto = photos[currentIndex];
  const imageIsReady = readyImageIndex === currentIndex;
  const { dialogRef, handleDialogKeyDown } =
    useAccessibleDialog<HTMLDivElement>({
      open: true,
      onClose: onCancel,
      initialFocusRef: cancelButtonRef,
    });

  function updateCurrentEdit(update: Partial<PhotoEdit>) {
    setEdits((currentEdits) =>
      currentEdits.map((edit, index) =>
        index === currentIndex ? { ...edit, ...update } : edit,
      ),
    );
  }

  function resetCurrentEdit() {
    updateCurrentEdit(createPhotoEdit());
    setLoadError(false);
  }

  function goToPreviousPhoto() {
    if (currentIndex === 0) return;
    setCurrentIndex((index) => index - 1);
    setLoadError(false);
  }

  function saveCurrentPhoto() {
    if (!currentEdit.pixels) return;

    if (!isLastPhoto) {
      setCurrentIndex((index) => index + 1);
      setLoadError(false);
      return;
    }

    const croppedPhotos = photos.map(({ file }, index) => {
      const crop = edits[index]?.pixels;

      if (!crop) {
        throw new Error("Missing profile photo crop.");
      }

      return { file, crop };
    });

    onComplete(croppedPhotos);
  }

  if (photos.length === 0 || !currentPhoto?.imageUrl) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[#101817]/80 sm:p-4"
    >
      <div
        ref={dialogRef}
        role={imageIsReady || loadError ? "dialog" : undefined}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={loadError ? undefined : helpId}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        data-profile-photo-crop-dialog="true"
        className="flex max-h-[100dvh] min-h-[100dvh] w-full flex-col overflow-y-auto bg-white text-[#25302d] shadow-2xl sm:min-h-0 sm:max-w-[42rem] sm:rounded-[1.5rem]"
      >
        <header
          className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-black/10 px-4 py-2 sm:px-5"
          style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
        >
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-full px-3 text-sm font-black text-[#45636f] transition hover:bg-[#edf5f7]"
          >
            {t("common.cancel")}
          </button>

          <h2
            id={titleId}
            className="min-w-0 truncate text-center text-base font-black sm:text-lg"
          >
            {t("profile.cropTitle")}
          </h2>

          <span className="min-w-[4.5rem] text-right text-xs font-black text-[#45636f]">
            {t("profile.cropCount", {
              current: currentIndex + 1,
              total: photos.length,
            })}
          </span>
        </header>

        <div className="flex flex-1 flex-col justify-center px-4 py-4 sm:px-6 sm:py-5">
          <div className="mx-auto w-full max-w-[36rem]">
            <div
              data-profile-photo-crop-frame="true"
              className="relative mx-auto h-[min(calc(100vw-2rem),58dvh)] w-[min(calc(100vw-2rem),58dvh)] max-h-[36rem] max-w-[36rem] overflow-hidden rounded-[0.9rem] bg-[#101817] shadow-inner sm:h-[min(36rem,58dvh)] sm:w-[min(36rem,58dvh)]"
            >
              <Cropper
                key={currentIndex}
                image={currentPhoto.imageUrl}
                crop={currentEdit.position}
                zoom={currentEdit.zoom}
                minZoom={MIN_ZOOM}
                maxZoom={MAX_ZOOM}
                zoomSpeed={0.2}
                aspect={1}
                objectFit="cover"
                showGrid
                roundCropAreaPixels
                restrictPosition
                onCropChange={(position) =>
                  updateCurrentEdit({ position, pixels: null })
                }
                onZoomChange={(zoom) =>
                  updateCurrentEdit({ zoom, pixels: null })
                }
                onCropComplete={(_, pixels) =>
                  updateCurrentEdit({ pixels })
                }
                onMediaLoaded={() => {
                  window.requestAnimationFrame(() => {
                    setReadyImageIndex(currentIndex);
                  });
                }}
                mediaProps={{
                  alt: "",
                  onError: () => {
                    setLoadError(true);
                    updateCurrentEdit({ pixels: null });
                  },
                }}
                cropperProps={{
                  "aria-label": t("profile.cropPreviewHelp"),
                }}
                style={{
                  cropAreaStyle: {
                    border: "2px solid rgba(255, 255, 255, 0.96)",
                    boxShadow: "0 0 0 9999em rgba(16, 24, 23, 0.5)",
                  },
                }}
              />
            </div>

            {loadError ? (
              <p
                role="alert"
                className="mt-3 rounded-xl bg-[#fff5f2] px-4 py-3 text-sm font-bold text-[#9d3f2f]"
              >
                {t("profile.cropLoadError")}
              </p>
            ) : (
              <div className="mt-3 text-center">
                <p id={helpId} className="text-sm font-bold text-[#25302d]/75">
                  {t("profile.cropHelp")}
                </p>
                <p className="mt-1 text-xs font-semibold text-[#25302d]/50">
                  {t("profile.cropPreviewHelp")}
                </p>
              </div>
            )}

            <div className="mt-4 flex items-center gap-3">
              <span aria-hidden="true" className="text-lg font-black text-[#45636f]">
                −
              </span>
              <label className="sr-only" htmlFor={`${titleId}-zoom`}>
                {t("profile.cropZoom")}
              </label>
              <input
                id={`${titleId}-zoom`}
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step="0.01"
                value={currentEdit.zoom}
                disabled={loadError}
                onChange={(event) =>
                  updateCurrentEdit({
                    zoom: Number(event.target.value),
                    pixels: null,
                  })
                }
                className="h-11 min-w-0 flex-1 cursor-pointer accent-[var(--pa-primary)] disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span aria-hidden="true" className="text-xl font-black text-[#45636f]">
                +
              </span>
            </div>
          </div>
        </div>

        <footer
          className="grid shrink-0 grid-cols-2 gap-2 border-t border-black/10 bg-white px-4 py-3 sm:flex sm:justify-end sm:px-5"
          style={{
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
          }}
        >
          <button
            type="button"
            onClick={resetCurrentEdit}
            className="min-h-11 rounded-full border border-black/10 bg-white px-4 text-sm font-black text-[#45636f] transition hover:bg-[#f7f3ed]"
          >
            {t("profile.cropReset")}
          </button>

          {currentIndex > 0 ? (
            <button
              type="button"
              onClick={goToPreviousPhoto}
              className="min-h-11 rounded-full border border-black/10 bg-white px-4 text-sm font-black text-[#25302d] transition hover:bg-[#f7f3ed]"
            >
              {t("profile.cropPrevious")}
            </button>
          ) : null}

          <button
            type="button"
            disabled={!currentEdit.pixels || loadError}
            onClick={saveCurrentPhoto}
            className="col-span-2 min-h-11 rounded-full bg-[var(--pa-primary)] px-5 text-sm font-black text-[var(--pa-primary-ink)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-1"
          >
            {isLastPhoto ? t("profile.cropApply") : t("profile.cropNext")}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
