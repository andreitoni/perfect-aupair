"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "@/components/i18n/I18nProvider";
import { useAccessibleDialog } from "@/components/ui/useAccessibleDialog";
import {
  getProfilePhotoVariantUrl,
  PROFILE_PHOTO_LIGHTBOX_WIDTH,
  PROFILE_PHOTO_PREVIEW_WIDTH,
  shouldBypassImageOptimization,
} from "@/lib/images/optimization";

type ProfilePhotoLightboxProps = {
  src: string;
  className?: string;
  sizes?: string;
  preload?: boolean;
  allowRotate?: boolean;
};

export function ProfilePhotoLightbox({
  src,
  className = "aspect-[4/5] w-full object-cover",
  sizes = "(min-width: 1024px) 340px, (min-width: 640px) 420px, calc(100vw - 32px)",
  preload = false,
  allowRotate = false,
}: ProfilePhotoLightboxProps) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previewSrc = getProfilePhotoVariantUrl(
    src,
    PROFILE_PHOTO_PREVIEW_WIDTH,
  );
  const lightboxSrc = getProfilePhotoVariantUrl(
    src,
    PROFILE_PHOTO_LIGHTBOX_WIDTH,
  );

  const closeLightbox = useCallback(() => {
    setIsOpen(false);
    setRotation(0);
  }, []);
  const { dialogRef, handleDialogKeyDown } =
    useAccessibleDialog<HTMLDivElement>({
      open: isOpen,
      onClose: closeLightbox,
      initialFocusRef: closeButtonRef,
    });

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        onContextMenu={(event) => event.preventDefault()}
        className="relative block h-full w-full cursor-zoom-in overflow-hidden"
        aria-label={t("profile.openPhoto")}
      >
        <Image
          src={previewSrc}
          alt=""
          fill
          preload={preload}
          sizes={sizes}
          unoptimized={shouldBypassImageOptimization(previewSrc)}
          draggable={false}
          className={`pa-protected-media block ${className}`}
        />
      </button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  closeLightbox();
                }
              }}
              onContextMenu={(event) => event.preventDefault()}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 99999,
                background: "rgba(0,0,0,0.82)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
              }}
            >
              <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={t("profile.openPhoto")}
                tabIndex={-1}
                onKeyDown={handleDialogKeyDown}
                onContextMenu={(event) => event.preventDefault()}
                style={{
                  position: "relative",
                  width: allowRotate
                    ? "min(760px, 94vw, 82vh)"
                    : "min(760px, 94vw)",
                  height: allowRotate ? "min(760px, 94vw, 82vh)" : "82vh",
                  maxHeight: "88vh",
                  background: "#000",
                  borderRadius: "28px",
                  padding: "12px",
                  boxShadow: "0 30px 90px rgba(0,0,0,0.55)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={closeLightbox}
                  aria-label={t("profile.closePhoto")}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "12px",
                    zIndex: 2,
                    width: "46px",
                    height: "46px",
                    borderRadius: "999px",
                    border: "4px solid rgba(0,0,0,0.22)",
                    background: "#fff",
                    color: "#25302d",
                    fontSize: "32px",
                    fontWeight: 900,
                    lineHeight: "36px",
                    cursor: "pointer",
                    boxShadow: "0 12px 35px rgba(0,0,0,0.35)",
                  }}
                >
                  ×
                </button>

                {allowRotate ? (
                  <button
                    type="button"
                    onClick={() =>
                      setRotation((currentRotation) =>
                        (currentRotation + 90) % 360,
                      )
                    }
                    aria-label="Rotate photo 90 degrees"
                    title="Rotate photo"
                    style={{
                      position: "absolute",
                      left: "12px",
                      bottom: "12px",
                      zIndex: 2,
                      minWidth: "46px",
                      height: "46px",
                      padding: "0 14px",
                      borderRadius: "999px",
                      border: "4px solid rgba(0,0,0,0.22)",
                      background: "#fff",
                      color: "#25302d",
                      fontSize: "23px",
                      fontWeight: 900,
                      lineHeight: "36px",
                      cursor: "pointer",
                      boxShadow: "0 12px 35px rgba(0,0,0,0.35)",
                    }}
                  >
                    ↻
                  </button>
                ) : null}

                <Image
                  src={lightboxSrc}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 760px, 94vw"
                  unoptimized={shouldBypassImageOptimization(lightboxSrc)}
                  draggable={false}
                  className="pa-protected-media"
                  style={{
                    objectFit: "contain",
                    borderRadius: "20px",
                    transform: allowRotate
                      ? `rotate(${rotation}deg)`
                      : undefined,
                    transition: allowRotate ? "transform 180ms ease" : undefined,
                  }}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
