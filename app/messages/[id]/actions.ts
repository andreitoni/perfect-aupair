"use server";

import {
  MESSAGE_AUDIO_BUCKET,
  uploadMessagePhotoFile,
  MESSAGE_VIDEOS_BUCKET,
} from "@/lib/images/storage";
import { assertFeatureEnabled } from "@/lib/feature-flags";
import {
  recordSecurityRequest,
  securityRateLimitMessage,
} from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  MESSAGE_VIDEO_MAX_DURATION_SECONDS,
  MESSAGE_VIDEO_UPLOAD_ALLOWED_TYPES,
  MESSAGE_VIDEO_UPLOAD_MAX_SIZE,
} from "@/lib/videos/upload";
import {
  MESSAGE_AUDIO_MAX_DURATION_SECONDS,
  MESSAGE_AUDIO_UPLOAD_ALLOWED_TYPES,
  MESSAGE_AUDIO_UPLOAD_MAX_SIZE,
} from "@/lib/audio/upload";
import { sendNewMessageNotificationEmail } from "@/lib/email/profile-notifications";
import { MESSAGE_TEXT_MAX_LENGTH } from "@/lib/messages/limits";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import * as Sentry from "@sentry/nextjs";

const MESSAGE_IMAGE_MAX_SIZE = 5 * 1024 * 1024;

const MESSAGE_IMAGE_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MESSAGE_VIDEO_ALLOWED_TYPES = new Set<string>(
  MESSAGE_VIDEO_UPLOAD_ALLOWED_TYPES,
);
const MESSAGE_AUDIO_ALLOWED_TYPES = new Set<string>(
  MESSAGE_AUDIO_UPLOAD_ALLOWED_TYPES,
);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MessageAttachmentKind = "image" | "video";

function getMessageAttachmentKind(
  value: FormDataEntryValue | null,
): MessageAttachmentKind | null {
  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  if (MESSAGE_IMAGE_ALLOWED_TYPES.has(value.type)) {
    if (value.size > MESSAGE_IMAGE_MAX_SIZE) {
      throw new Error("Attached image must be 5 MB or smaller.");
    }

    return "image";
  }

  if (MESSAGE_VIDEO_ALLOWED_TYPES.has(value.type)) {
    throw new Error("Video upload did not finish. Please try again.");
  }

  throw new Error("Please attach a JPG, PNG, WebP, MP4, WebM or MOV file.");
}

function readMessageVideoUpload(formData: FormData, conversationId: string) {
  const storagePath = String(formData.get("video_storage_path") ?? "").trim();

  if (!storagePath) {
    return null;
  }

  const mimeType = String(formData.get("video_mime_type") ?? "").trim();
  const sizeBytes = Number(formData.get("video_size_bytes"));
  const durationSeconds = readVideoDurationSeconds(formData);

  if (!storagePath.startsWith(`${conversationId}/`) || storagePath.includes("..")) {
    throw new Error("Invalid video upload.");
  }

  if (!MESSAGE_VIDEO_ALLOWED_TYPES.has(mimeType)) {
    throw new Error("Please attach an MP4, WebM or MOV video.");
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new Error("Could not read this video. Please choose another file.");
  }

  if (sizeBytes > MESSAGE_VIDEO_UPLOAD_MAX_SIZE) {
    throw new Error("Attached video must be 100 MB or smaller.");
  }

  return {
    storagePath,
    mimeType,
    sizeBytes: Math.round(sizeBytes),
    durationSeconds,
  };
}

function readMessageAudioUpload(formData: FormData, conversationId: string) {
  const storagePath = String(formData.get("audio_storage_path") ?? "").trim();

  if (!storagePath) {
    return null;
  }

  const mimeType = String(formData.get("audio_mime_type") ?? "").trim();
  const sizeBytes = Number(formData.get("audio_size_bytes"));
  const durationSeconds = readAudioDurationSeconds(formData);

  if (!storagePath.startsWith(`${conversationId}/`) || storagePath.includes("..")) {
    throw new Error("Invalid audio upload.");
  }

  if (!MESSAGE_AUDIO_ALLOWED_TYPES.has(mimeType)) {
    throw new Error("Please record a supported audio message.");
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new Error("Could not read this audio message.");
  }

  if (sizeBytes > MESSAGE_AUDIO_UPLOAD_MAX_SIZE) {
    throw new Error("Audio message is too large.");
  }

  return {
    storagePath,
    mimeType,
    sizeBytes: Math.round(sizeBytes),
    durationSeconds,
  };
}

