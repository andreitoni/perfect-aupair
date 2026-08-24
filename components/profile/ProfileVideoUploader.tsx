"use client";

import { useRef, useState } from "react";
import {
  getSignedProfileVideoUrl,
  removeProfileVideoFiles,
  uploadProfileVideoFile,
} from "@/lib/images/storage";
import {
  PROFILE_VIDEO_UPLOAD_ACCEPT,
  getProfileVideoMetadata,
  validateProfileVideoUploadFile,
} from "@/lib/videos/upload";
import {
  captureVideoPosterFromFile,
  createVideoPosterPreviewDataUrl,
} from "@/lib/videos/poster";
import { useTranslations } from "@/components/i18n/I18nProvider";

export type ProfileVideo = {
  id: string;
  storage_path: string;
  signed_url: string | null;
  mime_type: string;
  size_bytes: number;
  duration_seconds: number;
  width: number | null;
  height: number | null;
  poster_data_url: string | null;
  content_moderation_status: "pending" | "approved" | "rejected";
};

function PlayIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-6 w-6"
      fill="currentColor"
    >
      <path d="M8 5.6v12.8l10-6.4-10-6.4Z" />
    </svg>
  );
}

function BoostCheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
    >
      <path
        d="m6.5 12.3 3.4 3.4 7.6-8.1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  );
}

type ProfileVideoUploaderProps = {
  profileId: string;
  initialVideo?: ProfileVideo | null;
};

