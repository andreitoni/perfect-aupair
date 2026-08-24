"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IMAGE_UPLOAD_ACCEPT,
  compressImageForUpload,
  validateImageUploadFile,
} from "@/lib/images/compress";
import {
  removeStoryPhotoFiles,
  uploadStoryPhotoFile,
} from "@/lib/images/storage";
import { useTranslations } from "@/components/i18n/I18nProvider";

type StoryUploaderProps = {
  profileId: string;
  returnTo: string;
};

const STORY_PHOTO_MAX_SIZE_BYTES = 10 * 1024 * 1024;

export function StoryUploader({ profileId, returnTo }: StoryUploaderProps) {
  const router = useRouter();
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<HTMLElement | null>(null);

  const [fileName, setFileName] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function clearSelectedFile() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setFileName("");
    setPreviewUrl("");
    setError("");
  }

  function handleSelectedFile(file?: File) {
    setError("");

    if (!file) {
      clearSelectedFile();
      return;
    }

    const validationError = validateImageUploadFile(file, {
      maxSizeBytes: STORY_PHOTO_MAX_SIZE_BYTES,
      messages: {
        size: t("stories.photoSize"),
      },
    });

    if (validationError) {
      clearSelectedFile();
      setError(validationError);
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setFileName(file.name);
    setPreviewUrl(URL.createObjectURL(file));

    window.requestAnimationFrame(() => {
      previewRef.current?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    });
  }

  async function uploadStory() {
    setError("");

    const file = inputRef.current?.files?.[0];

    if (file) {
      const validationError = validateImageUploadFile(file, {
        maxSizeBytes: STORY_PHOTO_MAX_SIZE_BYTES,
        messages: {
          size: t("stories.photoSize"),
        },
      });

      if (validationError) {
        setError(validationError);
        return;
      }
    }

    if (!file) {
      setError(t("stories.photoRequired"));
      return;
    }

    setIsUploading(true);

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const fileForUpload = await compressImageForUpload(file, {
        maxDimension: 1200,
        quality: 0.75,
        maxSizeBytes: STORY_PHOTO_MAX_SIZE_BYTES,
        maxOutputSizeBytes: 512 * 1024,
        messages: {
          size: t("stories.photoSize"),
          compressedSize: t("stories.photoCompressedTooLarge"),
        },
      });
      const { storagePath } = await uploadStoryPhotoFile({
        supabase,
        profileId,
        file: fileForUpload,
      });

      const { error: insertError } = await supabase
        .from("profile_stories")
        .insert({
          profile_id: profileId,
          storage_path: storagePath,
        });

      if (insertError) {
        await removeStoryPhotoFiles(supabase, storagePath);
        setError(insertError.message);
        return;
      }

      router.push(returnTo);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : t("stories.postFailed"),
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="rounded-[1.5rem] bg-white p-4 shadow-sm ring-1 ring-black/5 sm:rounded-[2rem] sm:p-7 lg:min-h-[720px]">
      <div className="mb-7">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#6f8793]">
          {t("common.story")}
        </p>

        <h1 className="mt-3 text-2xl font-bold tracking-[-0.03em] sm:text-4xl">
          {t("stories.add24Hour")}
        </h1>

        <p className="mt-3 max-w-2xl leading-7 text-[#25302d]/58">
          {t("stories.uploadOnePhoto")}
        </p>
      </div>

      {error ? (
        <div className="mb-5 rounded-2xl border border-[#d95f49]/20 bg-[#fff5f2] p-4 text-sm font-semibold text-[#9d3f2f]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-5">
          <div className="rounded-[1.5rem] border border-dashed border-black/15 bg-[var(--background)] p-4 sm:p-5">
            <input
              ref={inputRef}
              type="file"
              accept={IMAGE_UPLOAD_ACCEPT}
              className="hidden"
              onChange={(event) => handleSelectedFile(event.target.files?.[0])}
            />

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold">{t("stories.photo")}</p>
                <p className="mt-1 text-sm font-semibold text-[#25302d]/50">
                  {t("stories.photoSize")}
                </p>

                <p className="mt-2 min-h-5 max-w-sm truncate text-sm font-bold text-[#25302d]/70">
                  {fileName ? t("common.selected", { name: fileName }) : ""}
                </p>
              </div>

              <div className="grid gap-2 sm:flex sm:flex-wrap">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="w-full rounded-full bg-[var(--pa-primary)] px-5 py-3 text-sm font-bold text-[var(--pa-primary-ink)] sm:w-auto"
                >
                  {t("stories.choosePhoto")}
                </button>

                {previewUrl ? (
                  <button
                    type="button"
                    onClick={clearSelectedFile}
                    className="w-full rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-bold text-[#25302d] sm:w-auto"
                  >
                    {t("common.remove")}
                  </button>
                ) : (
                  <span
                    aria-hidden="true"
                    className="invisible w-full rounded-full border border-black/10 px-5 py-3 text-sm font-bold sm:w-auto"
                  >
                    {t("common.remove")}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-end gap-3 border-t border-black/10 pt-6 sm:flex-row">
            <Link
              href={returnTo}
              prefetch={false}
              className="w-full rounded-full border border-black/10 bg-white px-5 py-3 text-center text-sm font-bold text-[#25302d] sm:w-auto"
            >
              {t("common.cancel")}
            </Link>

            <button
              type="button"
              disabled={isUploading}
              onClick={uploadStory}
              className="w-full rounded-full bg-[#f2b58f] px-5 py-3 text-sm font-black text-[#25302d] shadow-[0_12px_24px_rgba(217,95,73,0.18)] ring-2 ring-[#ffe1d1] transition hover:-translate-y-0.5 hover:bg-[#eda57c] hover:shadow-[0_16px_30px_rgba(217,95,73,0.22)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 sm:w-auto"
            >
              {isUploading ? t("stories.posting") : t("stories.post")}
            </button>
          </div>
        </div>

        <aside
          ref={previewRef}
          className="mx-auto w-full max-w-[280px] scroll-mt-24 rounded-[1.5rem] bg-[#f7f3ed] p-4 lg:max-w-none"
        >
          <p className="mb-3 text-sm font-bold">{t("common.preview")}</p>

          <div className="relative aspect-[9/16] overflow-hidden rounded-[1.25rem] bg-black">
            {previewUrl ? (
              <Image
                src={previewUrl}
                alt=""
                fill
                sizes="260px"
                unoptimized
                draggable={false}
                className="pa-protected-media object-cover"
              />
            ) : (
              <div className="flex aspect-[9/16] items-center justify-center text-sm font-bold text-white/35">
                {t("stories.noSelected")}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
