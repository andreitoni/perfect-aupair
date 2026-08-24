"use client";

import { useEffect, useRef, useState } from "react";
import { GuestProfileLoginPrompt } from "@/components/profile/GuestProfileLoginPrompt";
import { useTranslations } from "@/components/i18n/I18nProvider";

type ProfileIntroVideoProps = {
  videoUrl?: string | null;
  isAuthenticated: boolean;
  profileName: string;
  profilePhotoUrl?: string | null;
  posterUrl?: string | null;
  returnTo?: string | null;
  variant?: "standalone" | "tile";
};

type VideoShape = "portrait" | "landscape" | "square";

type WebkitFullscreenVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
};

function PlayIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="currentColor"
    >
      <path d="M8 5.6v12.8l10-6.4-10-6.4Z" />
    </svg>
  );
}

function getVideoShape(video: HTMLVideoElement): VideoShape {
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!width || !height) {
    return "portrait";
  }

  if (Math.abs(width - height) / Math.max(width, height) < 0.08) {
    return "square";
  }

  return width > height ? "landscape" : "portrait";
}

export function ProfileIntroVideo({
  videoUrl,
  isAuthenticated,
  profileName,
  profilePhotoUrl,
  posterUrl,
  returnTo,
  variant = "standalone",
}: ProfileIntroVideoProps) {
  const t = useTranslations();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const automaticFullscreenRef = useRef(false);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isPlaybackStarted, setIsPlaybackStarted] = useState(false);
  const [videoShape, setVideoShape] = useState<VideoShape>("portrait");

  const videoFrameClass =
    variant === "tile"
      ? "h-full w-full overflow-hidden bg-black"
      : videoShape === "landscape"
        ? "mx-auto aspect-video w-full max-w-[52rem] overflow-hidden rounded-[1rem] bg-black shadow-sm ring-1 ring-black/10"
        : videoShape === "square"
          ? "mx-auto aspect-square w-full max-w-[34rem] overflow-hidden rounded-[1rem] bg-black shadow-sm ring-1 ring-black/10"
          : "mx-auto aspect-[9/16] w-full max-w-[24rem] overflow-hidden rounded-[1rem] bg-black shadow-sm ring-1 ring-black/10";
  const containerClass =
    variant === "tile" ? "h-full w-full" : "px-4 pb-4 sm:px-5 sm:pb-5";

  useEffect(() => {
    const video = videoRef.current;

    if (!video) return;
    const activeVideo = video;

    function resetAutomaticFullscreenPreview() {
      if (!automaticFullscreenRef.current) return;

      automaticFullscreenRef.current = false;
      activeVideo.pause();
      activeVideo.controls = false;
      setIsPlaybackStarted(false);
    }

    function handleFullscreenChange() {
      if (!document.fullscreenElement) {
        resetAutomaticFullscreenPreview();
      }
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    activeVideo.addEventListener(
      "webkitendfullscreen",
      resetAutomaticFullscreenPreview,
    );

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      activeVideo.removeEventListener(
        "webkitendfullscreen",
        resetAutomaticFullscreenPreview,
      );
    };
  }, []);

  async function playVideo() {
    const video = videoRef.current;

    if (!video) return;

    video.controls = true;
    setIsPlaybackStarted(true);

    const shouldOpenInFullscreen = window.matchMedia(
      "(pointer: coarse) and (max-width: 639px), (pointer: coarse) and (max-height: 639px)",
    ).matches;
    automaticFullscreenRef.current = shouldOpenInFullscreen;

    if (shouldOpenInFullscreen) {
      try {
        const webkitVideo = video as WebkitFullscreenVideo;

        if (typeof video.requestFullscreen === "function") {
          void video.requestFullscreen().catch(() => undefined);
        } else if (
          typeof webkitVideo.webkitEnterFullscreen === "function" &&
          video.readyState >= HTMLMediaElement.HAVE_METADATA
        ) {
          webkitVideo.webkitEnterFullscreen();
        }
      } catch {
        // Safari can throw synchronously while the media is still loading.
      }
    }

    let didPlay = false;

    try {
      didPlay = await video.play().then(
        () => true,
        () => false,
      );
    } catch {
      // Older Safari versions can throw synchronously instead of rejecting.
    }

    if (!didPlay) {
      video.controls = false;
      setIsPlaybackStarted(false);
    }
  }

  if (isAuthenticated && videoUrl) {
    return (
      <div className={containerClass}>
        <div className={`${videoFrameClass} relative`}>
          <video
            ref={videoRef}
            src={videoUrl}
            poster={posterUrl ?? undefined}
            controls={isPlaybackStarted}
            preload="none"
            controlsList="nodownload"
            disablePictureInPicture
            onLoadedMetadata={(event) => {
              setVideoShape(getVideoShape(event.currentTarget));
            }}
            onContextMenu={(event) => event.preventDefault()}
            className="h-full w-full bg-black object-contain"
          />
          {!isPlaybackStarted ? (
            <button
              type="button"
              data-testid="profile-video-play"
              onClick={playVideo}
              aria-label={`${t("common.open")} ${t("profile.videoTitle")}`}
              className="group absolute inset-0 z-10 flex items-center justify-center overflow-hidden bg-black text-white"
            >
              {posterUrl ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 bg-contain bg-center bg-no-repeat"
                  style={{ backgroundImage: `url("${posterUrl}")` }}
                />
              ) : null}
              <span className="absolute inset-0 bg-[#172426]/22" />
              <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#172426]/62 text-white shadow-md ring-1 ring-white/35 transition group-hover:scale-[1.04]">
                <PlayIcon />
              </span>
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={containerClass}>
        <button
          type="button"
          onClick={() => setIsPromptOpen(true)}
          className={`${videoFrameClass} group relative flex items-center justify-center text-white`}
          aria-label={t("profile.videoLoginToView")}
        >
          {posterUrl ? (
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url("${posterUrl}")` }}
            />
          ) : null}
          <div className="absolute inset-0 bg-[#172426]/36" />
          <div className="relative flex flex-col items-center gap-3 px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/16 text-white ring-1 ring-white/20 transition group-hover:scale-[1.04]">
              <PlayIcon />
            </span>
            <span className="text-sm font-black">{t("profile.videoLoginToView")}</span>
          </div>
        </button>
      </div>

      {isPromptOpen ? (
        <GuestProfileLoginPrompt
          profileName={profileName}
          profilePhotoUrl={profilePhotoUrl}
          returnTo={returnTo}
          title={t("profile.videoGuestTitle")}
          text={t("profile.videoGuestText", { name: profileName })}
          onClose={() => setIsPromptOpen(false)}
        />
      ) : null}
    </>
  );
}