export function ProfileVideoUploader({
  profileId,
  initialVideo = null,
}: ProfileVideoUploaderProps) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [video, setVideo] = useState<ProfileVideo | null>(initialVideo);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleVideoUpload(fileList: FileList | null) {
    setError("");

    const file = fileList?.[0];
    if (!file) return;

    const validationError = validateProfileVideoUploadFile(file, {
      type: t("profile.videoType"),
      size: t("profile.videoSize"),
    });

    if (validationError) {
      setError(validationError);
      resetInput();
      return;
    }

    setIsUploading(true);

    let uploadedStoragePath: string | null = null;

    try {
      const supabasePromise = import("@/lib/supabase/client").then(
        ({ createClient }) => createClient(),
      );
      const posterPromise = captureVideoPosterFromFile(file);
      const metadata = await getProfileVideoMetadata(file, {
        duration: t("profile.videoDurationTooLong"),
        metadata: t("profile.videoMetadataError"),
      });
      const previousStoragePath = video?.storage_path ?? null;
      const supabase = await supabasePromise;
      const { storagePath } = await uploadProfileVideoFile({
        supabase,
        profileId,
        file,
      });
      uploadedStoragePath = storagePath;
      const posterUrl = await posterPromise;
      const posterDataUrl = posterUrl
        ? await createVideoPosterPreviewDataUrl(posterUrl)
        : null;

      const { data: savedVideo, error: saveError } = await supabase
        .from("profile_videos")
        .upsert(
          {
            profile_id: profileId,
            storage_path: storagePath,
            mime_type: file.type,
            size_bytes: file.size,
            duration_seconds: Math.round(metadata.durationSeconds * 100) / 100,
            width: metadata.width,
            height: metadata.height,
            poster_data_url: posterDataUrl,
          },
          { onConflict: "profile_id" },
        )
        .select(
          "id, storage_path, mime_type, size_bytes, duration_seconds, width, height, poster_data_url, content_moderation_status",
        )
        .single();

      if (saveError) {
        await removeProfileVideoFiles(supabase, storagePath);
        setError(saveError.message);
        return;
      }

      const signedUrl = await getSignedProfileVideoUrl(
        supabase,
        savedVideo.storage_path,
      );

      setVideo({
        ...savedVideo,
        signed_url: signedUrl,
      });

      if (previousStoragePath && previousStoragePath !== storagePath) {
        await removeProfileVideoFiles(supabase, previousStoragePath);
      }
    } catch (caughtError) {
      if (uploadedStoragePath) {
        const { createClient } = await import("@/lib/supabase/client");
        await removeProfileVideoFiles(createClient(), uploadedStoragePath);
      }

      setError(
        caughtError instanceof Error
          ? caughtError.message
          : t("profile.videoUploadFailed"),
      );
    } finally {
      setIsUploading(false);
      resetInput();
    }
  }

  async function deleteVideo() {
    if (!video) return;

    setError("");
    setIsUploading(true);

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("profile_videos")
        .delete()
        .eq("id", video.id);

      if (deleteError) {
        setError(deleteError.message);
        return;
      }

      await removeProfileVideoFiles(supabase, video.storage_path);
      setVideo(null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : t("profile.videoUploadFailed"),
      );
    } finally {
      setIsUploading(false);
    }
  }

  function resetInput() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <section className="mt-4 rounded-[1.25rem] border border-[#d6e2e8] bg-white p-4 shadow-sm sm:p-5">
      <input
        ref={inputRef}
        type="file"
        accept={PROFILE_VIDEO_UPLOAD_ACCEPT}
        className="hidden"
        onChange={(event) => handleVideoUpload(event.target.files)}
      />

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.58fr)]">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#dff6ea] px-3 py-1.5 text-[0.72rem] font-black uppercase tracking-[0.08em] text-[#1f7d4f]">
            <span
              aria-hidden="true"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#2aa96b] text-white"
            >
              <BoostCheckIcon />
            </span>
            {t("profile.videoBoostBadge")}
          </div>

          <h2 className="mt-3 text-xl font-black tracking-[-0.03em] text-[#172426]">
            {t("profile.videoTitle")}
          </h2>

          <p className="mt-2 text-sm font-semibold leading-6 text-[#25302d]">
            {t("profile.videoHelp")}
          </p>

          {error ? (
            <div className="mt-4 rounded-2xl border border-[#d95f49]/20 bg-[#fff5f2] p-4 text-sm font-semibold text-[#9d3f2f]">
              {error}
            </div>
          ) : null}

          {video?.content_moderation_status === "rejected" ? (
            <div className="mt-4 rounded-2xl border border-[#e6d7ad] bg-[#fff9e8] p-4 text-sm font-semibold text-[#6f5420]">
              {t("profile.videoRejectedReview")}
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={isUploading}
              onClick={() => inputRef.current?.click()}
              className="inline-flex h-11 w-full items-center justify-center rounded-[0.7rem] bg-[#cfe5ec] px-5 text-sm font-black text-[#172426] transition hover:bg-[#bddae3] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {isUploading
                ? t("profile.videoUploading")
                : video
                  ? t("profile.replaceVideo")
                  : t("profile.chooseVideo")}
            </button>

            {video ? (
              <button
                type="button"
                disabled={isUploading}
                onClick={deleteVideo}
                className="inline-flex h-11 w-full items-center justify-center rounded-[0.7rem] bg-[#fff2ed] px-5 text-sm font-black text-[#9d3f2f] transition hover:bg-[#ffe4dc] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {t("profile.deleteVideo")}
              </button>
            ) : null}
          </div>

          <p className="mt-3 text-xs font-bold leading-5 text-[#25302d]/48">
            {t("profile.videoFileHelp")}
          </p>
        </div>

        <div className="min-w-0 w-full max-w-[16rem] overflow-hidden rounded-[0.9rem] bg-[#172426] shadow-sm ring-1 ring-black/10 sm:max-w-[20rem] lg:max-w-none">
          {video?.signed_url ? (
            <video
              src={video.signed_url}
              poster={video.poster_data_url ?? undefined}
              controls
              preload="none"
              playsInline
              controlsList="nodownload"
              disablePictureInPicture
              onContextMenu={(event) => event.preventDefault()}
              className="aspect-square h-full w-full bg-black object-contain lg:aspect-video"
            />
          ) : (
            <div className="flex aspect-square h-full w-full flex-col items-center justify-center gap-2 bg-[#172426] p-5 text-center text-white lg:aspect-video">
              <span
                aria-hidden="true"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white/14 text-white"
              >
                <PlayIcon />
              </span>
              <p className="text-sm font-black">{t("profile.noVideoUploaded")}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
