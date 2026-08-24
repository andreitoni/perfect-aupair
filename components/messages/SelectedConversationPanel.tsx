"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "@/components/i18n/I18nProvider";
import {
  getProfilePhotoVariantUrl,
  shouldBypassImageOptimization,
} from "@/lib/images/optimization";
import { BlockedChatNotice } from "@/components/messages/BlockedChatNotice";
import {
  ConversationMediaButton,
  type ConversationMediaItem,
} from "@/components/messages/ConversationMediaButton";
import { DeletedAccountAvatar } from "@/components/messages/DeletedAccountAvatar";
import {
  ConversationHeaderActions,
  type ConversationActionLabels,
} from "@/components/messages/ConversationHeaderActions";
import { MessageForm } from "@/components/messages/MessageForm";
import { MessageList } from "@/components/messages/MessageList";
import { useConversationTyping } from "@/components/messages/useConversationTyping";
import { ProfileActivityBadge } from "@/components/profile/ProfileActivityBadge";
import { ProfileVerificationBadge } from "@/components/profile/ProfileVerificationBadge";
import {
  formatCountryName,
} from "@/lib/i18n/formatters";
import type { LanguageCode } from "@/lib/i18n/config";

type ActionResult = {
  ok: boolean;
  error?: string;
  errorCode?: "block_cooldown";
  retryAt?: string;
  isConversationBlocked?: boolean;
};

type Conversation = {
  id: string;
  family_id: string;
  au_pair_id: string;
  updated_at: string;
};

type PublicProfile = {
  id: string;
  public_slug?: string | null;
  account_type: "family" | "au_pair";
  full_name: string | null;
  country: string | null;
  city: string | null;
  primary_photo_path: string | null;
  activity_status?: string | null;
  verification_status?: string | null;
  profile_available?: boolean;
};

type MessageWithImageUrl = {
  id: string;
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
};

type SelectedConversationPanelProps = {
  conversation: Conversation;
  otherProfile: PublicProfile;
  otherProfileName: string | null | undefined;
  otherProfileHref: string;
  photoUrl: string | null;
  messages: MessageWithImageUrl[];
  mediaItems: ConversationMediaItem[];
  currentUserId: string;
  lastOutgoingMessageReadByOther: boolean;
  locale: LanguageCode;
  labels: ConversationActionLabels & {
    verified: string;
    blockedByYouTitle: string;
    blockedByYouBody: string;
    blockedChatTitle: string;
    blockedChatBody: string;
    unavailableChatBody: string;
  };
  initialIsConversationBlocked: boolean;
  initialViewerBlockedOtherProfile: boolean;
  initialOtherBlockedViewer: boolean;
  initialIsAdminEnforcedSeparation: boolean;
  initialBlockCooldownUntil: string | null;
  deleteAction: (formData: FormData) => void | Promise<void>;
  blockAction: (formData: FormData) => Promise<ActionResult>;
  unblockAction: (formData: FormData) => Promise<ActionResult>;
  reportAction: (formData: FormData) => Promise<ActionResult>;
  deletePhotoAction: (formData: FormData) => void | Promise<void>;
  sendMessageAction: (formData: FormData) => void | Promise<void>;
};

function UnavailableChatNotice({
  message,
}: {
  message: string;
}) {
  return (
    <div className="border-t border-black/10 bg-white p-3 sm:p-5">
      <div className="rounded-[1.5rem] bg-[var(--background)] px-4 py-5 text-center ring-1 ring-black/5 sm:px-6">
        <p className="mx-auto max-w-3xl text-sm font-black leading-6 text-[#25302d]">
          {message}
        </p>
      </div>
    </div>
  );
}

