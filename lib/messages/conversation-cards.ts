import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImageStorageClient } from "@/lib/images/storage";
import { getProfilePhotoUrl } from "@/lib/profile/photos";
import {
  getReblockCooldownCutoff,
  getReblockRetryAt,
} from "@/lib/profile/block-cooldown";
import { formatFamilyDisplayName } from "@/lib/i18n/formatters";
import type { Translate } from "@/lib/i18n/translations";
import { isMessageProfileAvailable } from "@/lib/messages/profile-availability";

export type Conversation = {
  id: string;
  family_id: string;
  au_pair_id: string;
  created_at: string;
  updated_at: string | null;
  last_message_at: string | null;
};

export type PublicProfile = {
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

export type MessageRow = {
  id?: string;
  order_key?: number | null;
  sender_id?: string | null;
  content?: string | null;
  body?: string | null;
  message?: string | null;
  text?: string | null;
  message_text?: string | null;
  image_path?: string | null;
  image_mime_type?: string | null;
  video_path?: string | null;
  video_mime_type?: string | null;
  audio_path?: string | null;
  audio_mime_type?: string | null;
  image_url?: string | null;
  photo_path?: string | null;
  attachment_path?: string | null;
  created_at?: string | null;
};

type InboxCardRow = {
  conversation_id: string;
  family_id: string;
  au_pair_id: string;
  created_at: string;
  updated_at: string | null;
  last_message_at: string | null;
  activity_at: string;
  other_profile_id: string;
  other_account_type: "family" | "au_pair";
  other_public_slug: string | null;
  other_full_name: string | null;
  other_country: string | null;
  other_city: string | null;
  other_primary_photo_path: string | null;
  other_activity_status?: string | null;
  other_verification_status?: string | null;
  other_profile_available?: boolean | null;
  last_message_id: string | null;
  last_message_order_key: number | null;
  last_message_sender_id: string | null;
  last_message_body: string | null;
  last_message_image_path: string | null;
  last_message_image_mime_type: string | null;
  last_message_video_path: string | null;
  last_message_video_mime_type: string | null;
  last_message_audio_path: string | null;
  last_message_audio_mime_type: string | null;
  last_message_created_at: string | null;
  last_message_read_by_other: boolean | null;
  unread_count: number | null;
};

export type ConversationCard = {
  conversation: Conversation;
  otherProfile: PublicProfile | null;
  otherProfileName: string | null;
  lastMessage: MessageRow | null;
  unreadCount: number;
  photoUrl: string | null;
  activityAt: string;
  lastMessageFromViewer: boolean;
  lastMessageReadByOther: boolean;
  viewerBlockedOtherProfile: boolean;
  viewerBlockCooldownUntil: string | null;
  isConversationBlocked?: boolean;
  isAdminEnforcedSeparation?: boolean;
  isProfileViewInterest?: boolean;
  notificationId?: string | null;
  startProfileId?: string | null;
};

type ConversationListClient = SupabaseClient & ImageStorageClient;

type ProfileViewInterestNotificationRow = {
  id: string;
  actor_profile_id: string | null;
  created_at: string;
  read_at: string | null;
};

export function getConversationActivityAt(conversation: Conversation) {
  return conversation.last_message_at ?? conversation.created_at;
}

export function compareConversationCardsByLatestMessage(
  firstCard: ConversationCard,
  secondCard: ConversationCard,
) {
  const firstHasMessage = Boolean(firstCard.lastMessage);
  const secondHasMessage = Boolean(secondCard.lastMessage);

  if (firstHasMessage !== secondHasMessage) {
    return firstHasMessage ? -1 : 1;
  }

  const firstOrderKey = firstCard.lastMessage?.order_key;
  const secondOrderKey = secondCard.lastMessage?.order_key;

  if (
    typeof firstOrderKey === "number" &&
    typeof secondOrderKey === "number" &&
    firstOrderKey !== secondOrderKey
  ) {
    return secondOrderKey - firstOrderKey;
  }

  return (
    getCardActivityTimestamp(secondCard.activityAt) -
    getCardActivityTimestamp(firstCard.activityAt)
  );
}

export function getLastMessagePreview(
  message: MessageRow | null,
  t: Translate,
) {
  if (!message) return t("messages.noMessages");

  const text =
    message.content ??
    message.body ??
    message.message ??
    message.text ??
    message.message_text;

  if (typeof text === "string" && text.trim()) {
    return text;
  }

  if (message.video_path) {
    return t("common.video");
  }

  if (message.audio_path) {
    return t("messages.voiceMessage");
  }

  if (
    message.image_path ||
    message.image_url ||
    message.photo_path ||
    message.attachment_path
  ) {
    return t("common.photo");
  }

  return t("common.message");
}

async function getViewerBlockedProfileIds(
  supabase: ConversationListClient,
  userId: string,
  profileIds: string[],
) {
  const uniqueProfileIds = Array.from(new Set(profileIds));

  if (uniqueProfileIds.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await supabase
    .from("profile_blocks")
    .select("blocked_profile_id")
    .eq("blocker_id", userId)
    .eq("enforced_by_admin", false)
    .in("blocked_profile_id", uniqueProfileIds);

  if (error) {
    return new Set<string>();
  }

  return new Set(
    ((data ?? []) as { blocked_profile_id: string | null }[])
      .map((row) => row.blocked_profile_id)
      .filter((profileId): profileId is string => Boolean(profileId)),
  );
}

async function getViewerBlockCooldowns(
  supabase: ConversationListClient,
  userId: string,
  profileIds: string[],
) {
  const uniqueProfileIds = Array.from(new Set(profileIds));

  if (uniqueProfileIds.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase
    .from("profile_block_events")
    .select("blocked_profile_id, created_at")
    .eq("blocker_id", userId)
    .eq("action", "unblocked")
    .gte("created_at", getReblockCooldownCutoff())
    .in("blocked_profile_id", uniqueProfileIds)
    .order("created_at", { ascending: false });

  if (error) {
    return new Map<string, string>();
  }

  const cooldowns = new Map<string, string>();

  ((data ?? []) as {
    blocked_profile_id: string | null;
    created_at: string | null;
  }[]).forEach((row) => {
    if (!row.blocked_profile_id || !row.created_at) return;
    if (cooldowns.has(row.blocked_profile_id)) return;

    const retryAt = getReblockRetryAt(row.created_at);
    if (retryAt) {
      cooldowns.set(row.blocked_profile_id, retryAt);
    }
  });

  return cooldowns;
}

async function getExistingConversationProfileIds(
  supabase: ConversationListClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("conversations")
    .select("family_id, au_pair_id")
    .or(`family_id.eq.${userId},au_pair_id.eq.${userId}`);

  if (error) {
    return new Set<string>();
  }

  return new Set(
    ((data ?? []) as Array<{ family_id: string; au_pair_id: string }>)
      .map((conversation) =>
        conversation.family_id === userId
          ? conversation.au_pair_id
          : conversation.family_id,
      )
      .filter(Boolean),
  );
}

async function loadProfileViewInterestNotifications(
  supabase: ConversationListClient,
) {
  const { data: notifications, error } = await supabase
    .from("system_notifications")
    .select("id, actor_profile_id, created_at, read_at")
    .eq("type", "profile_view_interest")
    .not("actor_profile_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(10)
    .returns<ProfileViewInterestNotificationRow[]>();

  if (error || !notifications?.length) {
    return [];
  }

  return notifications.filter((notification) => notification.actor_profile_id);
}

async function getProfileViewInterestCards({
  existingProfileIds,
  notifications,
  supabase,
  t,
  userId,
}: {
  existingProfileIds: Set<string>;
  notifications: ProfileViewInterestNotificationRow[];
  supabase: ConversationListClient;
  t: Translate;
  userId: string;
}) {
  const notificationRows = notifications.filter(
    (notification) =>
      notification.actor_profile_id &&
      !existingProfileIds.has(notification.actor_profile_id),
  );

  const cards: Array<ConversationCard | null> = await Promise.all(
    notificationRows.map(async (notification) => {
      const actorProfileId = notification.actor_profile_id;

      if (!actorProfileId) return null;

      const { data: publicProfileData } = await supabase.rpc(
        "get_public_profile",
        {
          p_profile_id: actorProfileId,
        },
      );
      const otherProfile = ((publicProfileData ?? []) as PublicProfile[])[0];

      if (!otherProfile || otherProfile.account_type !== "family") {
        return null;
      }

      const otherProfileName =
        formatFamilyDisplayName(otherProfile.full_name, t) ??
        t("common.family");

      return {
        conversation: {
          id: `profile-view-interest:${notification.id}`,
          family_id: actorProfileId,
          au_pair_id: userId,
          created_at: notification.created_at,
          updated_at: null,
          last_message_at: notification.created_at,
        },
        otherProfile,
        otherProfileName,
        lastMessage: {
          body: t("messages.profileViewInterestPreview", {
            name: otherProfileName,
          }),
          created_at: notification.created_at,
        },
        unreadCount: notification.read_at ? 0 : 1,
        lastMessageFromViewer: false,
        lastMessageReadByOther: false,
        photoUrl: getProfilePhotoUrl(supabase, otherProfile.primary_photo_path),
        activityAt: notification.created_at,
        viewerBlockedOtherProfile: false,
        viewerBlockCooldownUntil: null,
        isProfileViewInterest: true,
        notificationId: notification.id,
        startProfileId: actorProfileId,
      } satisfies ConversationCard;
    }),
  );

  return cards.filter((card): card is ConversationCard => Boolean(card));
}

async function withProfileViewInterestCards({
  cards,
  supabase,
  t,
  userId,
}: {
  cards: ConversationCard[];
  supabase: ConversationListClient;
  t: Translate;
  userId: string;
}) {
  const [notifications, existingConversationProfileIds] = await Promise.all([
    loadProfileViewInterestNotifications(supabase),
    getExistingConversationProfileIds(supabase, userId),
  ]);
  const latestNotificationByActorId = new Map<
    string,
    ProfileViewInterestNotificationRow
  >();

  notifications.forEach((notification) => {
    const actorProfileId = notification.actor_profile_id;

    if (!actorProfileId) return;

    const current = latestNotificationByActorId.get(actorProfileId);

    if (
      !current ||
      new Date(notification.created_at).getTime() >
        new Date(current.created_at).getTime()
    ) {
      latestNotificationByActorId.set(actorProfileId, notification);
    }
  });

  const cardsWithInterestPreview = cards.map((card) => {
    const actorProfileId = card.otherProfile?.id;
    const notification = actorProfileId
      ? latestNotificationByActorId.get(actorProfileId)
      : null;

    if (!notification || card.lastMessage) {
      return card;
    }

    const profileName =
      card.otherProfileName ?? t("common.family");

    return {
      ...card,
      lastMessage: {
        body: t("messages.profileViewInterestPreview", {
          name: profileName,
        }),
        created_at: notification.created_at,
      },
      unreadCount: notification.read_at ? card.unreadCount : 1,
      lastMessageFromViewer: false,
      lastMessageReadByOther: false,
      activityAt:
        getCardActivityTimestamp(notification.created_at) >
        getCardActivityTimestamp(card.activityAt)
          ? notification.created_at
          : card.activityAt,
    } satisfies ConversationCard;
  });

  const existingProfileIds = new Set(
    cardsWithInterestPreview
      .map((card) => card.otherProfile?.id)
      .filter((profileId): profileId is string => Boolean(profileId)),
  );
  existingConversationProfileIds.forEach((profileId) => {
    existingProfileIds.add(profileId);
  });
  const profileViewInterestCards = await getProfileViewInterestCards({
    existingProfileIds,
    notifications,
    supabase,
    t,
    userId,
  });

  if (!profileViewInterestCards.length) {
    return cardsWithInterestPreview.sort(
      compareConversationCardsByLatestMessage,
    );
  }

  return [...cardsWithInterestPreview, ...profileViewInterestCards].sort(
    compareConversationCardsByLatestMessage,
  );
}

function getCardActivityTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

export async function getConversationCards({
  supabase,
  userId,
  t,
  selectedConversationId = null,
}: {
  supabase: ConversationListClient;
  userId: string;
  t: Translate;
  selectedConversationId?: string | null;
}) {
  const { data: inboxCards, error: inboxCardsError } = await supabase.rpc(
    "get_message_inbox_cards",
  );

  if (!inboxCardsError) {
    const inboxRows = (inboxCards ?? []) as InboxCardRow[];
    const visibleInboxRows = inboxRows.filter(
      (row) =>
        Boolean(row.last_message_id) ||
        row.conversation_id === selectedConversationId,
    );
    const cards = visibleInboxRows.map((row) => {
      const otherProfile: PublicProfile = {
        id: row.other_profile_id,
        public_slug: row.other_public_slug,
        account_type: row.other_account_type,
        full_name: row.other_full_name,
        country: row.other_country,
        city: row.other_city,
        primary_photo_path: row.other_primary_photo_path,
        activity_status: row.other_activity_status ?? null,
        verification_status: row.other_verification_status ?? null,
        profile_available: isMessageProfileAvailable(
          row.other_profile_available,
        ),
      };

      return {
        conversation: {
          id: row.conversation_id,
          family_id: row.family_id,
          au_pair_id: row.au_pair_id,
          created_at: row.created_at,
          updated_at: row.updated_at,
          last_message_at: row.last_message_at,
        },
        otherProfile,
        otherProfileName: otherProfile.profile_available === false
          ? t("messages.userUnavailable")
          : otherProfile.account_type === "family"
            ? formatFamilyDisplayName(otherProfile.full_name, t)
            : otherProfile.full_name,
        lastMessage: row.last_message_created_at
          ? {
              id: row.last_message_id ?? undefined,
              order_key: row.last_message_order_key,
              sender_id: row.last_message_sender_id,
              body: row.last_message_body,
              image_path: row.last_message_image_path,
              image_mime_type: row.last_message_image_mime_type,
              video_path: row.last_message_video_path,
              video_mime_type: row.last_message_video_mime_type,
              audio_path: row.last_message_audio_path,
              audio_mime_type: row.last_message_audio_mime_type,
              created_at: row.last_message_created_at,
            }
          : null,
        unreadCount: Number(row.unread_count ?? 0),
        lastMessageFromViewer: row.last_message_sender_id === userId,
        lastMessageReadByOther: Boolean(row.last_message_read_by_other),
        photoUrl: getProfilePhotoUrl(
          supabase,
          otherProfile.primary_photo_path,
        ),
        activityAt: row.last_message_created_at ?? row.created_at,
        viewerBlockedOtherProfile: false,
        viewerBlockCooldownUntil: null,
      } satisfies ConversationCard;
    }).sort(compareConversationCardsByLatestMessage);

    const profileIds = visibleInboxRows.map((row) => row.other_profile_id);
    const [viewerBlockedProfileIds, viewerBlockCooldowns, cardsWithInterest] =
      await Promise.all([
        getViewerBlockedProfileIds(supabase, userId, profileIds),
        getViewerBlockCooldowns(supabase, userId, profileIds),
        withProfileViewInterestCards({
          cards,
          supabase,
          t,
          userId,
        }),
      ]);

    const decoratedCards = cardsWithInterest.map((card) => ({
      ...card,
      viewerBlockedOtherProfile: card.otherProfile
        ? viewerBlockedProfileIds.has(card.otherProfile.id)
        : false,
      viewerBlockCooldownUntil: card.otherProfile
        ? viewerBlockCooldowns.get(card.otherProfile.id) ?? null
        : null,
    }));
    const selectedEmptyCardIndex = decoratedCards.findIndex(
      (card) =>
        card.conversation.id === selectedConversationId &&
        !card.conversation.last_message_at,
    );

    if (selectedEmptyCardIndex > 0) {
      const [selectedEmptyCard] = decoratedCards.splice(
        selectedEmptyCardIndex,
        1,
      );

      if (selectedEmptyCard) {
        decoratedCards.unshift(selectedEmptyCard);
      }
    }

    return {
      cards: decoratedCards,
      error: null,
    };
  }

  return {
    cards: [],
    error: inboxCardsError,
  };
}
