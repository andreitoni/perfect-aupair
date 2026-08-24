"use client";

import Image from "next/image";
import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  useLocale,
  useTranslations,
} from "@/components/i18n/I18nProvider";
import { MediaIcon } from "@/components/messages/MessageActionIcons";
import { ZoomableMessageImage } from "@/components/messages/ZoomableMessageImage";
import { useAccessibleDialog } from "@/components/ui/useAccessibleDialog";
import { LANGUAGES, type LanguageCode } from "@/lib/i18n/config";
import { getMessagePhotoPreviewUrl } from "@/lib/images/optimization";

export type ConversationMediaItem = {
  id: string;
  type: "image" | "video";
  url: string;
  mimeType: string | null;
  createdAt: string;
  senderName: string;
};

function getIntlLocale(locale: LanguageCode) {
  return LANGUAGES.find((language) => language.code === locale)?.locale ?? "en-US";
}

function formatMediaDate(value: string, locale: LanguageCode) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function ConversationMediaButton({
  items,
  disabled = false,
}: {
  items: ConversationMediaItem[];
  disabled?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [openMediaItemId, setOpenMediaItemId] = useState<string | null>(null);
  const [failedMediaItemIds, setFailedMediaItemIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [mediaRetryCounts, setMediaRetryCounts] = useState<
    Readonly<Record<string, number>>
  >({});
  const panelCloseButtonRef = useRef<HTMLButtonElement>(null);
  const mediaCloseButtonRef = useRef<HTMLButtonElement>(null);
  const mediaItemTriggerRef = useRef<HTMLButtonElement>(null);

  const sortedItems = useMemo(
    () =>
      [...items].sort(
        (first, second) =>
          new Date(first.createdAt).getTime() -
          new Date(second.createdAt).getTime(),
      ),
    [items],
  );

  const openMediaItem =
    openMediaItemId === null
      ? null
      : sortedItems.find((item) => item.id === openMediaItemId) ?? null;

  const closeMediaPanel = useCallback(() => {
    setOpenMediaItemId(null);
    setIsOpen(false);
  }, []);
  const closeMediaItem = useCallback(() => setOpenMediaItemId(null), []);

  const markMediaItemFailed = useCallback((itemId: string) => {
    setFailedMediaItemIds((current) => {
      const next = new Set(current);
      next.add(itemId);
      return next;
    });
  }, []);
  const retryMediaItem = useCallback((itemId: string) => {
    setFailedMediaItemIds((current) => {
      const next = new Set(current);
      next.delete(itemId);
      return next;
    });
    setMediaRetryCounts((current) => ({
      ...current,
      [itemId]: (current[itemId] ?? 0) + 1,
    }));
  }, []);
  const {
    dialogRef: mediaPanelRef,
    handleDialogKeyDown: handleMediaPanelKeyDown,
  } = useAccessibleDialog<HTMLElement>({
    open: isOpen,
    onClose: closeMediaPanel,
    initialFocusRef: panelCloseButtonRef,
  });
  const {
    dialogRef: openMediaRef,
    handleDialogKeyDown: handleOpenMediaKeyDown,
  } = useAccessibleDialog<HTMLDivElement>({
    open: Boolean(openMediaItem),
    onClose: closeMediaItem,
    initialFocusRef: mediaCloseButtonRef,
    returnFocusRef: mediaItemTriggerRef,
    lockBodyScroll: false,
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={disabled}
        className="inline-flex h-10 w-10 items-center justify-center gap-2 rounded-full bg-[#eef4f5] text-sm font-black text-[#25302d] transition hover:bg-[#dfeaec] disabled:cursor-not-allowed disabled:bg-[#f0f2f2] disabled:text-[#25302d]/30 disabled:hover:bg-[#f0f2f2] sm:w-fit sm:px-4"
        aria-label={t("messages.media")}
      >
        <MediaIcon className="h-5 w-5" />
        <span className="hidden sm:inline">{t("messages.media")}</span>
      </button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/55 p-4"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  closeMediaPanel();
                }
              }}
              onContextMenu={(event) => event.preventDefault()}
            >
              <section
                ref={mediaPanelRef}
                className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-[0_30px_90px_rgba(0,0,0,0.28)]"
                onContextMenu={(event) => event.preventDefault()}
                onKeyDown={handleMediaPanelKeyDown}
                tabIndex={-1}
                aria-modal="true"
                role="dialog"
                aria-label={t("messages.media")}
                aria-hidden={openMediaItem ? true : undefined}
                inert={openMediaItem ? true : undefined}
              >
                <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eef4f5] text-[#25302d]">
                      <MediaIcon className="h-5 w-5" />
                    </span>
                    <h2 className="text-xl font-black tracking-[-0.03em]">
                      {t("messages.media")}
                    </h2>
                  </div>
                  <button
                    ref={panelCloseButtonRef}
                    type="button"
                    onClick={closeMediaPanel}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e2e5e9] text-3xl font-black leading-none text-[#25302d] transition hover:bg-[#d5d9df]"
                    aria-label={t("messages.closeMedia")}
                  >
                    ×
                  </button>
                </div>

                <div className="min-h-0 touch-pan-y overflow-y-auto overscroll-y-contain p-5 sm:p-6">
                  {sortedItems.length > 0 ? (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      {sortedItems.map((item) => (
                        <figure key={item.id} className="min-w-0">
                          <button
                            type="button"
                            onClick={(event) => {
                              if (failedMediaItemIds.has(item.id)) {
                                retryMediaItem(item.id);
                                return;
                              }

                              mediaItemTriggerRef.current = event.currentTarget;
                              setOpenMediaItemId(item.id);
                            }}
                            aria-label={t(
                              failedMediaItemIds.has(item.id)
                                ? "error.tryAgain"
                                : "messages.openMediaItem",
                            )}
                            className="relative block aspect-[4/5] w-full cursor-zoom-in overflow-hidden rounded-[1.25rem] border-0 bg-[#f7f3ed] p-0"
                            onContextMenu={(event) => event.preventDefault()}
                            onDragStart={(event) => event.preventDefault()}
                          >
                            {failedMediaItemIds.has(item.id) ? (
                              <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-sm font-black text-[#25302d]/65">
                                <MediaIcon className="h-8 w-8" />
                                {t("error.tryAgain")}
                              </span>
                            ) : item.type === "image" ? (
                              <Image
                                key={mediaRetryCounts[item.id] ?? 0}
                                data-conversation-media-image="true"
                                src={getMessagePhotoPreviewUrl(item.url)}
                                alt=""
                                fill
                                sizes="(max-width: 640px) 45vw, 220px"
                                unoptimized
                                draggable={false}
                                className="pa-protected-media object-cover"
                                onError={() => markMediaItemFailed(item.id)}
                              />
                            ) : (
                              <>
                                <span
                                  data-conversation-media-video="true"
                                  className="pa-protected-media block h-full w-full bg-black"
                                />
                                <span className="absolute inset-0 flex items-center justify-center bg-black/18 text-white">
                                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/45">
                                    <span className="ml-1 h-0 w-0 border-y-[8px] border-l-[13px] border-y-transparent border-l-white" />
                                  </span>
                                </span>
                              </>
                            )}
                          </button>
                          <figcaption className="mt-2 min-w-0">
                            <p className="truncate text-sm font-black text-[#25302d]">
                              {item.senderName}
                            </p>
                            <p
                              suppressHydrationWarning
                              className="truncate text-xs font-bold text-[#25302d]/45"
                            >
                              {formatMediaDate(item.createdAt, locale)}
                            </p>
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  ) : (
                    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-[1.5rem] bg-[var(--background)] px-6 text-center">
                      <MediaIcon className="h-10 w-10 text-[#25302d]/35" />
                      <p className="mt-4 text-xl font-black tracking-[-0.03em]">
                        {t("messages.noMedia")}
                      </p>
                      <p className="mt-2 max-w-sm text-sm font-semibold leading-6 text-[#25302d]/50">
                        {t("messages.noMediaDescription")}
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {openMediaItem ? (
                <div
                  className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/85 p-4"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (event.target === event.currentTarget) {
                      closeMediaItem();
                    }
                  }}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  <div
                    ref={openMediaRef}
                    role="dialog"
                    aria-modal="true"
                    aria-label={t("messages.media")}
                    tabIndex={-1}
                    className="relative flex h-[82vh] max-h-[88vh] w-[min(760px,94vw)] items-center justify-center rounded-[1.75rem] bg-black p-3 shadow-[0_30px_90px_rgba(0,0,0,0.55)]"
                    onKeyDown={handleOpenMediaKeyDown}
                    onContextMenu={(event) => event.preventDefault()}
                  >
                    <button
                      ref={mediaCloseButtonRef}
                      type="button"
                      onClick={closeMediaItem}
                      aria-label={t("messages.closeMedia")}
                      className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border-4 border-black/20 bg-white text-3xl font-black leading-none text-[#25302d] shadow-[0_12px_35px_rgba(0,0,0,0.35)] transition hover:bg-[#f1f3f5]"
                    >
                      ×
                    </button>

                    {openMediaItem.type === "image" ? (
                      <ZoomableMessageImage
                        key={`${openMediaItem.id}:${mediaRetryCounts[openMediaItem.id] ?? 0}`}
                        src={openMediaItem.url}
                        sizes="94vw"
                        onError={() => {
                          markMediaItemFailed(openMediaItem.id);
                          closeMediaItem();
                        }}
                      />
                    ) : (
                      <video
                        src={openMediaItem.url}
                        controls
                        autoPlay
                        preload="auto"
                        playsInline
                        controlsList="nodownload"
                        disablePictureInPicture
                        draggable={false}
                        className="pa-protected-media h-full w-full rounded-[1.25rem] bg-black object-contain"
                        onError={() => {
                          markMediaItemFailed(openMediaItem.id);
                          closeMediaItem();
                        }}
                        onContextMenu={(event) => event.preventDefault()}
                      />
                    )}
                  </div>
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
