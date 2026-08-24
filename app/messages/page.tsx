import { Header } from "@/components/layout/Header";
import { MessageDeleteConfirm } from "@/components/messages/MessageDeleteConfirm";
import { MarkConversationRead } from "@/components/messages/MarkConversationRead";
import { MessageRealtimeRefresh } from "@/components/messages/MessageRealtimeRefresh";
import { MessagesInboxAutoRefresh } from "@/components/messages/MessagesInboxAutoRefresh";
import { MessagesWorkspace } from "@/components/messages/MessagesWorkspace";
import { SelectedConversationPanel } from "@/components/messages/SelectedConversationPanel";
import type { ConversationMediaItem } from "@/components/messages/ConversationMediaButton";
import { redirectAdminToDashboard } from "@/lib/admin/access";
import {
  getSignedMessageAudioUrl,
  getSignedMessagePhotoUrl,
  getSignedMessageVideoUrl,
} from "@/lib/images/storage";
import { isProfilePairBlocked } from "@/lib/profile/blocks";
import {
  getReblockCooldownCutoff,
  getReblockRetryAt,
} from "@/lib/profile/block-cooldown";
import {
  getPrimaryProfilePhotoUrl,
  getProfilePhotoUrl,
} from "@/lib/profile/photos";
import { getServerTranslator } from "@/lib/i18n/server";
import { formatFamilyDisplayName } from "@/lib/i18n/translations";
import {
  getConversationCards,
  type ConversationCard,
} from "@/lib/messages/conversation-cards";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { submitModerationReportInline } from "@/app/report/actions";
import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import {
  blockProfileFromConversation,
  hideConversationFromInbox,
  unblockProfileFromConversation,
} from "./actions";
import { deleteMessageMedia, sendMessage } from "./[id]/actions";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Messages",
  description: "Read and send Perfect AuPair messages.",
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

type Message = {
  id: string;
  order_key?: number;
  sender_id: string;
  body: string;
  image_path: string | null;
  image_mime_type: string | null;
  video_path: string | null;
  video_mime_type: string | null;
  audio_path: string | null;
  audio_mime_type: string | null;
  audio_duration_seconds: number | null;
  created_at: string;
};

type MessageWithImageUrl = Message & {
  imageUrl: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
};

type StoredMessage = Message & {
  sent_at: string;
  order_key: number;
};

type ProfileViewInterestNotification = {
  id: string;
  actor_profile_id: string | null;
  created_at: string;
  read_at: string | null;
};

type ProfileBlockRow = {
  blocker_id: string;
  blocked_profile_id: string;
  enforced_by_admin: boolean;
};

function getInboxRefreshFingerprint(cards: ConversationCard[]) {
  return cards
    .filter((card) => !card.isProfileViewInterest)
    .map((card) => {
      const hasStoredMessage = Boolean(card.lastMessage?.id);

      return [
        card.conversation.id,
        card.conversation.updated_at ?? "",
        hasStoredMessage ? card.lastMessage?.id : "",
        hasStoredMessage ? card.lastMessage?.sender_id : "",
        hasStoredMessage ? card.lastMessage?.created_at : "",
        hasStoredMessage && card.lastMessageReadByOther ? "read" : "unread",
        hasStoredMessage ? card.unreadCount : 0,
        card.otherProfile?.profile_available === false
          ? "unavailable"
          : "available",
      ].join(":");
    })
    .sort()
    .join("|");
}

