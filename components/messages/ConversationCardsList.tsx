"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/components/i18n/I18nProvider";
import {
  getProfilePhotoVariantUrl,
  shouldBypassImageOptimization,
} from "@/lib/images/optimization";
import { formatConversationListTime } from "@/lib/messages/date-format";
import { ProfileActivityBadge } from "@/components/profile/ProfileActivityBadge";
import { ProfileVerificationBadge } from "@/components/profile/ProfileVerificationBadge";
import { DeletedAccountAvatar } from "@/components/messages/DeletedAccountAvatar";
import {
  ConversationHeaderActions,
  type ConversationActionLabels,
} from "@/components/messages/ConversationHeaderActions";
import { MessageReadReceipt } from "@/components/messages/MessageReadReceipt";
import {
  compareConversationCardsByLatestMessage,
  getLastMessagePreview,
  type ConversationCard,
  type MessageRow,
} from "@/lib/messages/conversation-cards";
import {
  formatCountryName,
  formatProfileBadge,
} from "@/lib/i18n/formatters";
import type { LanguageCode } from "@/lib/i18n/config";
import type { Translate } from "@/lib/i18n/translations";
import {
  OPTIMISTIC_MESSAGE_ADD_EVENT,
  OPTIMISTIC_MESSAGE_REMOVE_EVENT,
  type OptimisticMessagePayload,
} from "@/components/messages/optimistic-message-events";
import { CONVERSATION_TYPING_STATE_EVENT } from "@/components/messages/useConversationTyping";

export type ConversationListLabels = {
  profile: string;
  photo: string;
  message: string;
  noMessages: string;
  deleteConversation: string;
  deleteConversationConfirm: string;
  moreConversationActions: string;
  verified: string;
  reportProfile: string;
  blockProfile: string;
  blockProfileConfirm: string;
  blockProfileConfirmButton: string;
  unblockProfile: string;
  unblockProfileConfirm: string;
  unblockProfileConfirmBody: string;
  unblockProfileConfirmButton: string;
  cancel: string;
  close: string;
  reportIntro: string;
  reportCategory: string;
  reportChooseCategory: string;
  reportCategoryFake: string;
  reportCategoryInappropriate: string;
  reportCategorySpam: string;
  reportCategoryHarassment: string;
  reportCategoryPrivacy: string;
  reportCategoryOther: string;
  reportReason: string;
  reportChooseReason: string;
  reportReasonFake: string;
  reportReasonInappropriate: string;
  reportReasonSpam: string;
  reportReasonHarassment: string;
  reportReasonOther: string;
  reportDetails: string;
  reportDetailsPlaceholder: string;
  reportSend: string;
  reportSent: string;
  reportSentText: string;
};

type ActionResult = {
  ok: boolean;
  error?: string;
  errorCode?: "block_cooldown";
  retryAt?: string;
};

type ConversationCardsListProps = {
  cards: ConversationCard[];
  locale: LanguageCode;
  labels: ConversationListLabels;
  compact?: boolean;
  selectedConversationId?: string;
  showActions?: boolean;
  deleteAction?: (formData: FormData) => void | Promise<void>;
  blockAction?: (formData: FormData) => Promise<ActionResult>;
  unblockAction?: (formData: FormData) => Promise<ActionResult>;
  reportAction?: (formData: FormData) => Promise<ActionResult>;
  redirectToMessagesAfterDelete?: boolean;
  onConversationDeleted?: (conversationId: string) => void;
  searchQuery?: string;
};

type OptimisticConversationMessage = {
  id: string;
  conversationId: string;
  message: MessageRow;
  activityAt: string;
};

function getMessageText(message: MessageRow | null) {
  if (!message) return "";

  return (
    message.content ??
    message.body ??
    message.message ??
    message.text ??
    message.message_text ??
    ""
  );
}

