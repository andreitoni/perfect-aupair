"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "@/components/i18n/I18nProvider";
import { useAccessibleDialog } from "@/components/ui/useAccessibleDialog";
import { MediaIcon } from "@/components/messages/MessageActionIcons";
import { ZoomableMessageImage } from "@/components/messages/ZoomableMessageImage";
import { getMessagePhotoPreviewUrl } from "@/lib/images/optimization";

type MessageImageProps = {
  src: string;
  isOwnMessage: boolean;
};

export function MessageImage({ src, isOwnMessage }: MessageImageProps) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previewSrc = getMessagePhotoPreviewUrl(src);

  const closeLightbox = useCallback(() => setIsOpen(false), []);
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
        onClick={() => {
          if (loadFailed) {
            setLoadFailed(false);
            setRetryCount((current) => current + 1);
            return;
          }

          setIsOpen(true);
        }}
        onContextMenu={(event) => event.preventDefault()}
        aria-label={t(loadFailed ? "error.tryAgain" : "messages.openImage")}
        style={{
          display: "block",
          width: "180px",
          maxWidth: "62vw",
          aspectRatio: "4 / 5",
          overflow: "hidden",
          borderRadius: "20px",
          border: "0",
          padding: "0",
          position: "relative",
          background: "#f7f3ed",
          cursor: "zoom-in",
          marginLeft: isOwnMessage ? "auto" : "0",
        }}
      >
        {loadFailed ? (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-sm font-black text-[#25302d]/65">
            <MediaIcon className="h-8 w-8" />
            {t("error.tryAgain")}
          </span>
        ) : (
          <Image
            key={retryCount}
            src={previewSrc}
            alt=""
            fill
            sizes="180px"
            unoptimized
            draggable={false}
            className="pa-protected-media"
            style={{
              objectFit: "cover",
            }}
            onError={() => setLoadFailed(true)}
          />
        )}
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
                aria-label={t("messages.openImage")}
                tabIndex={-1}
                onKeyDown={handleDialogKeyDown}
                onContextMenu={(event) => event.preventDefault()}
                style={{
                  position: "relative",
                  width: "min(760px, 94vw)",
                  height: "82vh",
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
                  aria-label={t("messages.closeImage")}
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

                <ZoomableMessageImage
                  key={retryCount}
                  src={src}
                  sizes="94vw"
                  onError={() => {
                    setLoadFailed(true);
                    closeLightbox();
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
