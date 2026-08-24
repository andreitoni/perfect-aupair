"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MessageAudio } from "@/components/messages/MessageAudio";
import { MessageImage } from "@/components/messages/MessageImage";
import { MessageReadReceipt } from "@/components/messages/MessageReadReceipt";
import { MessageVideo } from "@/components/messages/MessageVideo";
import { useLocale, useTranslations } from "@/components/i18n/I18nProvider";
import {
  OPTIMISTIC_MESSAGE_ADD_EVENT,
  OPTIMISTIC_MESSAGE_REMOVE_EVENT,
  OPTIMISTIC_MESSAGE_UPDATE_EVENT,
  dispatchOptimisticMessageDismiss,
  dispatchOptimisticMessageRetry,
  type OptimisticMessagePayload,
  type OptimisticMessageUpdatePayload,
  type OptimisticVideoStatus,
} from "@/components/messages/optimistic-message-events";
import {
  formatMessageClock,
  formatMessageDateDivider,
  isSameLocalDay,
} from "@/lib/messages/date-format";

type MessageListItem = {
  id: string;
  order_key?: number;
  sender_id: string;
  body: string;
  image_path: string | null;
  image_mime_type: string | null;
  imageUrl: string | null;
  video_path: string | null;
  video_mime_type: string | null;
  videoUrl: string | null;
  audio_path: string | null;
  audio_mime_type: string | null;
  audio_duration_seconds: number | null;
  audioUrl: string | null;
  created_at: string;
  isOptimistic?: boolean;
  optimisticObjectUrl?: string | null;
  existingRealMessageIds?: Set<string>;
  optimisticVideoStatus?: OptimisticVideoStatus | null;
  optimisticVideoProgressPercent?: number | null;
};

type MessageListProps = {
  messages: MessageListItem[];
  currentUserId: string;
  conversationId: string;
  lastOutgoingMessageReadByOther: boolean;
  lastOtherTypingAt: number | null;
  deletePhotoAction: (formData: FormData) => void | Promise<void>;
};

const MESSAGE_BUBBLE_WIDTH_CLASS =
  "min-w-0 max-w-[min(80%,60rem)] sm:max-w-[min(76%,60rem)] lg:max-w-[min(68%,60rem)] 2xl:max-w-[min(62%,60rem)]";

function splitVisibleOptimisticMessages(
  optimisticMessages: MessageListItem[],
  messages: MessageListItem[],
) {
  const matchedRealMessageIds = new Set<string>();
  const optimisticSortTimesByRealMessageId = new Map<string, string>();
  const visible: MessageListItem[] = [];
  const hidden: MessageListItem[] = [];

  optimisticMessages.forEach((optimisticMessage) => {
    const optimisticCreatedAt = new Date(
      optimisticMessage.created_at,
    ).getTime();
    const optimisticAttachmentKind = optimisticMessage.videoUrl
      ? "video"
      : optimisticMessage.audioUrl
        ? "audio"
      : optimisticMessage.imageUrl
        ? "image"
        : null;

    const exactRealMessage = messages.find(
      (message) =>
        message.id === optimisticMessage.id &&
        !matchedRealMessageIds.has(message.id),
    );
    const matchingRealMessage = exactRealMessage ?? messages.find((message) => {
      if (matchedRealMessageIds.has(message.id)) {
        return false;
      }

      if (optimisticMessage.existingRealMessageIds?.has(message.id)) {
        return false;
      }

      if (
        message.sender_id !== optimisticMessage.sender_id ||
        message.body !== optimisticMessage.body
      ) {
        return false;
      }

      const realAttachmentKind =
        message.video_path || message.videoUrl
          ? "video"
          : message.audio_path || message.audioUrl
            ? "audio"
          : message.image_path || message.imageUrl
            ? "image"
            : null;

      if (realAttachmentKind !== optimisticAttachmentKind) {
        return false;
      }

      const realCreatedAt = new Date(message.created_at).getTime();

      return Math.abs(realCreatedAt - optimisticCreatedAt) < 120_000;
    });

    if (matchingRealMessage) {
      matchedRealMessageIds.add(matchingRealMessage.id);
      optimisticSortTimesByRealMessageId.set(
        matchingRealMessage.id,
        optimisticMessage.created_at,
      );
      hidden.push(optimisticMessage);
      return;
    }

    visible.push(optimisticMessage);
  });

  return { hidden, optimisticSortTimesByRealMessageId, visible };
}