async function prepareProfileViewInterestConversation({
  actorProfileId,
  conversationId,
  notificationId,
  viewerId,
}: {
  actorProfileId: string;
  conversationId: string;
  notificationId: string;
  viewerId: string;
}) {
  try {
    const admin = createAdminClient();

    const { data: notification } = await admin
      .from("system_notifications")
      .select("id, actor_profile_id, created_at, read_at")
      .eq("id", notificationId)
      .eq("recipient_id", viewerId)
      .eq("type", "profile_view_interest")
      .eq("actor_profile_id", actorProfileId)
      .maybeSingle<ProfileViewInterestNotification>();

    if (!notification) {
      return;
    }

    const { data: conversation } = await admin
      .from("conversations")
      .select("family_id, au_pair_id")
      .eq("id", conversationId)
      .maybeSingle<{ family_id: string; au_pair_id: string }>();

    if (
      !conversation ||
      conversation.family_id !== actorProfileId ||
      conversation.au_pair_id !== viewerId
    ) {
      return;
    }

    const { count: messageCount } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);

    const now = new Date().toISOString();

    if ((messageCount ?? 0) === 0) {
      await admin.from("conversation_reads").upsert(
        {
          user_id: conversation.family_id,
          conversation_id: conversationId,
          last_read_at: now,
          hidden_at: now,
        },
        { onConflict: "user_id,conversation_id" },
      );
    }

    if (!notification.read_at) {
      await admin
        .from("system_notifications")
        .update({ read_at: now })
        .eq("id", notification.id)
        .eq("recipient_id", viewerId);
    }
  } catch (error) {
    console.warn("Could not prepare profile view interest conversation.", error);
  }
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{
    conversation?: string;
    interest?: string;
    profile?: string;
  }>;
}) {
  const { conversation, interest, profile } = await searchParams;
  const selectedConversationId = conversation ?? null;
  const supabase = await createClient();
  const { locale, t } = await getServerTranslator();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  redirectAdminToDashboard(user);

  const viewerProfilePromise = supabase
    .from("profiles")
    .select("account_type, onboarding_completed")
    .eq("id", user.id)
    .single();
  const viewerProfilePhotoUrlPromise = getPrimaryProfilePhotoUrl(
    supabase,
    user.id,
  );
  const conversationCardsPromise = getConversationCards({
    supabase,
    userId: user.id,
    t,
    selectedConversationId,
  });
  const profileBlocksPromise = createAdminClient()
    .from("profile_blocks")
    .select("blocker_id, blocked_profile_id, enforced_by_admin")
    .or(`blocker_id.eq.${user.id},blocked_profile_id.eq.${user.id}`);
  const [{ data: viewerProfile }, viewerProfilePhotoUrl] = await Promise.all([
    viewerProfilePromise,
    viewerProfilePhotoUrlPromise,
  ]);

  if (!viewerProfile) {
    redirect("/login");
  }

  if (!viewerProfile.onboarding_completed) {
    redirect("/onboarding");
  }

  if (!selectedConversationId && profile) {
    const { data: createdConversationId, error: createError } =
      await supabase.rpc("create_or_get_conversation", {
        p_profile_id: profile,
      });

    if (createError || !createdConversationId) {
      redirect("/messages");
    }

    if (interest && viewerProfile.account_type === "au_pair") {
      await prepareProfileViewInterestConversation({
        actorProfileId: profile,
        conversationId: String(createdConversationId),
        notificationId: interest,
        viewerId: user.id,
      });
    }

    redirect(
      `/messages?conversation=${encodeURIComponent(String(createdConversationId))}`,
    );
  }

  let selectedConversation: Conversation | null = null;
  let otherProfile: PublicProfile | null = null;
  let messagesWithImageUrls: MessageWithImageUrl[] = [];
  let isSelectedConversationBlocked = false;
  let viewerBlockedOtherProfile = false;
  let otherBlockedViewer = false;
  let isAdminEnforcedSeparation = false;
  let selectedBlockCooldownUntil: string | null = null;
  let selectedConversationHiddenAt: string | null = null;
  let latestDeliveredMessageAt: string | null = null;
  let selectedConversationLoadError: {
    code?: string;
    message: string;
  } | null = null;

  if (selectedConversationId) {
    const { data: conversationRow, error: conversationError } = await supabase
      .from("conversations")
      .select("id, family_id, au_pair_id, updated_at")
      .eq("id", selectedConversationId)
      .single<Conversation>();

    if (conversationError || !conversationRow) {
      redirect("/messages");
    }

    const isParticipant =
      user.id === conversationRow.family_id ||
      user.id === conversationRow.au_pair_id;

    if (!isParticipant) {
      redirect("/messages");
    }

    const otherProfileId =
      user.id === conversationRow.family_id
        ? conversationRow.au_pair_id
        : conversationRow.family_id;

    const [
      { data: conversationProfileData },
      pairBlocked,
      { data: recentUnblock },
      { data: profileBlocks },
      { data: conversationRead },
    ] = await Promise.all([
      supabase.rpc("get_message_conversation_profile", {
        p_conversation_id: conversationRow.id,
      }),
      isProfilePairBlocked(supabase, user.id, otherProfileId),
      supabase
        .from("profile_block_events")
        .select("created_at")
        .eq("blocker_id", user.id)
        .eq("blocked_profile_id", otherProfileId)
        .eq("action", "unblocked")
        .gte("created_at", getReblockCooldownCutoff())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ created_at: string }>(),
      profileBlocksPromise,
      supabase
        .from("conversation_reads")
        .select("hidden_at")
        .eq("user_id", user.id)
        .eq("conversation_id", conversationRow.id)
        .maybeSingle<{ hidden_at: string | null }>(),
    ]);

    const publicProfile = ((conversationProfileData ?? []) as PublicProfile[])[0];

    if (!publicProfile) {
      redirect("/messages");
    }

    selectedConversationHiddenAt = conversationRead?.hidden_at ?? null;

    let messagesQuery = supabase
      .from("messages")
      .select(
        "id, sender_id, body, image_path, image_mime_type, video_path, video_mime_type, audio_path, audio_mime_type, audio_duration_seconds, created_at, sent_at, order_key",
      )
      .eq("conversation_id", conversationRow.id);

    if (selectedConversationHiddenAt) {
      messagesQuery = messagesQuery.gt("created_at", selectedConversationHiddenAt);
    }

    const { data: messages, error: messagesError } = await messagesQuery
      .order("order_key", { ascending: true });

    if (messagesError) {
      selectedConversationLoadError = messagesError;
    }

    const storedMessages = (messagesError
      ? []
      : (messages ?? [])) as StoredMessage[];
    latestDeliveredMessageAt = storedMessages.reduce<string | null>(
      (latest, message) =>
        !latest ||
        new Date(message.created_at).getTime() > new Date(latest).getTime()
          ? message.created_at
          : latest,
      null,
    );

    messagesWithImageUrls = await Promise.all(
      storedMessages.map(async (message) => ({
        ...message,
        created_at: message.sent_at,
        imageUrl: await getSignedMessagePhotoUrl(supabase, message.image_path),
        videoUrl: await getSignedMessageVideoUrl(supabase, message.video_path),
        audioUrl: await getSignedMessageAudioUrl(supabase, message.audio_path),
      })),
    );

    selectedConversation = conversationRow;
    const matchingProfileBlocks = (
      (profileBlocks ?? []) as ProfileBlockRow[]
    ).filter(
      (separation) =>
        (separation.blocker_id === user.id &&
          separation.blocked_profile_id === otherProfileId) ||
        (separation.blocker_id === otherProfileId &&
          separation.blocked_profile_id === user.id),
    );
    viewerBlockedOtherProfile = Boolean(
      matchingProfileBlocks.some(
        (profileBlock) =>
          profileBlock.blocker_id === user.id &&
          !profileBlock.enforced_by_admin,
      ),
    );
    isSelectedConversationBlocked =
      pairBlocked || matchingProfileBlocks.length > 0;
    otherBlockedViewer =
      isSelectedConversationBlocked && !viewerBlockedOtherProfile;
    isAdminEnforcedSeparation = Boolean(
      matchingProfileBlocks.some(
        (profileBlock) => profileBlock.enforced_by_admin,
      ),
    );
    otherProfile = isSelectedConversationBlocked
      ? {
          ...publicProfile,
          public_slug: null,
          full_name: null,
          country: null,
          city: null,
          primary_photo_path: null,
          activity_status: null,
          verification_status: null,
        }
      : publicProfile;
    selectedBlockCooldownUntil = recentUnblock
      ? getReblockRetryAt(recentUnblock.created_at)
      : null;
  }

  const [{ cards: loadedCards, error: inboxError }, { data: profileBlocks }] =
    await Promise.all([conversationCardsPromise, profileBlocksPromise]);
  const pageLoadError = inboxError ?? selectedConversationLoadError;
  const profileBlocksByOtherProfileId = new Map<string, ProfileBlockRow[]>();
  ((profileBlocks ?? []) as ProfileBlockRow[]).forEach((profileBlock) => {
    const otherProfileId =
      profileBlock.blocker_id === user.id
        ? profileBlock.blocked_profile_id
        : profileBlock.blocker_id;
    const existingBlocks =
      profileBlocksByOtherProfileId.get(otherProfileId) ?? [];

    existingBlocks.push(profileBlock);
    profileBlocksByOtherProfileId.set(otherProfileId, existingBlocks);
  });
  const cards = loadedCards.map((card) => {
    const matchingProfileBlocks = card.otherProfile
      ? (profileBlocksByOtherProfileId.get(card.otherProfile.id) ?? [])
      : [];
    const isConversationBlocked = matchingProfileBlocks.length > 0;
    const isAdminEnforcedSeparation = matchingProfileBlocks.some(
      (profileBlock) => profileBlock.enforced_by_admin,
    );

    if (!isConversationBlocked) return card;

    return {
      ...card,
      photoUrl: null,
      otherProfileName: t("messages.userUnavailable"),
      otherProfile: card.otherProfile
        ? {
            ...card.otherProfile,
            public_slug: null,
            full_name: null,
            country: null,
            city: null,
            primary_photo_path: null,
            activity_status: null,
            verification_status: null,
          }
        : null,
      viewerBlockedOtherProfile: Boolean(
        matchingProfileBlocks.some(
          (profileBlock) =>
            profileBlock.blocker_id === user.id &&
            !profileBlock.enforced_by_admin,
        ),
      ),
      isConversationBlocked: true,
      isAdminEnforcedSeparation,
    };
  });

  const selectedConversationCard = selectedConversation
    ? cards.find((card) => card.conversation.id === selectedConversation.id) ?? null
    : null;
  let lastOutgoingMessageReadByOther = false;

  for (
    let index = messagesWithImageUrls.length - 1;
    index >= 0;
    index -= 1
  ) {
    const message = messagesWithImageUrls[index];

    if (!message || message.sender_id !== user.id) {
      continue;
    }

    const hasLaterIncomingMessage = messagesWithImageUrls
      .slice(index + 1)
      .some((laterMessage) => laterMessage.sender_id !== user.id);

    lastOutgoingMessageReadByOther =
      hasLaterIncomingMessage ||
      Boolean(
        selectedConversationCard?.lastMessage?.id === message.id &&
          selectedConversationCard.lastMessageReadByOther,
      );
    break;
  }

  const inboxRefreshFingerprint = getInboxRefreshFingerprint(cards);
  const labels = {
    profile: t("common.profile"),
    photo: t("common.photo"),
    message: t("common.message"),
    noMessages: t("messages.noMessages"),
    deleteConversation: t("messages.deleteConversation"),
    deleteConversationConfirm: t("messages.deleteConversationConfirm"),
    moreConversationActions: t("messages.moreConversationActions"),
    verified: t("verification.verified"),
    messages: t("nav.messages"),
    searchPlaceholder: t("messages.searchPlaceholder"),
    newMessage: t("messages.newMessage"),
    yourMessages: t("messages.yourMessages"),
    sendMessage: t("messages.sendMessage"),
    searchProfilesPlaceholder: t("messages.searchProfilesPlaceholder"),
    noMatches: t("messages.noMatches"),
    firstMessage: t("messages.firstMessage"),
    startingConversation: t("messages.startingConversation"),
    couldNotStartConversation: t("messages.couldNotStartConversation"),
    to: t("messages.to"),
    close: t("common.close"),
    cancel: t("common.cancel"),
    blockProfile: t("messages.blockProfile"),
    blockProfileConfirm: t("messages.blockProfileConfirm"),
    blockProfileConfirmButton: t("messages.blockProfileConfirmButton"),
    unblockProfile: t("messages.unblockProfile"),
    unblockProfileConfirm: t("messages.unblockProfileConfirm"),
    unblockProfileConfirmBody: t("messages.unblockProfileConfirmBody"),
    unblockProfileConfirmButton: t("messages.unblockProfileConfirmButton"),
    reportProfile: t("messages.reportProfile"),
    reportIntro: t("report.intro"),
    reportCategory: t("report.category"),
    reportChooseCategory: t("report.chooseCategory"),
    reportCategoryFake: t("report.categoryFake"),
    reportCategoryInappropriate: t("report.categoryInappropriate"),
    reportCategorySpam: t("report.categorySpam"),
    reportCategoryHarassment: t("report.categoryHarassment"),
    reportCategoryPrivacy: t("report.categoryPrivacy"),
    reportCategoryOther: t("report.categoryOther"),
    reportReason: t("report.reason"),
    reportChooseReason: t("report.chooseReason"),
    reportReasonFake: t("report.reasonFake"),
    reportReasonInappropriate: t("report.reasonInappropriate"),
    reportReasonSpam: t("report.reasonSpam"),
    reportReasonHarassment: t("report.reasonHarassment"),
    reportReasonOther: t("report.reasonOther"),
    reportDetails: t("report.details"),
    reportDetailsPlaceholder: t("report.detailsPlaceholder"),
    reportSend: t("report.send"),
    reportSent: t("report.sent"),
    reportSentText: t("report.sentText"),
  };

  const photoUrl = getProfilePhotoUrl(
    supabase,
    isSelectedConversationBlocked
      ? null
      : (otherProfile?.primary_photo_path ?? null),
  );
  const otherProfileName =
    isSelectedConversationBlocked
      ? t("messages.userUnavailable")
      : otherProfile?.profile_available === false
      ? t("messages.userUnavailable")
      : otherProfile?.account_type === "family"
        ? formatFamilyDisplayName(otherProfile.full_name, locale)
        : otherProfile?.full_name;
  const selectedProfileName = otherProfileName ?? t("common.profile");
  const otherProfileHref =
    otherProfile &&
    !isSelectedConversationBlocked &&
    otherProfile.profile_available !== false
      ? `/profile/${otherProfile.public_slug ?? otherProfile.id}`
      : "";
  const selectedConversationMediaItems: ConversationMediaItem[] =
    selectedConversation && otherProfile
      ? messagesWithImageUrls
          .filter(
            (
              message,
            ): message is MessageWithImageUrl & {
              imageUrl: string | null;
              videoUrl: string | null;
            } => Boolean(message.imageUrl || message.videoUrl),
          )
          .map((message) => ({
            id: message.id,
            type: message.videoUrl ? ("video" as const) : ("image" as const),
            url: message.videoUrl ?? message.imageUrl ?? "",
            mimeType: message.videoUrl
              ? message.video_mime_type
              : message.image_mime_type,
            createdAt: message.created_at,
            senderName:
              message.sender_id === user.id
                ? t("messages.you")
                : selectedProfileName,
          }))
      : [];
  const showPageChrome = !selectedConversation;
  const showDesktopPageChrome = Boolean(selectedConversation);

  if (pageLoadError) {
    Sentry.captureException(new Error(pageLoadError.message), {
      tags: {
        area: selectedConversationLoadError
          ? "message_conversation_load"
          : "message_inbox_load",
        supabase_code: pageLoadError.code ?? "unknown",
      },
    });
    console.error("Could not load messages.", pageLoadError);
  }

  return (
    <main
      data-clarity-mask="true"
      data-hj-suppress=""
      data-messages-gesture-lock="true"
      className={[
        "flex touch-none flex-col overscroll-none bg-[var(--background)] text-[#25302d] lg:touch-auto",
        showPageChrome
          ? "min-h-screen"
          : "fixed inset-x-0 top-[var(--pa-message-viewport-offset-top,0px)] z-50 h-[var(--pa-message-viewport-height,100svh)] overflow-hidden lg:static lg:z-auto lg:h-auto lg:min-h-screen lg:overflow-visible",
      ].join(" ")}
    >
      {selectedConversation ? (
        <>
          <MessageDeleteConfirm />
          <MessageRealtimeRefresh
            conversationId={selectedConversation.id}
            messageVisibilityAfter={selectedConversationHiddenAt}
            initialMessageCount={messagesWithImageUrls.length}
            initialLatestMessageAt={latestDeliveredMessageAt}
            initialConversationUpdatedAt={selectedConversation.updated_at}
            initialIsConversationBlocked={isSelectedConversationBlocked}
          />
          <MarkConversationRead
            conversationId={selectedConversation.id}
            hasUnreadMessages={Boolean(selectedConversationCard?.unreadCount)}
            latestMessageId={selectedConversationCard?.lastMessage?.id ?? null}
            latestMessageAt={latestDeliveredMessageAt}
            messageCount={messagesWithImageUrls.length}
            refreshAfterMark={false}
          />
        </>
      ) : null}
      {!selectedConversation ? (
        <MessagesInboxAutoRefresh
          initialFingerprint={inboxRefreshFingerprint}
        />
      ) : null}
      {showPageChrome ? (
        <Header
          subtitle="nav.messages"
          authState="authenticated"
          accountType={viewerProfile.account_type}
          initialProfilePhotoUrl={viewerProfilePhotoUrl}
          width="full"
        />
      ) : showDesktopPageChrome ? (
        <div className="hidden lg:block">
          <Header
            subtitle="nav.messages"
            authState="authenticated"
            accountType={viewerProfile.account_type}
            initialProfilePhotoUrl={viewerProfilePhotoUrl}
            showMobileNavigation={false}
            width="full"
          />
        </div>
      ) : null}

      {pageLoadError ? (
        <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 sm:px-8 sm:py-8">
          <div className="rounded-[1.5rem] bg-red-50 p-5 text-sm font-semibold text-red-700">
            {t("common.errorTryAgain")}
          </div>
        </section>
      ) : (
        <MessagesWorkspace
          cards={cards}
          locale={locale}
          labels={labels}
          selectedConversationId={selectedConversation?.id}
          appHeaderVisible={showPageChrome}
          desktopAppHeaderVisible={showPageChrome || showDesktopPageChrome}
          suggestionCacheKey={user.id}
          deleteAction={hideConversationFromInbox}
          blockAction={blockProfileFromConversation}
          unblockAction={unblockProfileFromConversation}
          reportAction={submitModerationReportInline}
        >
          {selectedConversation && otherProfile ? (
            <SelectedConversationPanel
              key={[
                selectedConversation.id,
                isSelectedConversationBlocked ? "blocked" : "open",
                viewerBlockedOtherProfile ? "viewer-blocked" : "viewer-open",
                otherBlockedViewer ? "other-blocked" : "other-open",
                selectedBlockCooldownUntil ?? "no-cooldown",
              ].join(":")}
              conversation={selectedConversation}
              otherProfile={otherProfile}
              otherProfileName={otherProfileName}
              otherProfileHref={otherProfileHref}
              photoUrl={photoUrl}
              messages={messagesWithImageUrls}
              mediaItems={selectedConversationMediaItems}
              currentUserId={user.id}
              lastOutgoingMessageReadByOther={
                lastOutgoingMessageReadByOther
              }
              locale={locale}
              labels={{
                moreActions: labels.moreConversationActions,
                deleteChat: labels.deleteConversation,
                deleteChatConfirm: labels.deleteConversationConfirm,
                report: labels.reportProfile,
                block: labels.blockProfile,
                unblock: labels.unblockProfile,
                blockConfirm: t("messages.blockProfileConfirm", {
                  name: selectedProfileName,
                }),
                unblockConfirm: t("messages.unblockProfileConfirm", {
                  name: selectedProfileName,
                }),
                unblockConfirmBody: t("messages.unblockProfileConfirmBody", {
                  name: selectedProfileName,
                }),
                blockConfirmButton: labels.blockProfileConfirmButton,
                unblockConfirmButton: labels.unblockProfileConfirmButton,
                cancel: t("common.cancel"),
                close: t("common.close"),
                reportIntro: labels.reportIntro,
                reportCategory: labels.reportCategory,
                reportChooseCategory: labels.reportChooseCategory,
                reportCategoryFake: labels.reportCategoryFake,
                reportCategoryInappropriate:
                  labels.reportCategoryInappropriate,
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
                verified: labels.verified,
                blockedByYouTitle: t("messages.blockedByYouTitle", {
                  name: selectedProfileName,
                }),
                blockedByYouBody: t("messages.blockedByYouBody", {
                  name: selectedProfileName,
                }),
                blockedChatTitle: t("messages.blockedChatTitle"),
                blockedChatBody: t("messages.blockedChatBody"),
                unavailableChatBody: t("messages.unavailableChatBody"),
              }}
              initialIsConversationBlocked={isSelectedConversationBlocked}
              initialViewerBlockedOtherProfile={viewerBlockedOtherProfile}
              initialOtherBlockedViewer={otherBlockedViewer}
              initialIsAdminEnforcedSeparation={isAdminEnforcedSeparation}
              initialBlockCooldownUntil={selectedBlockCooldownUntil}
              deleteAction={hideConversationFromInbox}
              blockAction={blockProfileFromConversation}
              unblockAction={unblockProfileFromConversation}
              reportAction={submitModerationReportInline}
              deletePhotoAction={deleteMessageMedia}
              sendMessageAction={sendMessage}
            />
          ) : null}
        </MessagesWorkspace>
      )}
    </main>
  );
}
