"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "@/components/i18n/I18nProvider";
import { formatAudioDuration } from "@/lib/audio/upload";

type MessageAudioProps = {
  src: string;
  durationSeconds?: number | null;
  isOwnMessage: boolean;
  isPending?: boolean;
};

const WAVEFORM_BARS = [8, 14, 10, 18, 12, 22, 16, 28, 18, 24, 13, 20, 10, 16];
const MESSAGE_AUDIO_PLAY_EVENT = "perfect-aupair:message-audio-play";

export function MessageAudio({
  src,
  durationSeconds,
  isOwnMessage,
  isPending = false,
}: MessageAudioProps) {
  const t = useTranslations();
  const audioId = useId();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const [hasPlaybackPosition, setHasPlaybackPosition] = useState(false);

  useEffect(() => {
    function handleOtherMessageAudioPlay(event: Event) {
      const playEvent = event as CustomEvent<{ id?: string }>;

      if (playEvent.detail?.id === audioId) {
        return;
      }

      audioRef.current?.pause();
    }

    window.addEventListener(
      MESSAGE_AUDIO_PLAY_EVENT,
      handleOtherMessageAudioPlay,
    );

    return () => {
      window.removeEventListener(
        MESSAGE_AUDIO_PLAY_EVENT,
        handleOtherMessageAudioPlay,
      );
    };
  }, [audioId]);

  function togglePlayback() {
    if (isPending) return;

    const audio = audioRef.current;

    if (!audio) return;

    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }

  const progress =
    duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  return (
    <div
      className={[
        "flex min-w-[240px] max-w-[72vw] items-center gap-3 rounded-[1.15rem] px-3 py-2.5 sm:min-w-[280px] sm:max-w-[360px]",
        isOwnMessage
          ? "bg-white/45"
          : "bg-white shadow-[0_1px_1px_rgba(37,48,45,0.04)] ring-1 ring-black/5",
      ].join(" ")}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        className="hidden"
        controlsList="nodownload"
        onLoadedMetadata={(event) => {
          const nextDuration = event.currentTarget.duration;

          setCurrentTime(0);
          setIsPlaying(false);
          setHasPlaybackPosition(false);

          if (Number.isFinite(nextDuration) && nextDuration > 0) {
            setDuration(nextDuration);
          } else {
            setDuration(durationSeconds ?? 0);
          }
        }}
        onPlay={() => {
          window.dispatchEvent(
            new CustomEvent(MESSAGE_AUDIO_PLAY_EVENT, {
              detail: { id: audioId },
            }),
          );
          setIsPlaying(true);
          setHasPlaybackPosition(true);
        }}
        onPause={(event) => {
          const pausedAt = event.currentTarget.currentTime;

          setCurrentTime(pausedAt);
          setIsPlaying(false);
          setHasPlaybackPosition(pausedAt > 0);
        }}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
          setHasPlaybackPosition(false);
        }}
        onTimeUpdate={(event) => {
          const nextCurrentTime = event.currentTarget.currentTime;

          setCurrentTime(nextCurrentTime);
          if (nextCurrentTime > 0) {
            setHasPlaybackPosition(true);
          }
        }}
        onContextMenu={(event) => event.preventDefault()}
      />

      <button
        type="button"
        onClick={togglePlayback}
        disabled={isPending}
        aria-busy={isPending}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#25302d] shadow-sm ring-1 ring-black/10 transition hover:bg-[var(--background)] disabled:cursor-default"
        aria-label={
          isPending
            ? t("messages.uploadingAudio")
            : isPlaying
            ? t("messages.pauseVoiceMessage")
            : t("messages.playVoiceMessage")
        }
      >
        {isPending ? (
          <span className="h-5 w-5 rounded-full border-[3px] border-[#25302d]/20 border-t-[#25302d] animate-spin" />
        ) : isPlaying ? (
          <span className="flex gap-1">
            <span className="h-4 w-1.5 rounded-full bg-current" />
            <span className="h-4 w-1.5 rounded-full bg-current" />
          </span>
        ) : (
          <span className="ml-0.5 h-0 w-0 border-y-[7px] border-l-[11px] border-y-transparent border-l-current" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          className="flex h-8 w-full items-center gap-1"
          aria-label={t("messages.voiceMessage")}
          onClick={(event) => {
            const audio = audioRef.current;

            if (isPending || !audio || duration <= 0) return;

            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = Math.min(
              1,
              Math.max(0, (event.clientX - rect.left) / rect.width),
            );

            audio.currentTime = ratio * duration;
            setCurrentTime(audio.currentTime);
            setHasPlaybackPosition(true);
          }}
        >
          {WAVEFORM_BARS.map((height, index) => {
            const isActive = index / WAVEFORM_BARS.length <= progress;

            return (
              <span
                key={`${height}-${index}`}
                className={[
                  "w-1 flex-1 rounded-full transition-colors",
                  isActive ? "bg-[#25302d]" : "bg-[#25302d]/25",
                ].join(" ")}
                style={{ height }}
              />
            );
          })}
        </button>
        <p className="mt-0.5 text-xs font-black text-[#25302d]/45">
          {formatAudioDuration(hasPlaybackPosition ? currentTime : duration)}
        </p>
      </div>
    </div>
  );
}