export function MessageList({
  messages,
  currentUserId,
  conversationId,
  lastOutgoingMessageReadByOther,
  lastOtherTypingAt,
  deletePhotoAction,
}: MessageListProps) {
  const locale = useLocale();
  const t = useTranslations();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const optimisticObjectUrlsRef = useRef(new Set<string>());
  const [optimisticMessages, setOptimisticMessages] = useState<MessageListItem[]>(
    [],
  );
  const realMessageIds = useMemo(
    () => new Set(messages.map((message) => message.id)),
    [messages],
  );

  function revokeOptimisticObjectUrl(message: MessageListItem) {
    const objectUrl = message.optimisticObjectUrl;

    if (!objectUrl || !optimisticObjectUrlsRef.current.has(objectUrl)) {
      return;
    }

    URL.revokeObjectURL(objectUrl);
    optimisticObjectUrlsRef.current.delete(objectUrl);
  }

  useEffect(() => {
    function handleAdd(event: Event) {
      const payload = (event as CustomEvent<OptimisticMessagePayload>).detail;

      if (!payload || payload.conversationId !== conversationId) return;

      if (payload.imageObjectUrl) {
        optimisticObjectUrlsRef.current.add(payload.imageObjectUrl);
      }

      if (payload.videoObjectUrl) {
        optimisticObjectUrlsRef.current.add(payload.videoObjectUrl);
      }

      if (payload.audioObjectUrl) {
        optimisticObjectUrlsRef.current.add(payload.audioObjectUrl);
      }

      setOptimisticMessages((current) => {
        if (current.some((message) => message.id === payload.id)) {
          return current;
        }

        return [
          ...current,
          {
            id: payload.id,
            sender_id: payload.senderId,
            body: payload.body,
            image_path: null,
            image_mime_type: payload.imageMimeType ?? null,
            imageUrl: payload.imageObjectUrl ?? null,
            video_path: null,
            video_mime_type: payload.videoMimeType ?? null,
            videoUrl: payload.videoObjectUrl ?? null,
            audio_path: null,
            audio_mime_type: payload.audioMimeType ?? null,
            audio_duration_seconds: payload.audioDurationSeconds ?? null,
            audioUrl: payload.audioObjectUrl ?? null,
            created_at: payload.createdAt,
            isOptimistic: true,
            optimisticObjectUrl:
              payload.imageObjectUrl ??
              payload.videoObjectUrl ??
              payload.audioObjectUrl ??
              null,
            existingRealMessageIds: new Set(realMessageIds),
            optimisticVideoStatus: payload.videoObjectUrl
              ? "preparing"
              : null,
            optimisticVideoProgressPercent: null,
          },
        ];
      });
    }

    function handleUpdate(event: Event) {
      const payload = (
        event as CustomEvent<OptimisticMessageUpdatePayload>
      ).detail;

      if (!payload || payload.conversationId !== conversationId) return;

      setOptimisticMessages((current) =>
        current.map((message) =>
          message.id === payload.id
            ? {
                ...message,
                optimisticVideoStatus: payload.videoStatus,
                optimisticVideoProgressPercent:
                  payload.videoProgressPercent ?? null,
              }
            : message,
        ),
      );
    }

    function handleRemove(event: Event) {
      const id = (event as CustomEvent<string>).detail;

      if (!id) return;

      setOptimisticMessages((current) => {
        const removedMessages = current.filter((message) => message.id === id);
        removedMessages.forEach(revokeOptimisticObjectUrl);
        const remainingMessages = current.filter((message) => message.id !== id);
        const { hidden, visible } = splitVisibleOptimisticMessages(
          remainingMessages,
          messages,
        );

        if (!hidden.length) {
          return remainingMessages;
        }

        hidden.forEach(revokeOptimisticObjectUrl);

        if (!visible.length) {
          return visible;
        }

        const hiddenIds = new Set(hidden.map((message) => message.id));

        return remainingMessages.map((message) =>
          hiddenIds.has(message.id) && message.optimisticObjectUrl
            ? { ...message, optimisticObjectUrl: null }
            : message,
        );
      });
    }

    window.addEventListener(OPTIMISTIC_MESSAGE_ADD_EVENT, handleAdd);
    window.addEventListener(OPTIMISTIC_MESSAGE_UPDATE_EVENT, handleUpdate);
    window.addEventListener(OPTIMISTIC_MESSAGE_REMOVE_EVENT, handleRemove);

    return () => {
      window.removeEventListener(OPTIMISTIC_MESSAGE_ADD_EVENT, handleAdd);
      window.removeEventListener(OPTIMISTIC_MESSAGE_UPDATE_EVENT, handleUpdate);
      window.removeEventListener(OPTIMISTIC_MESSAGE_REMOVE_EVENT, handleRemove);
    };
  }, [conversationId, messages, realMessageIds]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setOptimisticMessages((current) => {
        const { hidden, visible } = splitVisibleOptimisticMessages(
          current,
          messages,
        );

        if (!hidden.length) {
          return current;
        }

        hidden.forEach(revokeOptimisticObjectUrl);

        if (!visible.length) {
          return visible;
        }

        const hiddenIds = new Set(hidden.map((message) => message.id));

        return current.map((message) =>
          hiddenIds.has(message.id) && message.optimisticObjectUrl
            ? { ...message, optimisticObjectUrl: null }
            : message,
        );
      });
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [messages]);

  useEffect(() => {
    const optimisticObjectUrls = optimisticObjectUrlsRef.current;

    return () => {
      optimisticObjectUrls.forEach((objectUrl) => {
        URL.revokeObjectURL(objectUrl);
      });
      optimisticObjectUrls.clear();
    };
  }, []);

  const displayedMessages = useMemo(
    () => {
      const { optimisticSortTimesByRealMessageId, visible } =
        splitVisibleOptimisticMessages(
        optimisticMessages,
        messages,
      );
      const stabilizedMessages = messages.map((message) => {
        const optimisticSortTime =
          optimisticSortTimesByRealMessageId.get(message.id);

        return optimisticSortTime
          ? { ...message, created_at: optimisticSortTime }
          : message;
      });

      return [...stabilizedMessages, ...visible].sort(
        (firstMessage, secondMessage) => {
          if (
            typeof firstMessage.order_key === "number" &&
            typeof secondMessage.order_key === "number"
          ) {
            return firstMessage.order_key - secondMessage.order_key;
          }

          return (
            new Date(firstMessage.created_at).getTime() -
            new Date(secondMessage.created_at).getTime()
          );
        },
      );
    },
    [messages, optimisticMessages],
  );
  const latestDisplayedMessageId =
    displayedMessages[displayedMessages.length - 1]?.id ?? null;
  let latestOwnMessageId: string | null = null;

  for (let index = displayedMessages.length - 1; index >= 0; index -= 1) {
    if (displayedMessages[index]?.sender_id === currentUserId) {
      latestOwnMessageId = displayedMessages[index]?.id ?? null;
      break;
    }
  }

  useLayoutEffect(() => {
    const scrollToBottom = () => {
      const scrollContainer = bottomRef.current?.closest<HTMLElement>(
        "[data-message-scroll-container]",
      );

      if (!scrollContainer) return;

      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    };

    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      scrollToBottom();
      secondFrame = requestAnimationFrame(scrollToBottom);
    });
    const delayedScroll = window.setTimeout(scrollToBottom, 120);

    scrollToBottom();

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      window.clearTimeout(delayedScroll);
    };
  }, [conversationId, displayedMessages.length, latestDisplayedMessageId]);

  if (!displayedMessages.length) {
    return (
      <div className="flex min-h-[240px] items-center justify-center text-center sm:min-h-[320px]">
        <div>
          <h2 className="text-2xl font-bold">{t("messages.noMessages")}</h2>
          <p className="mt-2 text-sm font-semibold text-[#25302d]/50">
            {t("messages.firstMessage")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {displayedMessages.map((message, index) => {
        const previousMessage = displayedMessages[index - 1];
        const showDateDivider =
          index === 0 ||
          !isSameLocalDay(previousMessage?.created_at, message.created_at);

        const isOwnMessage = message.sender_id === currentUserId;
        const showReadReceipt =
          isOwnMessage &&
          message.id === latestOwnMessageId;
        const isReadReceiptPending = Boolean(message.isOptimistic);
        const isReadReceiptRead =
          !isReadReceiptPending &&
          (lastOutgoingMessageReadByOther ||
            (lastOtherTypingAt !== null &&
              lastOtherTypingAt >= new Date(message.created_at).getTime()));

        return (
          <div
            key={message.id}
            data-message-id={message.id}
            data-message-optimistic={message.isOptimistic ? "true" : undefined}
            className="min-w-0 max-w-full"
          >
            {showDateDivider ? (
              <div className="my-4 flex justify-center sm:my-5">
                <span
                  suppressHydrationWarning
                  className="rounded-full bg-white px-4 py-1.5 text-xs font-black text-[#25302d]/45 shadow-sm ring-1 ring-black/5"
                >
                  {formatMessageDateDivider(message.created_at, locale, t)}
                </span>
              </div>
            ) : null}
            <div
              className={`flex min-w-0 max-w-full ${
                isOwnMessage ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`${MESSAGE_BUBBLE_WIDTH_CLASS} rounded-[1.25rem] text-[0.95rem] font-medium leading-6 shadow-[0_1px_2px_rgba(37,48,45,0.06)] ${
                  isOwnMessage
                    ? "bg-[#dff3ec] text-black ring-1 ring-[#bddfd4]"
                    : "bg-[#f2f4f5] text-black ring-1 ring-black/5"
                }`}
              >
                {message.imageUrl ? (
                  <div className="p-2">
                    <div className="relative w-fit">
                      <MessageImage
                        src={message.imageUrl}
                        isOwnMessage={isOwnMessage}
                      />

                      {message.isOptimistic ? (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[1.1rem] bg-black/20">
                          <span className="h-12 w-12 rounded-full border-[5px] border-white/45 border-t-white animate-spin" />
                        </div>
                      ) : null}

                      {isOwnMessage && !message.isOptimistic ? (
                        <form
                          action={deletePhotoAction}
                          className="absolute right-2 top-2"
                        >
                          <input
                            type="hidden"
                            name="conversation_id"
                            value={conversationId}
                          />
                          <input
                            type="hidden"
                            name="message_id"
                            value={message.id}
                          />

                          <button
                            type="submit"
                            data-delete-control="true"
                            className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-black text-[#9d3f2f] shadow-md ring-1 ring-black/10 transition hover:bg-[#fff5f2]"
                            title={t("messages.deletePhoto")}
                          >
                            {t("common.delete")}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {message.videoUrl ? (
                  <div className="p-2">
                    <div className="relative w-fit">
                      <MessageVideo
                        key={message.videoUrl}
                        src={message.videoUrl}
                        isOwnMessage={isOwnMessage}
                      />

                      {message.isOptimistic ? (
                        <div
                          data-video-send-status={
                            message.optimisticVideoStatus ?? "preparing"
                          }
                          data-video-send-progress={
                            message.optimisticVideoProgressPercent ?? undefined
                          }
                          className={`absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[1.1rem] bg-black/60 px-5 text-center text-white ${
                            message.optimisticVideoStatus === "failed"
                              ? "pointer-events-auto"
                              : "pointer-events-none"
                          }`}
                          role="status"
                          aria-live="polite"
                        >
                          {message.optimisticVideoStatus === "failed" ? (
                            <>
                              <p className="text-sm font-black">
                                {t("messages.videoUploadInterrupted")}
                              </p>
                              <div className="flex flex-wrap justify-center gap-2">
                                <button
                                  type="button"
                                  className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#25302d] shadow-sm"
                                  onClick={() =>
                                    dispatchOptimisticMessageRetry({
                                      id: message.id,
                                      conversationId,
                                    })
                                  }
                                >
                                  {t("error.tryAgain")}
                                </button>
                                <button
                                  type="button"
                                  className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-black text-white ring-1 ring-white/50"
                                  onClick={() =>
                                    dispatchOptimisticMessageDismiss({
                                      id: message.id,
                                      conversationId,
                                    })
                                  }
                                >
                                  {t("common.remove")}
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <span className="h-12 w-12 rounded-full border-[5px] border-white/45 border-t-white motion-safe:animate-spin" />
                              <div>
                                <p className="text-sm font-black">
                                  {t(
                                    message.optimisticVideoStatus === "uploading"
                                      ? "messages.uploadingVideo"
                                      : "messages.preparingVideo",
                                  )}
                                </p>
                                {message.optimisticVideoProgressPercent !== null &&
                                message.optimisticVideoProgressPercent !== undefined ? (
                                  <p className="mt-1 text-lg font-black tabular-nums">
                                    {message.optimisticVideoProgressPercent}%
                                  </p>
                                ) : null}
                              </div>
                              <span className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-white/25">
                                <span
                                  className={[
                                    "block h-full rounded-full bg-white transition-[width] duration-200",
                                    message.optimisticVideoProgressPercent === null ||
                                    message.optimisticVideoProgressPercent === undefined
                                      ? "w-1/3 motion-safe:animate-pulse"
                                      : "",
                                  ].join(" ")}
                                  style={
                                    message.optimisticVideoProgressPercent !== null &&
                                    message.optimisticVideoProgressPercent !== undefined
                                      ? {
                                          width: `${message.optimisticVideoProgressPercent}%`,
                                        }
                                      : undefined
                                  }
                                />
                              </span>
                            </>
                          )}
                        </div>
                      ) : null}

                      {isOwnMessage && !message.isOptimistic ? (
                        <form
                          action={deletePhotoAction}
                          className="absolute right-2 top-2"
                        >
                          <input
                            type="hidden"
                            name="conversation_id"
                            value={conversationId}
                          />
                          <input
                            type="hidden"
                            name="message_id"
                            value={message.id}
                          />

                          <button
                            type="submit"
                            data-delete-control="true"
                            className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-black text-[#9d3f2f] shadow-md ring-1 ring-black/10 transition hover:bg-[#fff5f2]"
                            title={t("messages.deleteVideo")}
                          >
                            {t("common.delete")}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {message.audioUrl ? (
                  <div className="p-2">
                    <div className="relative w-fit">
                      <MessageAudio
                        key={message.audioUrl}
                        src={message.audioUrl}
                        durationSeconds={message.audio_duration_seconds}
                        isOwnMessage={isOwnMessage}
                        isPending={isOwnMessage && Boolean(message.isOptimistic)}
                      />

                      {isOwnMessage && !message.isOptimistic ? (
                        <form
                          action={deletePhotoAction}
                          className="absolute right-1 top-1"
                        >
                          <input
                            type="hidden"
                            name="conversation_id"
                            value={conversationId}
                          />
                          <input
                            type="hidden"
                            name="message_id"
                            value={message.id}
                          />

                          <button
                            type="submit"
                            data-delete-control="true"
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-sm font-black text-[#9d3f2f] shadow-md ring-1 ring-black/10 transition hover:bg-[#fff5f2]"
                            title={t("messages.deleteVoiceMessage")}
                            aria-label={t("messages.deleteVoiceMessage")}
                          >
                            ×
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {message.body ? (
                  <p
                    data-clarity-mask="true"
                    data-hj-suppress=""
                    className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] px-3 py-2"
                  >
                    {message.body}
                  </p>
                ) : null}
              </div>
            </div>

            <p
              suppressHydrationWarning
              className={`mt-1 text-xs font-semibold text-[#25302d]/40 ${
                isOwnMessage ? "ml-auto text-right" : "mr-auto text-left"
              } ${MESSAGE_BUBBLE_WIDTH_CLASS}`}
            >
              <span className="inline-flex items-center gap-1">
                {formatMessageClock(message.created_at)}
                {showReadReceipt ? (
                  <span
                    data-message-read-receipt
                    data-pending={isReadReceiptPending}
                    data-read={isReadReceiptRead}
                  >
                    <MessageReadReceipt
                      read={isReadReceiptRead}
                      compact
                      label={t(
                        isReadReceiptPending
                          ? "messages.deliveryStatusSending"
                          : isReadReceiptRead
                            ? "messages.deliveryStatusRead"
                            : "messages.deliveryStatusDelivered",
                      )}
                    />
                  </span>
                ) : null}
              </span>
            </p>
          </div>
        );
      })}

      <div ref={bottomRef} />
    </>
  );
}