export function SelectedConversationPanel({
  conversation,
  otherProfile,
  otherProfileName,
  otherProfileHref,
  photoUrl,
  messages,
  mediaItems,
  currentUserId,
  lastOutgoingMessageReadByOther,
  locale,
  labels,
  initialIsConversationBlocked,
  initialViewerBlockedOtherProfile,
  initialOtherBlockedViewer,
  initialIsAdminEnforcedSeparation,
  initialBlockCooldownUntil,
  deleteAction,
  blockAction,
  unblockAction,
  reportAction,
  deletePhotoAction,
  sendMessageAction,
}: SelectedConversationPanelProps) {
  const t = useTranslations();
  const avatarPhotoUrl = photoUrl
    ? getProfilePhotoVariantUrl(photoUrl, 96)
    : null;
  const [viewerBlockedOtherProfile, setViewerBlockedOtherProfile] = useState(
    initialViewerBlockedOtherProfile,
  );
  const [isConversationBlocked, setIsConversationBlocked] = useState(
    initialIsConversationBlocked,
  );
  const [blockCooldownUntil, setBlockCooldownUntil] = useState(
    initialBlockCooldownUntil,
  );
  const [otherBlockedViewer] = useState(initialOtherBlockedViewer);

  function handleBlockStateChange({
    viewerBlockedOtherProfile: nextViewerBlockedOtherProfile,
    isConversationBlocked: nextIsConversationBlocked,
    blockCooldownUntil: nextBlockCooldownUntil,
  }: {
    viewerBlockedOtherProfile: boolean;
    isConversationBlocked?: boolean;
    blockCooldownUntil: string | null;
  }) {
    setViewerBlockedOtherProfile(nextViewerBlockedOtherProfile);
    setBlockCooldownUntil(nextBlockCooldownUntil);
    setIsConversationBlocked(
      nextIsConversationBlocked ??
        (nextViewerBlockedOtherProfile || otherBlockedViewer),
    );
  }

  const isOtherProfileUnavailable = otherProfile.profile_available === false;
  const isEffectivelyBlocked =
    isConversationBlocked || initialIsAdminEnforcedSeparation;
  const isProfileMasked = isOtherProfileUnavailable || isEffectivelyBlocked;
  const viewProfileDisabled =
    isEffectivelyBlocked || isOtherProfileUnavailable;
  const { isOtherTyping, lastOtherTypingAt, updateTyping } = useConversationTyping({
    conversationId: conversation.id,
    currentUserId,
    otherUserId: otherProfile.id,
    enabled: !isEffectivelyBlocked && !isOtherProfileUnavailable,
  });
  const typingLabel = t("messages.typing", {
    name: otherProfileName ?? t("common.profile"),
  });

  return (
    <div
      data-testid="selected-conversation-panel"
      className="flex h-full min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden bg-white"
    >
      <div className="shrink-0 border-b border-black/10 bg-white px-2.5 py-2 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Link
            href="/messages"
            prefetch={false}
            scroll={false}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#182223] shadow-sm ring-1 ring-black/10 transition hover:bg-[var(--background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f8793] lg:hidden"
            aria-label={t("common.goBack")}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 5-7 7 7 7" />
            </svg>
          </Link>

          <Link
            href={viewProfileDisabled ? "#" : otherProfileHref}
            prefetch={false}
            tabIndex={viewProfileDisabled ? -1 : undefined}
            aria-disabled={viewProfileDisabled}
            className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl outline-none transition focus-visible:ring-2 focus-visible:ring-[#6f8793] sm:gap-4 ${
              viewProfileDisabled
                ? "pointer-events-none opacity-75"
                : "hover:opacity-85"
            }`}
            aria-label={t("common.openProfile")}
          >
            <div
              data-testid="conversation-profile-avatar"
              className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-1 ring-black/5 sm:h-16 sm:w-16 ${
                isProfileMasked ? "bg-[#edf0ef]" : "bg-[#f7f3ed]"
              }`}
            >
              {isEffectivelyBlocked ? (
                <div className="flex h-full w-full items-center justify-center bg-[#e4e7e9] text-[#747d7a]">
                  <DeletedAccountAvatar className="h-[54%] w-[54%]" />
                </div>
              ) : avatarPhotoUrl ? (
                <Image
                  src={avatarPhotoUrl}
                  alt=""
                  width={64}
                  height={64}
                  unoptimized={shouldBypassImageOptimization(avatarPhotoUrl)}
                  draggable={false}
                  className="pa-protected-media h-full w-full object-cover"
                />
              ) : isOtherProfileUnavailable ? (
                <div className="flex h-full w-full items-center justify-center text-[#7a8582]">
                  <DeletedAccountAvatar className="h-[52%] w-[52%]" />
                </div>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg font-black text-[#25302d]/25">
                  PA
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 self-center">
              <p className="hidden text-sm font-bold uppercase tracking-[0.18em] text-[#6f8793] sm:block">
                {t("messages.conversation")}
              </p>
              <div className="flex min-h-6 min-w-0 items-center gap-1.5 sm:mt-1 sm:min-h-8 sm:gap-2">
                <h1 className="min-w-0 max-w-[18ch] truncate text-[0.98rem] font-black leading-5 tracking-normal sm:text-2xl sm:leading-8 sm:tracking-[-0.03em]">
                  {otherProfileName ?? t("common.profile")}
                </h1>
                <span
                  className={
                    isOtherProfileUnavailable || isEffectivelyBlocked
                      ? "hidden"
                      : "shrink-0 lg:hidden"
                  }
                >
                  <ProfileActivityBadge
                    status={otherProfile.activity_status}
                    t={t}
                    dotOnly
                  />
                </span>
                <span
                  className={
                    isOtherProfileUnavailable || isEffectivelyBlocked
                      ? "hidden"
                      : "hidden shrink-0 lg:inline-flex"
                  }
                >
                  <ProfileActivityBadge
                    status={otherProfile.activity_status}
                    t={t}
                    className="px-2.5 py-1 text-[0.7rem] shadow-none"
                  />
                </span>
                {!isProfileMasked ? (
                  <ProfileVerificationBadge
                    status={otherProfile.verification_status}
                    label={labels.verified}
                    compact
                    className="shrink-0"
                  />
                ) : null}
              </div>
              {!isProfileMasked ? (
                <p className="mt-0.5 truncate text-xs font-semibold leading-4 text-[#25302d]/50 sm:mt-1 sm:text-sm">
                  {otherProfile.city ? `${otherProfile.city}, ` : ""}
                  {formatCountryName(otherProfile.country, locale, t)}
                </p>
              ) : null}
            </div>
          </Link>

          <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
            {viewProfileDisabled ? (
              <span
                aria-disabled="true"
                className="hidden h-10 w-fit cursor-not-allowed items-center justify-center rounded-full bg-[#eef4f5] px-4 text-sm font-black text-[#25302d]/45 sm:inline-flex"
              >
                {t("common.viewProfile")}
              </span>
            ) : (
              <Link
                href={otherProfileHref}
                prefetch={false}
                className="hidden h-10 w-fit items-center justify-center rounded-full bg-[#eef4f5] px-4 text-sm font-black text-[#25302d] transition hover:bg-[#dfeaec] sm:inline-flex"
              >
                {t("common.viewProfile")}
              </Link>
            )}
            <ConversationMediaButton
              items={mediaItems}
              disabled={
                isEffectivelyBlocked || isOtherProfileUnavailable
              }
            />
            <ConversationHeaderActions
              conversationId={conversation.id}
              otherProfileId={
                isOtherProfileUnavailable ? null : otherProfile.id
              }
              returnTo={`/messages?conversation=${conversation.id}`}
              isBlockedByViewer={viewerBlockedOtherProfile}
              actionsDisabled={
                initialIsAdminEnforcedSeparation ||
                (isEffectivelyBlocked && !viewerBlockedOtherProfile) ||
                isOtherProfileUnavailable
              }
              reportDisabled={isEffectivelyBlocked}
              blockCooldownUntil={blockCooldownUntil}
              labels={labels}
              deleteAction={deleteAction}
              blockAction={blockAction}
              unblockAction={unblockAction}
              reportAction={reportAction}
              onBlockStateChange={handleBlockStateChange}
            />
          </div>
        </div>
      </div>

      <div
        data-message-scroll-container
        className="min-h-0 min-w-0 max-w-full flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-y-none bg-white p-3 sm:p-6"
      >
        <MessageList
          messages={messages}
          currentUserId={currentUserId}
          conversationId={conversation.id}
          lastOutgoingMessageReadByOther={lastOutgoingMessageReadByOther}
          lastOtherTypingAt={lastOtherTypingAt}
          deletePhotoAction={deletePhotoAction}
        />
      </div>

      {isOtherProfileUnavailable ? (
        <UnavailableChatNotice message={labels.unavailableChatBody} />
      ) : isEffectivelyBlocked ? (
        <BlockedChatNotice
          conversationId={conversation.id}
          blockedProfileId={otherProfile.id}
          canUnblock={viewerBlockedOtherProfile}
          labels={{
            title: viewerBlockedOtherProfile
              ? labels.blockedByYouTitle
              : labels.blockedChatTitle,
            body: viewerBlockedOtherProfile
              ? labels.blockedByYouBody
              : labels.blockedChatBody,
            unblock: labels.unblock,
            unblockConfirm: labels.unblockConfirm,
            unblockConfirmBody: labels.unblockConfirmBody,
            unblockConfirmButton: labels.unblockConfirmButton,
            cancel: labels.cancel,
          }}
          unblockAction={unblockAction}
          onUnblockSuccess={handleBlockStateChange}
        />
      ) : (
        <MessageForm
          conversationId={conversation.id}
          currentUserId={currentUserId}
          action={sendMessageAction}
          shouldTrackFirstMessage={messages.length === 0}
          disabled={false}
          isOtherTyping={isOtherTyping}
          typingLabel={typingLabel}
          onTypingChange={updateTyping}
        />
      )}
    </div>
  );
}