function getMessageAttachmentKind(message: MessageRow | null) {
  if (!message) return null;
  if (message.video_path) return "video";
  if (message.audio_path) return "audio";

  if (
    message.image_path ||
    message.image_url ||
    message.photo_path ||
    message.attachment_path
  ) {
    return "image";
  }

  return null;
}

function toOptimisticConversationMessage(
  payload: OptimisticMessagePayload,
): OptimisticConversationMessage {
  return {
    id: payload.id,
    conversationId: payload.conversationId,
    activityAt: payload.createdAt,
    message: {
      sender_id: payload.senderId,
      body: payload.body,
      image_url: payload.imageObjectUrl ?? null,
      image_mime_type: payload.imageMimeType ?? null,
      video_path: payload.videoObjectUrl ?? null,
      video_mime_type: payload.videoMimeType ?? null,
      audio_path: payload.audioObjectUrl ?? null,
      audio_mime_type: payload.audioMimeType ?? null,
      created_at: payload.createdAt,
    },
  };
}

function isMatchingRealMessage(
  optimisticMessage: OptimisticConversationMessage,
  realMessage: MessageRow | null,
) {
  if (!realMessage?.created_at) return false;

  if (realMessage.id) {
    return realMessage.id === optimisticMessage.id;
  }

  if (getMessageText(realMessage) !== getMessageText(optimisticMessage.message)) {
    return false;
  }

  if (
    getMessageAttachmentKind(realMessage) !==
    getMessageAttachmentKind(optimisticMessage.message)
  ) {
    return false;
  }

  return (
    Math.abs(
      new Date(realMessage.created_at).getTime() -
        new Date(optimisticMessage.activityAt).getTime(),
    ) < 120_000
  );
}

function getLatestOptimisticMessages(
  optimisticMessages: OptimisticConversationMessage[],
) {
  const latestMessages = new Map<string, OptimisticConversationMessage>();

  optimisticMessages.forEach((message) => {
    const currentMessage = latestMessages.get(message.conversationId);

    if (
      !currentMessage ||
      new Date(message.activityAt).getTime() >=
        new Date(currentMessage.activityAt).getTime()
    ) {
      latestMessages.set(message.conversationId, message);
    }
  });

  return latestMessages;
}

function getConversationCardHref(card: ConversationCard) {
  if (card.isProfileViewInterest && card.startProfileId && card.notificationId) {
    return `/messages?profile=${encodeURIComponent(
      card.startProfileId,
    )}&interest=${encodeURIComponent(card.notificationId)}`;
  }

  return `/messages?conversation=${encodeURIComponent(card.conversation.id)}`;
}

function getLastMessagePreviewText(
  message: MessageRow | null,
  labels: ConversationListLabels,
) {
  return getLastMessagePreview(message, (key) => {
    if (key === "messages.noMessages") return labels.noMessages;
    if (key === "common.photo") return labels.photo;
    if (key === "common.message") return labels.message;

    return labels.message;
  });
}

