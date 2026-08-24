import { AdminLink as Link } from "@/components/admin/AdminLink";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import {
  AdminPageHeader,
  AdminWorkspace,
} from "@/components/admin/AdminWorkspace";
import { MessageAudio } from "@/components/messages/MessageAudio";
import { MessageImage } from "@/components/messages/MessageImage";
import { MessageVideo } from "@/components/messages/MessageVideo";
import {
  getSignedMessageAudioUrl,
  getSignedMessagePhotoUrl,
  getSignedMessageVideoUrl,
} from "@/lib/images/storage";
import { formatMessageClock } from "@/lib/messages/date-format";
import { requireAdminUser } from "@/lib/admin/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatAdminDate } from "@/lib/admin/date-format";
import {
  safeAdminReturnTo,
  withAdminNavigationContext,
  withAdminReturnTo,
} from "@/lib/admin/navigation";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type ConversationRow = {
  id: string;
  family_id: string;
  au_pair_id: string;
  created_at: string;
  updated_at: string | null;
  last_message_at: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  account_type: "family" | "au_pair";
  full_name: string | null;
  city: string | null;
  country: string | null;
};

type MessageRow = {
  id: string;
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

type StoredMessageRow = MessageRow & {
  sent_at: string;
  order_key: number;
};

type RetainedMessagePhotoRow = {
  id: string;
  message_id: string | null;
  conversation_id: string | null;
  sender_id: string | null;
  original_image_path: string;
  image_mime_type: string | null;
  retained_until: string;
  created_at: string;
};

type RetainedMessagePhotoWithUrl = RetainedMessagePhotoRow & {
  imageUrl: string | null;
};

type RetainedMessageVideoRow = {
  id: string;
  message_id: string | null;
  conversation_id: string | null;
  sender_id: string | null;
  original_video_path: string;
  video_mime_type: string | null;
  video_size_bytes: number | null;
  video_duration_seconds: number | null;
  retained_until: string;
  created_at: string;
};

type RetainedMessageVideoWithUrl = RetainedMessageVideoRow & {
  videoUrl: string | null;
};

type RetainedMessageAudioRow = {
  id: string;
  message_id: string | null;
  conversation_id: string | null;
  sender_id: string | null;
  original_audio_path: string;
  audio_mime_type: string | null;
  audio_size_bytes: number | null;
  audio_duration_seconds: number | null;
  retained_until: string;
  created_at: string;
};

type RetainedMessageAudioWithUrl = RetainedMessageAudioRow & {
  audioUrl: string | null;
};

type MessageWithImageUrl = MessageRow & {
  imageUrl: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  deletedPhotos: RetainedMessagePhotoWithUrl[];
  deletedVideos: RetainedMessageVideoWithUrl[];
  deletedAudio: RetainedMessageAudioWithUrl[];
};

type ConversationTimelineItem =
  | {
      kind: "message";
      sortAt: string;
      message: MessageWithImageUrl;
    }
  | {
      kind: "retained-photo";
      sortAt: string;
      retainedPhoto: RetainedMessagePhotoWithUrl;
    }
  | {
      kind: "retained-video";
      sortAt: string;
      retainedVideo: RetainedMessageVideoWithUrl;
    }
  | {
      kind: "retained-audio";
      sortAt: string;
      retainedAudio: RetainedMessageAudioWithUrl;
    };

function profileLabel(profile?: ProfileRow | null) {
  if (!profile) return "Unknown profile";

  return profile.full_name || profile.email || profile.id;
}

const formatDate = formatAdminDate;

function firstSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function legacyConversationFallback(view?: string | string[]) {
  const candidate = firstSearchParam(view);

  if (candidate === "overview") return "/admin#workspace";
  if (
    candidate === "review" ||
    candidate === "members" ||
    candidate === "system"
  ) {
    return `/admin?view=${candidate}#workspace`;
  }

  return "/admin?view=conversations#workspace";
}

function conversationAdminArea(view?: string | string[]) {
  const candidate = firstSearchParam(view);

  return candidate === "overview" ||
    candidate === "review" ||
    candidate === "members" ||
    candidate === "system"
    ? candidate
    : "conversations";
}

export default async function AdminConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    returnTo?: string | string[];
    adminTrail?: string | string[];
    view?: string | string[];
  }>;
}) {
  await requireAdminUser();

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const fallbackHref = legacyConversationFallback(query.view);
  const activeAdminArea = conversationAdminArea(query.view);
  const returnTo = safeAdminReturnTo(query.returnTo, fallbackHref);
  const conversationHref = withAdminNavigationContext(
    `/admin/conversations/${id}?view=${activeAdminArea}`,
    returnTo,
    query.adminTrail,
  );
  const supabase = createAdminClient();

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, family_id, au_pair_id, created_at, updated_at, last_message_at")
    .eq("id", id)
    .maybeSingle<ConversationRow>();

  if (conversationError || !conversation) {
    notFound();
  }

  const [
    profilesResult,
    messagesResult,
    retainedMessagePhotosResult,
    retainedMessageVideosResult,
    retainedMessageAudioResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, account_type, full_name, city, country")
      .in("id", [conversation.family_id, conversation.au_pair_id]),
    supabase
      .from("messages")
      .select(
        "id, sender_id, body, image_path, image_mime_type, video_path, video_mime_type, audio_path, audio_mime_type, audio_duration_seconds, created_at, sent_at, order_key",
      )
      .eq("conversation_id", conversation.id)
      .order("order_key", { ascending: true }),
    supabase
      .from("retained_message_photos")
      .select(
        "id, message_id, conversation_id, sender_id, original_image_path, image_mime_type, retained_until, created_at",
      )
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("retained_message_videos")
      .select(
        "id, message_id, conversation_id, sender_id, original_video_path, video_mime_type, video_size_bytes, video_duration_seconds, retained_until, created_at",
      )
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("retained_message_audio")
      .select(
        "id, message_id, conversation_id, sender_id, original_audio_path, audio_mime_type, audio_size_bytes, audio_duration_seconds, retained_until, created_at",
      )
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true }),
  ]);

  const { data: profiles } = profilesResult;
  const { data: messages } = messagesResult;
  const { data: retainedMessagePhotos } = retainedMessagePhotosResult;
  const { data: retainedMessageVideos } = retainedMessageVideosResult;
  const { data: retainedMessageAudio } = retainedMessageAudioResult;
  const timelineLoadError =
    messagesResult.error ??
    retainedMessagePhotosResult.error ??
    retainedMessageVideosResult.error ??
    retainedMessageAudioResult.error;

  const profileMap = new Map(
    ((profiles ?? []) as ProfileRow[]).map((profile) => [
      profile.id,
      profile,
    ]),
  );
  const family = profileMap.get(conversation.family_id);
  const auPair = profileMap.get(conversation.au_pair_id);
  const messageRows = (messages ?? []) as StoredMessageRow[];
  const messageIds = new Set(messageRows.map((message) => message.id));
  const retainedPhotosWithUrls: RetainedMessagePhotoWithUrl[] =
    await Promise.all(
      ((retainedMessagePhotos ?? []) as RetainedMessagePhotoRow[]).map(
        async (photo) => ({
          ...photo,
          imageUrl: await getSignedMessagePhotoUrl(
            supabase,
            photo.original_image_path,
          ),
        }),
      ),
    );
  const retainedPhotosByMessageId = new Map<
    string,
    RetainedMessagePhotoWithUrl[]
  >();
  const standaloneRetainedPhotos: RetainedMessagePhotoWithUrl[] = [];
  const retainedVideosWithUrls: RetainedMessageVideoWithUrl[] =
    await Promise.all(
      ((retainedMessageVideos ?? []) as RetainedMessageVideoRow[]).map(
        async (video) => ({
          ...video,
          videoUrl: await getSignedMessageVideoUrl(
            supabase,
            video.original_video_path,
          ),
        }),
      ),
    );
  const retainedVideosByMessageId = new Map<
    string,
    RetainedMessageVideoWithUrl[]
  >();
  const standaloneRetainedVideos: RetainedMessageVideoWithUrl[] = [];
  const retainedAudioWithUrls: RetainedMessageAudioWithUrl[] =
    await Promise.all(
      ((retainedMessageAudio ?? []) as RetainedMessageAudioRow[]).map(
        async (audio) => ({
          ...audio,
          audioUrl: await getSignedMessageAudioUrl(
            supabase,
            audio.original_audio_path,
          ),
        }),
      ),
    );
  const retainedAudioByMessageId = new Map<
    string,
    RetainedMessageAudioWithUrl[]
  >();
  const standaloneRetainedAudio: RetainedMessageAudioWithUrl[] = [];

  for (const photo of retainedPhotosWithUrls) {
    if (photo.message_id && messageIds.has(photo.message_id)) {
      const existingPhotos = retainedPhotosByMessageId.get(photo.message_id);

      if (existingPhotos) {
        existingPhotos.push(photo);
      } else {
        retainedPhotosByMessageId.set(photo.message_id, [photo]);
      }
    } else {
      standaloneRetainedPhotos.push(photo);
    }
  }

  for (const video of retainedVideosWithUrls) {
    if (video.message_id && messageIds.has(video.message_id)) {
      const existingVideos = retainedVideosByMessageId.get(video.message_id);

      if (existingVideos) {
        existingVideos.push(video);
      } else {
        retainedVideosByMessageId.set(video.message_id, [video]);
      }
    } else {
      standaloneRetainedVideos.push(video);
    }
  }

  for (const audio of retainedAudioWithUrls) {
    if (audio.message_id && messageIds.has(audio.message_id)) {
      const existingAudio = retainedAudioByMessageId.get(audio.message_id);

      if (existingAudio) {
        existingAudio.push(audio);
      } else {
        retainedAudioByMessageId.set(audio.message_id, [audio]);
      }
    } else {
      standaloneRetainedAudio.push(audio);
    }
  }

  const messagesWithImageUrls: MessageWithImageUrl[] = await Promise.all(
    messageRows.map(async (message) => ({
      ...message,
      created_at: message.sent_at,
      imageUrl: await getSignedMessagePhotoUrl(supabase, message.image_path),
      videoUrl: await getSignedMessageVideoUrl(supabase, message.video_path),
      audioUrl: await getSignedMessageAudioUrl(supabase, message.audio_path),
      deletedPhotos: retainedPhotosByMessageId.get(message.id) ?? [],
      deletedVideos: retainedVideosByMessageId.get(message.id) ?? [],
      deletedAudio: retainedAudioByMessageId.get(message.id) ?? [],
    })),
  );
  const timelineItems: ConversationTimelineItem[] = [
    ...messagesWithImageUrls.map((message) => ({
      kind: "message" as const,
      sortAt: message.created_at,
      message,
    })),
    ...standaloneRetainedPhotos.map((retainedPhoto) => ({
      kind: "retained-photo" as const,
      sortAt: retainedPhoto.created_at,
      retainedPhoto,
    })),
    ...standaloneRetainedVideos.map((retainedVideo) => ({
      kind: "retained-video" as const,
      sortAt: retainedVideo.created_at,
      retainedVideo,
    })),
    ...standaloneRetainedAudio.map((retainedAudio) => ({
      kind: "retained-audio" as const,
      sortAt: retainedAudio.created_at,
      retainedAudio,
    })),
  ].sort(
    (first, second) =>
      new Date(first.sortAt).getTime() - new Date(second.sortAt).getTime(),
  );

  return (
    <AdminWorkspace activeArea={activeAdminArea} privacyMask>
      <section className="mx-auto max-w-5xl">
        <AdminPageHeader
          eyebrow="Read-only moderation"
          title="Private conversation"
          description="This admin view does not mark the conversation as read and does not allow sending messages."
          actions={
            <AdminBackLink
              returnTo={query.returnTo}
              trail={query.adminTrail}
              fallbackHref={fallbackHref}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--pa-admin-border)] bg-white px-4 py-2 text-sm font-bold text-[var(--pa-admin-ink)] outline-none transition hover:bg-[var(--pa-admin-surface-subtle)] focus-visible:ring-4 focus-visible:ring-[var(--pa-primary-focus-ring)]"
            >
              ← Back
            </AdminBackLink>
          }
        />

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {[
            {
              profile: family,
              profileId: conversation.family_id,
              role: "Family",
            },
            {
              profile: auPair,
              profileId: conversation.au_pair_id,
              role: "Au pair",
            },
          ].map(({ profile, profileId, role }) => {
            const content = (
              <>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#6f8793]">
                  {role}
                </p>
                <h2 className="mt-2 truncate text-xl font-black">
                  {profileLabel(profile)}
                </h2>
                <p className="mt-1 truncate text-sm font-bold text-[#25302d]/50">
                  {profile?.email ?? "No email"}
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-[#25302d]/42">
                  {profile?.city ? `${profile.city}, ` : ""}
                  {profile?.country ?? "Country not set"}
                </p>
              </>
            );

            return profile ? (
              <Link
                key={profileId}
                href={withAdminReturnTo(
                  `/admin/profiles/${profileId}?view=${activeAdminArea}`,
                  conversationHref,
                )}
                aria-label={`Open ${profileLabel(profile)} admin profile`}
                className="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--pa-primary-focus-ring)]"
              >
                {content}
              </Link>
            ) : (
              <section
                key={profileId}
                className="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-black/5"
              >
                {content}
              </section>
            );
          })}
        </div>

        <section className="mt-5 overflow-hidden rounded-[1.75rem] bg-white shadow-sm ring-1 ring-black/5">
          <div className="border-b border-black/10 p-5">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#6f8793]">
              Messages
            </p>
            <p className="mt-2 text-sm font-semibold text-[#25302d]/50">
              {conversation.last_message_at ? "Last activity" : "Created"}{" "}
              {formatDate(
                conversation.last_message_at ?? conversation.created_at,
              )}
            </p>
          </div>

          <div className="min-h-[420px] space-y-3 bg-[var(--background)] p-3 sm:p-6">
            {timelineLoadError ? (
              <div className="flex min-h-[360px] items-center justify-center text-center">
                <div>
                  <h2 className="text-2xl font-bold">
                    Messages could not be loaded
                  </h2>
                  <p className="mt-3 text-sm font-semibold text-[#25302d]/45">
                    Refresh this page to try again.
                  </p>
                </div>
              </div>
            ) : timelineItems.length > 0 ? (
              timelineItems.map((item) => {
                const message =
                  item.kind === "message" ? item.message : null;
                const retainedPhoto =
                  item.kind === "retained-photo"
                    ? item.retainedPhoto
                    : null;
                const retainedVideo =
                  item.kind === "retained-video"
                    ? item.retainedVideo
                    : null;
                const retainedAudio =
                  item.kind === "retained-audio"
                    ? item.retainedAudio
                    : null;
                const senderId =
                  message?.sender_id ??
                  retainedPhoto?.sender_id ??
                  retainedVideo?.sender_id ??
                  retainedAudio?.sender_id;
                const sender = senderId ? profileMap.get(senderId) : null;
                const isFamily = senderId === conversation.family_id;
                const isAuPair = senderId === conversation.au_pair_id;
                const deletedPhotos = message?.deletedPhotos ?? [];
                const deletedVideos = message?.deletedVideos ?? [];
                const deletedAudio = message?.deletedAudio ?? [];
                const visibleDeletedPhotos = retainedPhoto
                  ? [retainedPhoto]
                  : deletedPhotos;
                const visibleDeletedVideos = retainedVideo
                  ? [retainedVideo]
                  : deletedVideos;
                const visibleDeletedAudio = retainedAudio
                  ? [retainedAudio]
                  : deletedAudio;
                const imageUrl = message?.imageUrl ?? null;
                const videoUrl = message?.videoUrl ?? null;
                const audioUrl = message?.audioUrl ?? null;
                const createdAt = message?.created_at ?? item.sortAt;
                const body = message?.body ?? "";
                const alignClass = isFamily
                  ? "justify-start"
                  : isAuPair
                    ? "justify-end"
                    : "justify-center";
                const textAlignClass = isFamily
                  ? "text-left"
                  : isAuPair
                    ? "text-right"
                    : "text-center";

                return (
                  <div
                    key={
                      message
                        ? `message-${message.id}`
                        : retainedPhoto
                          ? `retained-photo-${retainedPhoto.id}`
                          : retainedVideo
                            ? `retained-video-${retainedVideo.id}`
                            : `retained-audio-${retainedAudio?.id}`
                    }
                    className={`flex ${alignClass}`}
                  >
                    <div className="max-w-[88%] sm:max-w-[78%]">
                      <p
                        className={`mb-1 text-xs font-black uppercase tracking-[0.12em] text-[#25302d]/40 ${textAlignClass}`}
                      >
                        {profileLabel(sender)}
                      </p>

                      <div
                        className={`rounded-[1.25rem] text-sm font-semibold leading-6 ${
                          isFamily
                            ? "bg-white text-[#25302d]/70 ring-1 ring-black/5"
                            : "bg-[#bfefff] text-[#25302d]"
                        }`}
                      >
                        {visibleDeletedPhotos.map((photo) => (
                          <div
                            key={photo.id}
                            className="border-b border-black/5 p-2 last:border-b-0"
                          >
                            <div className="mb-2 rounded-[1rem] bg-[#fff4e8] px-3 py-2 text-xs font-black text-[#9a5a1a] ring-1 ring-[#f0c98f]/45">
                              Deleted photo retained for moderation
                            </div>
                            {photo.imageUrl ? (
                              <MessageImage
                                src={photo.imageUrl}
                                isOwnMessage={isAuPair}
                              />
                            ) : (
                              <p className="rounded-[1rem] bg-white px-3 py-2 text-xs font-bold text-[#9a3b2f] ring-1 ring-[#f4b8ad]/60">
                                The retained photo file could not be loaded.
                              </p>
                            )}
                            <p className="mt-2 text-[11px] font-bold text-[#25302d]/38">
                              Retained until {formatDate(photo.retained_until)}
                            </p>
                          </div>
                        ))}

                        {visibleDeletedVideos.map((video) => (
                          <div
                            key={video.id}
                            className="border-b border-black/5 p-2 last:border-b-0"
                          >
                            <div className="mb-2 rounded-[1rem] bg-[#fff4e8] px-3 py-2 text-xs font-black text-[#9a5a1a] ring-1 ring-[#f0c98f]/45">
                              Deleted video retained for moderation
                            </div>
                            {video.videoUrl ? (
                              <MessageVideo
                                src={video.videoUrl}
                                isOwnMessage={isAuPair}
                              />
                            ) : (
                              <p className="rounded-[1rem] bg-white px-3 py-2 text-xs font-bold text-[#9a3b2f] ring-1 ring-[#f4b8ad]/60">
                                The retained video file could not be loaded.
                              </p>
                            )}
                            <p className="mt-2 text-[11px] font-bold text-[#25302d]/38">
                              Retained until {formatDate(video.retained_until)}
                            </p>
                          </div>
                        ))}

                        {visibleDeletedAudio.map((audio) => (
                          <div
                            key={audio.id}
                            className="border-b border-black/5 p-2 last:border-b-0"
                          >
                            <div className="mb-2 rounded-[1rem] bg-[#fff4e8] px-3 py-2 text-xs font-black text-[#9a5a1a] ring-1 ring-[#f0c98f]/45">
                              Deleted voice message retained for moderation
                            </div>
                            {audio.audioUrl ? (
                              <MessageAudio
                                src={audio.audioUrl}
                                durationSeconds={audio.audio_duration_seconds}
                                isOwnMessage={isAuPair}
                              />
                            ) : (
                              <p className="rounded-[1rem] bg-white px-3 py-2 text-xs font-bold text-[#9a3b2f] ring-1 ring-[#f4b8ad]/60">
                                The retained voice message could not be loaded.
                              </p>
                            )}
                            <p className="mt-2 text-[11px] font-bold text-[#25302d]/38">
                              Retained until {formatDate(audio.retained_until)}
                            </p>
                          </div>
                        ))}

                        {imageUrl ? (
                          <div className="p-2">
                            <MessageImage
                              src={imageUrl}
                              isOwnMessage={isAuPair}
                            />
                          </div>
                        ) : null}

                        {videoUrl ? (
                          <div className="p-2">
                            <MessageVideo
                              src={videoUrl}
                              isOwnMessage={isAuPair}
                            />
                          </div>
                        ) : null}

                        {audioUrl ? (
                          <div className="p-2">
                            <MessageAudio
                              src={audioUrl}
                              durationSeconds={message?.audio_duration_seconds}
                              isOwnMessage={isAuPair}
                            />
                          </div>
                        ) : null}

                        {body ? (
                          <p
                            data-clarity-mask="true"
                            data-hj-suppress=""
                            className="whitespace-pre-wrap break-words px-3 py-2"
                          >
                            {body}
                          </p>
                        ) : null}
                      </div>

                      <p
                        className={`mt-1 text-xs font-semibold text-[#25302d]/35 ${textAlignClass}`}
                      >
                        {formatMessageClock(createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex min-h-[300px] items-center justify-center text-center">
                <div>
                  <h2 className="text-2xl font-bold">No messages yet</h2>
                  <p className="mt-2 text-sm font-semibold text-[#25302d]/50">
                    This conversation exists, but no messages have been sent.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </section>
    </AdminWorkspace>
  );
}