function readVideoDurationSeconds(formData: FormData) {
  const rawDuration = Number(formData.get("video_duration_seconds"));

  if (!Number.isFinite(rawDuration) || rawDuration <= 0) {
    throw new Error("Could not read this video. Please choose another file.");
  }

  if (rawDuration > MESSAGE_VIDEO_MAX_DURATION_SECONDS + 0.5) {
    throw new Error("Video must be 60 seconds or shorter.");
  }

  return Math.round(rawDuration * 100) / 100;
}

function readAudioDurationSeconds(formData: FormData) {
  const rawDuration = Number(formData.get("audio_duration_seconds"));

  if (!Number.isFinite(rawDuration) || rawDuration <= 0) {
    throw new Error("Could not read this audio message.");
  }

  if (rawDuration > MESSAGE_AUDIO_MAX_DURATION_SECONDS + 0.5) {
    throw new Error("Audio message must be 120 seconds or shorter.");
  }

  return Math.round(rawDuration * 100) / 100;
}

function readMessageId(formData: FormData) {
  const value = String(formData.get("message_id") ?? "").trim();

  if (!value) {
    return null;
  }

  if (!UUID_PATTERN.test(value)) {
    throw new Error("Invalid message identifier.");
  }

  return value;
}

export async function sendMessage(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const conversationId = String(formData.get("conversation_id") ?? "");
  const messageId = readMessageId(formData) ?? crypto.randomUUID();
  const body = String(formData.get("body") ?? "").trim();
  const attachment = formData.get("image");
  const attachmentKind = getMessageAttachmentKind(attachment);
  const attachmentFile =
    attachment instanceof File && attachment.size > 0 ? attachment : null;

  const hasImage = attachmentKind === "image";

  if (!conversationId) {
    throw new Error("Missing conversation");
  }

  const uploadedVideo = readMessageVideoUpload(formData, conversationId);
  const hasVideo = Boolean(uploadedVideo);
  const uploadedAudio = readMessageAudioUpload(formData, conversationId);
  const hasAudio = Boolean(uploadedAudio);

  if (!body && !attachmentKind && !hasVideo && !hasAudio) {
    throw new Error("Write a message or attach a photo, video, or audio message");
  }

  const securityDecision = await recordSecurityRequest({
    action: "message_send",
    subject: user.id,
  });

  if (!securityDecision.allowed) {
    throw new Error(securityRateLimitMessage(securityDecision.retryAfterSeconds));
  }

  if (attachmentKind || hasVideo || hasAudio) {
    await assertFeatureEnabled("message_media_uploads");
  }

  if (body.length > MESSAGE_TEXT_MAX_LENGTH) {
    throw new Error(
      `Message must be ${MESSAGE_TEXT_MAX_LENGTH} characters or fewer`,
    );
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("family_id, au_pair_id")
    .eq("id", conversationId)
    .maybeSingle<{ family_id: string; au_pair_id: string }>();

  if (conversationError) {
    Sentry.captureException(new Error(conversationError.message), {
      tags: {
        area: "message_send_conversation_lookup",
        supabase_code: conversationError.code ?? "unknown",
      },
    });
    throw new Error("Conversation could not be opened. Please try again.");
  }

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const isParticipant =
    user.id === conversation.family_id || user.id === conversation.au_pair_id;

  if (!isParticipant) {
    throw new Error("Conversation not found");
  }

  if (hasImage || hasVideo || hasAudio) {
    const { data: messageSendEligibility, error: messageSendEligibilityError } =
      await supabase.rpc("get_message_send_eligibility", {
        p_conversation_id: conversationId,
      });

    if (messageSendEligibilityError || messageSendEligibility !== "allowed") {
      throw new Error(
        messageSendEligibilityError?.message ??
          (messageSendEligibility === "blocked"
            ? "This conversation is blocked."
            : "This conversation is not available."),
      );
    }
  }

  let imagePath: string | null = null;
  let imageMimeType: string | null = null;
  let videoPath: string | null = null;
  let videoMimeType: string | null = null;
  let videoSizeBytes: number | null = null;
  let videoDurationSeconds: number | null = null;
  let audioPath: string | null = null;
  let audioMimeType: string | null = null;
  let audioSizeBytes: number | null = null;
  let audioDurationSeconds: number | null = null;

  if (hasImage && attachmentFile) {
    const uploadedImage = await uploadMessagePhotoFile({
      supabase,
      conversationId,
      file: attachmentFile,
    });

    imagePath = uploadedImage.storagePath;
    imageMimeType = uploadedImage.mimeType;
  }

  if (uploadedVideo) {
    const admin = createAdminClient();
    const { error: signedUrlError } = await admin.storage
      .from(MESSAGE_VIDEOS_BUCKET)
      .createSignedUrl(uploadedVideo.storagePath, 60);

    if (signedUrlError) {
      throw new Error("Uploaded video could not be found. Please try again.");
    }

    const [
      { data: existingMessageVideo, error: existingMessageVideoError },
      { data: retainedMessageVideo, error: retainedMessageVideoError },
    ] = await Promise.all([
      admin
        .from("messages")
        .select("id")
        .eq("video_path", uploadedVideo.storagePath)
        .maybeSingle<{ id: string }>(),
      admin
        .from("retained_message_videos")
        .select("id")
        .eq("original_video_path", uploadedVideo.storagePath)
        .maybeSingle<{ id: string }>(),
    ]);

    if (existingMessageVideoError) {
      throw new Error(existingMessageVideoError.message);
    }

    if (retainedMessageVideoError) {
      throw new Error(retainedMessageVideoError.message);
    }

    if (existingMessageVideo || retainedMessageVideo) {
      throw new Error("Invalid video upload.");
    }

    videoPath = uploadedVideo.storagePath;
    videoMimeType = uploadedVideo.mimeType;
    videoSizeBytes = uploadedVideo.sizeBytes;
    videoDurationSeconds = uploadedVideo.durationSeconds;
  }

  if (uploadedAudio) {
    const admin = createAdminClient();
    const { error: signedUrlError } = await admin.storage
      .from(MESSAGE_AUDIO_BUCKET)
      .createSignedUrl(uploadedAudio.storagePath, 60);

    if (signedUrlError) {
      throw new Error("Uploaded audio could not be found. Please try again.");
    }

    const [
      { data: existingMessageAudio, error: existingMessageAudioError },
      { data: retainedMessageAudio, error: retainedMessageAudioError },
    ] = await Promise.all([
      admin
        .from("messages")
        .select("id")
        .eq("audio_path", uploadedAudio.storagePath)
        .maybeSingle<{ id: string }>(),
      admin
        .from("retained_message_audio")
        .select("id")
        .eq("original_audio_path", uploadedAudio.storagePath)
        .maybeSingle<{ id: string }>(),
    ]);

    if (existingMessageAudioError) {
      throw new Error(existingMessageAudioError.message);
    }

    if (retainedMessageAudioError) {
      throw new Error(retainedMessageAudioError.message);
    }

    if (existingMessageAudio || retainedMessageAudio) {
      throw new Error("Invalid audio upload.");
    }

    audioPath = uploadedAudio.storagePath;
    audioMimeType = uploadedAudio.mimeType;
    audioSizeBytes = uploadedAudio.sizeBytes;
    audioDurationSeconds = uploadedAudio.durationSeconds;
  }

  const { data: sendResult, error } = await supabase.rpc(
    "send_message_if_allowed",
    {
      p_message_id: messageId,
      p_conversation_id: conversationId,
      p_body: body,
      p_image_path: imagePath,
      p_image_mime_type: imageMimeType,
      p_video_path: videoPath,
      p_video_mime_type: videoMimeType,
      p_video_size_bytes: videoSizeBytes,
      p_video_duration_seconds: videoDurationSeconds,
      p_audio_path: audioPath,
      p_audio_mime_type: audioMimeType,
      p_audio_size_bytes: audioSizeBytes,
      p_audio_duration_seconds: audioDurationSeconds,
    },
  );

  if (error) {
    // Leave unreferenced uploads for the bounded orphan-media cleanup. A
    // direct delete here can race an idempotent duplicate request whose insert
    // already succeeded and remove media that is now referenced.
    throw new Error(error.message);
  }

  if (sendResult !== "sent" && sendResult !== "already_sent") {
    throw new Error(
      sendResult === "blocked"
        ? "This conversation is blocked."
        : "This conversation is not available.",
    );
  }

  if (sendResult === "already_sent") {
    return;
  }

  const recipientId =
    user.id === conversation.family_id
      ? conversation.au_pair_id
      : conversation.family_id;

  after(async () => {
    try {
      const notificationAdmin = createAdminClient();
      const { data: notificationClaims, error: notificationClaimError } =
        await notificationAdmin.rpc("claim_new_message_notification_delivery", {
          p_conversation_id: conversationId,
          p_message_id: messageId,
          p_sender_id: user.id,
        });
      const notificationClaim = (
        (notificationClaims ?? []) as Array<{
          claim_token: string;
          delivery_id: string;
        }>
      )[0];

      if (notificationClaimError) {
        console.warn(
          "Could not claim the first-message email notification.",
          notificationClaimError,
        );
      } else if (notificationClaim) {
        const delivery = await sendNewMessageNotificationEmail({
          conversationId,
          messageId,
          senderId: user.id,
          recipientId,
          hasMedia: Boolean(imagePath || videoPath || audioPath),
          idempotencyKey: `new-message/${notificationClaim.delivery_id}`,
        });

        const operation =
          delivery.status === "retryable_failure"
            ? "release_new_message_notification_delivery"
            : "complete_new_message_notification_delivery";
        const { data: settled, error: settlementError } =
          await notificationAdmin.rpc(operation, {
            p_claim_token: notificationClaim.claim_token,
            p_conversation_id: conversationId,
            p_sender_id: user.id,
            ...(operation === "complete_new_message_notification_delivery"
              ? { p_completed_at: new Date().toISOString() }
              : {}),
          });

        if (settlementError || settled !== true) {
          console.error(
            "Could not settle the first-message email notification.",
            {
              message: settlementError?.message ?? "Claim no longer active.",
              operation,
            },
          );
        }
      }
    } catch (error) {
      console.error("First-message email notification worker failed.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export async function deleteMessageMedia(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const conversationId = String(formData.get("conversation_id") ?? "");
  const messageId = String(formData.get("message_id") ?? "");

  if (!conversationId || !messageId) {
    throw new Error("Missing message");
  }

  const { data: message, error: messageError } = await supabase
    .from("messages")
    .select(
      "id, conversation_id, sender_id, body, image_path, image_mime_type, video_path, video_mime_type, video_size_bytes, video_duration_seconds, audio_path, audio_mime_type, audio_size_bytes, audio_duration_seconds",
    )
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .single();

  if (messageError || !message) {
    throw new Error("Message not found");
  }

  if (message.sender_id !== user.id) {
    throw new Error("You can only delete media that you sent");
  }

  if (!message.image_path && !message.video_path && !message.audio_path) {
    throw new Error("This message has no media");
  }

  const { data: deleted, error: deleteError } = await supabase.rpc(
    "delete_own_message_media",
    {
      p_conversation_id: conversationId,
      p_message_id: messageId,
    },
  );

  if (deleteError || deleted !== true) {
    throw new Error(deleteError?.message ?? "Message media could not be deleted");
  }

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId}`);
}

export async function deleteMessagePhoto(formData: FormData) {
  return deleteMessageMedia(formData);
}