function getSearchableConversationText(
  card: ConversationCard,
  locale: LanguageCode,
  labels: ConversationListLabels,
  t: Translate,
) {
  return [
    card.otherProfileName,
    card.otherProfile?.full_name,
    card.otherProfile?.city,
    formatCountryName(card.otherProfile?.country, locale, t),
    getLastMessagePreviewText(card.lastMessage, labels),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function ConversationActionsMenu({
  conversationId,
  otherProfileId,
  profileName,
  isBlockedByViewer,
  actionsDisabled,
  reportDisabled,
  blockCooldownUntil,
  labels,
  deleteAction,
  blockAction,
  unblockAction,
  reportAction,
  redirectToMessagesAfterDelete,
  onDeleteSuccess,
  onMenuOpenChange,
  compact,
}: {
  conversationId: string;
  otherProfileId?: string | null;
  profileName: string;
  isBlockedByViewer: boolean;
  actionsDisabled: boolean;
  reportDisabled: boolean;
  blockCooldownUntil?: string | null;
  labels: ConversationListLabels;
  deleteAction: (formData: FormData) => void | Promise<void>;
  blockAction: (formData: FormData) => Promise<ActionResult>;
  unblockAction: (formData: FormData) => Promise<ActionResult>;
  reportAction: (formData: FormData) => Promise<ActionResult>;
  redirectToMessagesAfterDelete: boolean;
  onDeleteSuccess?: (conversationId: string) => void;
  onMenuOpenChange?: (open: boolean) => void;
  compact: boolean;
}) {
  const namedLabel = (value: string) => value.replaceAll("{name}", profileName);
  const actionLabels: ConversationActionLabels = {
    moreActions: labels.moreConversationActions,
    deleteChat: labels.deleteConversation,
    deleteChatConfirm: labels.deleteConversationConfirm,
    report: labels.reportProfile,
    block: labels.blockProfile,
    unblock: labels.unblockProfile,
    blockConfirm: namedLabel(labels.blockProfileConfirm),
    unblockConfirm: namedLabel(labels.unblockProfileConfirm),
    unblockConfirmBody: namedLabel(labels.unblockProfileConfirmBody),
    blockConfirmButton: labels.blockProfileConfirmButton,
    unblockConfirmButton: labels.unblockProfileConfirmButton,
    cancel: labels.cancel,
    close: labels.close,
    reportIntro: labels.reportIntro,
    reportCategory: labels.reportCategory,
    reportChooseCategory: labels.reportChooseCategory,
    reportCategoryFake: labels.reportCategoryFake,
    reportCategoryInappropriate: labels.reportCategoryInappropriate,
    reportCategorySpam: labels.reportCategorySpam,
    reportCategoryHarassment: labels.reportCategoryHarassment,
    reportCategoryPrivacy: labels.reportCategoryPrivacy,
    reportCategoryOther: labels.reportCategoryOther,
    reportReason: labels.reportReason,
    reportChooseReason: labels.reportChooseReason,
    reportReasonFake: labels.reportReasonFake,
    reportReasonInappropriate: labels.reportReasonInappropriate,
    reportReasonSpam: labels.reportReasonSpam,
    reportReasonHarassment: labels.reportReasonHarassment,
    reportReasonOther: labels.reportReasonOther,
    reportDetails: labels.reportDetails,
    reportDetailsPlaceholder: labels.reportDetailsPlaceholder,
    reportSend: labels.reportSend,
    reportSent: labels.reportSent,
    reportSentText: labels.reportSentText,
  };

  return (
    <div
      className={`absolute z-20 ${
        compact ? "right-2 top-2" : "right-3 top-3 sm:right-4 sm:top-4"
      }`}
    >
      <ConversationHeaderActions
        conversationId={conversationId}
        otherProfileId={otherProfileId}
        returnTo={`/messages?conversation=${conversationId}`}
        isBlockedByViewer={isBlockedByViewer}
        actionsDisabled={actionsDisabled}
        reportDisabled={reportDisabled}
        blockCooldownUntil={blockCooldownUntil}
        labels={actionLabels}
        deleteAction={deleteAction}
        blockAction={blockAction}
        unblockAction={unblockAction}
        reportAction={reportAction}
        redirectToMessagesAfterDelete={redirectToMessagesAfterDelete}
        onMenuOpenChange={onMenuOpenChange}
        onDeleteSuccess={onDeleteSuccess}
        buttonClassName="flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-[#25302d]/60 opacity-90 shadow-sm ring-1 ring-black/10 transition hover:text-[#25302d] hover:opacity-100 group-focus-within:opacity-100"
        iconClassName="h-4 w-4"
      />
    </div>
  );
}

export function ConversationCardsList({
  cards,
  locale,
  labels,
  compact = false,
  selectedConversationId,
  showActions = false,
  deleteAction,
  blockAction,
  unblockAction,
  reportAction,
  redirectToMessagesAfterDelete = false,
  onConversationDeleted,
  searchQuery = "",
}: ConversationCardsListProps) {
  const t = useTranslations();
  const [optimisticMessages, setOptimisticMessages] = useState<
    OptimisticConversationMessage[]
  >([]);
  const [openActionsConversationId, setOpenActionsConversationId] = useState<
    string | null
  >(null);
  const [typingConversationIds, setTypingConversationIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [locallyReadMessageIds, setLocallyReadMessageIds] = useState<
    Map<string, string | null>
  >(() => new Map());
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const cardsWithOptimisticMessages = useMemo(() => {
    if (!optimisticMessages.length) return cards;

    const latestOptimisticMessages =
      getLatestOptimisticMessages(optimisticMessages);

    return cards
      .map((card) => {
        const optimisticMessage = latestOptimisticMessages.get(
          card.conversation.id,
        );

        if (!optimisticMessage) return card;

        if (isMatchingRealMessage(optimisticMessage, card.lastMessage)) {
          return card;
        }

        return {
          ...card,
          conversation: {
            ...card.conversation,
            last_message_at: optimisticMessage.activityAt,
          },
          lastMessage: optimisticMessage.message,
          lastMessageFromViewer: true,
          lastMessageReadByOther: false,
          activityAt: optimisticMessage.activityAt,
        } satisfies ConversationCard;
      })
      .sort(compareConversationCardsByLatestMessage);
  }, [cards, optimisticMessages]);
  const visibleCards = useMemo(() => {
    if (!normalizedSearch) return cardsWithOptimisticMessages;

    return cardsWithOptimisticMessages.filter((card) =>
      getSearchableConversationText(card, locale, labels, t).includes(
        normalizedSearch,
      ),
    );
  }, [cardsWithOptimisticMessages, labels, locale, normalizedSearch, t]);

  useEffect(() => {
    function handleReadStateChange(event: Event) {
      const detail = (
        event as CustomEvent<{
          conversationId?: string;
          latestMessageId?: string | null;
        }>
      ).detail;
      const conversationId = detail?.conversationId;

      if (!conversationId) return;

      setLocallyReadMessageIds((current) => {
        if (current.get(conversationId) === detail.latestMessageId) {
          return current;
        }

        const next = new Map(current);
        next.set(conversationId, detail.latestMessageId ?? null);
        return next;
      });
    }

    window.addEventListener(
      "pa:messages-read-state-changed",
      handleReadStateChange,
    );

    return () => {
      window.removeEventListener(
        "pa:messages-read-state-changed",
        handleReadStateChange,
      );
    };
  }, []);

  useEffect(() => {
    function handleTypingState(event: Event) {
      const detail = (event as CustomEvent<{ conversationId?: string; active?: boolean }>).detail;
      if (!detail?.conversationId) return;
      setTypingConversationIds((current) => {
        const next = new Set(current);
        if (detail.active) next.add(detail.conversationId!);
        else next.delete(detail.conversationId!);
        return next;
      });
    }

    window.addEventListener(CONVERSATION_TYPING_STATE_EVENT, handleTypingState);
    return () => window.removeEventListener(CONVERSATION_TYPING_STATE_EVENT, handleTypingState);
  }, []);

  useEffect(() => {
    function handleAdd(event: Event) {
      const payload = (event as CustomEvent<OptimisticMessagePayload>).detail;

      if (!payload?.conversationId) return;

      setOptimisticMessages((current) => {
        if (current.some((message) => message.id === payload.id)) {
          return current;
        }

        return [...current, toOptimisticConversationMessage(payload)];
      });
    }

    function handleRemove(event: Event) {
      const id = (event as CustomEvent<string>).detail;

      if (!id) return;

      setOptimisticMessages((current) => {
        const nextMessages = current.filter((message) => message.id !== id);

        return nextMessages.length === current.length ? current : nextMessages;
      });
    }

    window.addEventListener(OPTIMISTIC_MESSAGE_ADD_EVENT, handleAdd);
    window.addEventListener(OPTIMISTIC_MESSAGE_REMOVE_EVENT, handleRemove);

    return () => {
      window.removeEventListener(OPTIMISTIC_MESSAGE_ADD_EVENT, handleAdd);
      window.removeEventListener(OPTIMISTIC_MESSAGE_REMOVE_EVENT, handleRemove);
    };
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setOptimisticMessages((current) => {
        const confirmedMessageIds = new Set<string>();

        cards.forEach((card) => {
          const conversationMessages = current.filter(
            (message) => message.conversationId === card.conversation.id,
          );
          let latestConfirmedIndex = -1;

          conversationMessages.forEach((message, index) => {
            if (isMatchingRealMessage(message, card.lastMessage)) {
              latestConfirmedIndex = index;
            }
          });

          conversationMessages
            .slice(0, latestConfirmedIndex + 1)
            .forEach((message) => confirmedMessageIds.add(message.id));
        });

        const nextMessages = current.filter(
          (message) => !confirmedMessageIds.has(message.id),
        );

        return nextMessages.length === current.length ? current : nextMessages;
      });
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [cards]);

  return (
    <div
      className={`min-w-0 max-w-full ${compact ? "space-y-2" : "space-y-3"}`}
    >
      {visibleCards.map(
        ({
          conversation,
          otherProfile,
          otherProfileName,
          lastMessage,
          unreadCount,
          photoUrl,
          activityAt,
          lastMessageFromViewer,
          lastMessageReadByOther,
          viewerBlockedOtherProfile,
          viewerBlockCooldownUntil,
          isConversationBlocked,
          isAdminEnforcedSeparation,
          isProfileViewInterest,
          notificationId,
          startProfileId,
        }) => {
          const card = {
            conversation,
            otherProfile,
            otherProfileName,
            lastMessage,
            unreadCount,
            photoUrl,
            activityAt,
            lastMessageFromViewer,
            lastMessageReadByOther,
            viewerBlockedOtherProfile,
            viewerBlockCooldownUntil,
            isConversationBlocked,
            isAdminEnforcedSeparation,
            isProfileViewInterest,
            notificationId,
            startProfileId,
          } satisfies ConversationCard;
          const isSelected = conversation.id === selectedConversationId;
          const isLatestMessageLocallyRead =
            locallyReadMessageIds.get(conversation.id) ===
            (lastMessage?.id ?? null);
          const visibleUnreadCount =
            isSelected || isLatestMessageLocallyRead
              ? 0
              : unreadCount;
          const isOtherProfileUnavailable =
            otherProfile?.profile_available === false;
          const isProfileMasked =
            isOtherProfileUnavailable || Boolean(isConversationBlocked);
          const profileName = otherProfileName ?? labels.profile;
          const activityStatus = typingConversationIds.has(conversation.id)
            ? "active"
            : otherProfile?.activity_status;
          const profileLocation = isProfileMasked
            ? ""
            : `${otherProfile?.city ? `${otherProfile.city}, ` : ""}${formatCountryName(
                otherProfile?.country,
                locale,
                t,
              )}`;
          const href = getConversationCardHref(card);
          const unreadLabel =
            visibleUnreadCount > 9 ? "9+" : String(visibleUnreadCount);
          const avatarPhotoUrl = photoUrl
            ? getProfilePhotoVariantUrl(photoUrl, 192)
            : null;

          return (
            <div
              key={conversation.id}
              data-conversation-id={conversation.id}
              data-admin-separated={
                isAdminEnforcedSeparation ? "true" : "false"
              }
              className={`group relative min-w-0 max-w-full ${
                openActionsConversationId === conversation.id ? "z-40" : "z-0"
              }`}
            >
              <Link
                href={href}
                prefetch={false}
                data-pa-navigation-feedback={isSelected ? "off" : undefined}
                scroll={false}
                aria-current={isSelected ? "page" : undefined}
                onClick={(event) => {
                  if (isSelected) {
                    event.preventDefault();
                  }
                }}
                className={`relative block min-w-0 max-w-full overflow-hidden border transition hover:bg-white hover:shadow-sm ${
                  compact
                    ? "rounded-[1.35rem] px-3 py-2.5 shadow-[0_8px_24px_rgba(31,47,53,0.04)]"
                    : "rounded-[1.5rem] p-4 sm:rounded-[1.75rem] sm:p-5"
                } ${
                  isSelected
                    ? "border-[#a7ddea] bg-[#eaf6fa] ring-2 ring-[#bfefff]"
                    : visibleUnreadCount > 0
                      ? "border-[#bfefff] bg-white"
                      : "border-[#d8e0e6] bg-white"
                }`}
              >
                <div
                  className={`absolute z-10 flex items-center gap-1.5 ${
                    compact
                      ? showActions
                        ? "right-12 top-3"
                        : "right-3 top-3"
                      : showActions
                        ? "right-14 top-5"
                        : "right-5 top-5"
                  }`}
                >
                  {lastMessage ? (
                    <time
                      suppressHydrationWarning
                      dateTime={activityAt}
                      data-conversation-time
                      className={`font-bold text-[#25302d]/36 ${
                        compact ? "text-[0.68rem]" : "text-xs sm:text-sm"
                      }`}
                    >
                      {formatConversationListTime(activityAt, locale, t)}
                    </time>
                  ) : null}

                  {visibleUnreadCount > 0 ? (
                    <span
                      aria-label={`${visibleUnreadCount} unread messages`}
                      className={`inline-flex items-center justify-center rounded-full bg-[#bfefff] font-black leading-none text-[#25302d] ring-2 ring-white ${
                        compact
                          ? "h-5 min-w-5 px-1.5 text-[0.64rem]"
                          : "h-6 min-w-6 px-2 text-[0.68rem] shadow-sm"
                      }`}
                    >
                      {unreadLabel}
                    </span>
                  ) : null}
                </div>

                <div
                  className={`flex items-start ${
                    compact
                      ? "min-h-[70px] gap-3 pr-[5.4rem]"
                      : "min-h-[96px] gap-3 pr-24 sm:min-h-[112px] sm:gap-5 sm:pr-36"
                  }`}
                >
                  <div
                    className={`relative shrink-0 overflow-hidden rounded-full ring-1 ring-black/5 ${
                      isProfileMasked
                        ? "bg-[#edf0ef]"
                        : "bg-[#f7f3ed]"
                    } ${
                      compact
                        ? "h-[3.25rem] w-[3.25rem]"
                        : "h-16 w-16 sm:h-20 sm:w-20"
                    }`}
                  >
                    {isConversationBlocked ? (
                      <div className="flex h-full w-full items-center justify-center bg-[#e4e7e9] text-[#747d7a]">
                        <DeletedAccountAvatar className="h-[54%] w-[54%]" />
                      </div>
                    ) : avatarPhotoUrl ? (
                      <Image
                        src={avatarPhotoUrl}
                        alt=""
                        width={compact ? 52 : 80}
                        height={compact ? 52 : 80}
                        unoptimized={shouldBypassImageOptimization(
                          avatarPhotoUrl,
                        )}
                        draggable={false}
                        className="pa-protected-media h-full w-full object-cover"
                      />
                    ) : isOtherProfileUnavailable ? (
                      <div className="flex h-full w-full items-center justify-center text-[#7a8582]">
                        <DeletedAccountAvatar className="h-[52%] w-[52%]" />
                      </div>
                    ) : (
                      <div
                        className={`flex h-full w-full items-center justify-center font-black text-[#25302d]/20 ${
                          compact ? "text-base" : "text-xl"
                        }`}
                      >
                        PA
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div
                      className={`flex min-w-0 items-center gap-2 ${
                        compact ? "pr-2" : "pr-9 sm:pr-0"
                      }`}
                    >
                      <h2
                        className={`min-w-0 max-w-[18ch] truncate font-black tracking-normal text-[#172426] ${
                          compact ? "text-[1.02rem]" : "text-xl sm:text-2xl"
                        }`}
                      >
                        {profileName}
                      </h2>
                      {!isProfileMasked ? (
                        <>
                          <ProfileActivityBadge
                            status={activityStatus}
                            t={t}
                            dotOnly
                            className={
                              compact
                                ? "shrink-0 min-[430px]:hidden"
                                : "hidden"
                            }
                          />
                          <ProfileVerificationBadge
                            status={otherProfile?.verification_status}
                            label={labels.verified}
                            compact
                            iconOnly
                            className="shrink-0"
                          />
                        </>
                      ) : null}
                    </div>

                    <div
                      className={`flex min-h-6 min-w-0 items-center gap-1.5 overflow-hidden ${
                        compact ? "mt-0.5 hidden min-[430px]:flex" : "mt-1"
                      }`}
                    >
                      {!isProfileMasked ? (
                        <ProfileActivityBadge
                          status={activityStatus}
                          t={t}
                          className={`shrink-0 shadow-none ${
                            compact
                              ? "px-2 py-1 text-[0.65rem]"
                              : "px-2.5 py-1 text-[0.7rem]"
                          }`}
                        />
                      ) : null}
                    </div>

                    {!compact && !isProfileMasked ? (
                      <p className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-[#6f8793] sm:mt-2 sm:text-sm sm:tracking-[0.2em]">
                        {formatProfileBadge(
                          otherProfile?.account_type,
                          t,
                        )}
                      </p>
                    ) : null}

                    <div
                      className={`flex min-w-0 items-center gap-1.5 font-bold text-[#25302d]/58 ${
                        compact ? "mt-2 text-[0.82rem]" : "mt-2 text-sm sm:mt-3"
                      } ${visibleUnreadCount > 0 ? "text-[#25302d]" : ""}`}
                    >
                      {lastMessageFromViewer ? (
                        <MessageReadReceipt
                          read={lastMessageReadByOther}
                          compact={compact}
                        />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate">
                        {getLastMessagePreviewText(lastMessage, labels)}
                      </span>
                    </div>

                    {profileLocation ? (
                      <p
                        className={`truncate font-semibold text-[#25302d]/42 ${
                          compact ? "mt-0.5 text-[0.8rem]" : "mt-2 text-sm"
                        }`}
                      >
                        {profileLocation}
                      </p>
                    ) : null}
                  </div>

                </div>
              </Link>

              {showActions &&
              !card.isProfileViewInterest &&
              deleteAction &&
              blockAction &&
              unblockAction &&
              reportAction ? (
                <ConversationActionsMenu
                  conversationId={conversation.id}
                  otherProfileId={
                    isOtherProfileUnavailable ? null : otherProfile?.id
                  }
                  profileName={profileName}
                  isBlockedByViewer={viewerBlockedOtherProfile}
                  actionsDisabled={
                    Boolean(isAdminEnforcedSeparation) ||
                    (Boolean(isConversationBlocked) &&
                      !viewerBlockedOtherProfile)
                  }
                  reportDisabled={Boolean(isConversationBlocked)}
                  blockCooldownUntil={viewerBlockCooldownUntil}
                  labels={labels}
                  deleteAction={deleteAction}
                  blockAction={blockAction}
                  unblockAction={unblockAction}
                  reportAction={reportAction}
                  compact={compact}
                  onDeleteSuccess={onConversationDeleted}
                  onMenuOpenChange={(isOpen) => {
                    setOpenActionsConversationId((current) => {
                      if (isOpen) return conversation.id;

                      return current === conversation.id ? null : current;
                    });
                  }}
                  redirectToMessagesAfterDelete={
                    redirectToMessagesAfterDelete && isSelected
                  }
                />
              ) : null}
            </div>
          );
        },
      )}
    </div>
  );
}
