"use client";

import { uploadAdminProfilePhoto } from "@/app/admin/actions";
import {
  IMAGE_COMPRESSION_SOURCE_MAX_SIZE,
  IMAGE_UPLOAD_ACCEPT,
  compressImageForUpload,
  validateImageUploadFile,
} from "@/lib/images/compress";
import type {
  CroppedProfilePhoto,
  ProfilePhotoCropSource,
} from "@/components/profile/ProfilePhotoCropper";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

function PhotoCropperLoading() {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#101817]/80 p-4">
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-black text-[#25302d] shadow-2xl"
      >
        <span
          aria-hidden="true"
          className="h-5 w-5 animate-spin rounded-full border-2 border-[#6f8793]/35 border-t-[#45636f]"
        />
        Loading photo editor…
      </div>
    </div>
  );
}

const ProfilePhotoCropper = dynamic(
  () =>
    import("@/components/profile/ProfilePhotoCropper").then(
      (module) => module.ProfilePhotoCropper,
    ),
  { ssr: false, loading: PhotoCropperLoading },
);

export function AdminProfilePhotoUploader({
  profileId,
  photoCount,
}: {
  profileId: string;
  photoCount: number;
}) {
  const inputId = useId();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const pendingCropRef = useRef<ProfilePhotoCropSource[] | null>(null);
  const [pendingCrop, setPendingCrop] = useState<
    ProfilePhotoCropSource[] | null
  >(null);
  const canUpload = photoCount <= 5;
  const willReplaceMainPhoto = photoCount === 5;

  useEffect(
    () => () => {
      for (const photo of pendingCropRef.current ?? []) {
        URL.revokeObjectURL(photo.imageUrl);
      }
    },
    [],
  );

  function clearPendingCrop() {
    for (const photo of pendingCropRef.current ?? []) {
      URL.revokeObjectURL(photo.imageUrl);
    }

    pendingCropRef.current = null;
    setPendingCrop(null);
  }

  function choosePhoto(file: File | undefined) {
    setStatus("idle");
    setMessage("");

    if (!file || !canUpload || pending) return;

    const validationError = validateImageUploadFile(file, {
      maxSizeBytes: IMAGE_COMPRESSION_SOURCE_MAX_SIZE,
      messages: {
        size: "The source image must be 20 MB or smaller.",
      },
    });

    if (validationError) {
      setStatus("error");
      setMessage(validationError);
      return;
    }

    const source = [{ file, imageUrl: URL.createObjectURL(file) }];
    pendingCropRef.current = source;
    setPendingCrop(source);
  }

  async function uploadCroppedPhoto(croppedPhotos: CroppedProfilePhoto[]) {
    const selectedPhoto = croppedPhotos[0];
    clearPendingCrop();

    if (!selectedPhoto || !canUpload || pending) return;

    setPending(true);

    try {
      const preparedPhoto = await compressImageForUpload(selectedPhoto.file, {
        maxDimension: 1400,
        quality: 0.78,
        maxSizeBytes: IMAGE_COMPRESSION_SOURCE_MAX_SIZE,
        maxOutputSizeBytes: 768 * 1024,
        crop: selectedPhoto.crop,
        messages: {
          compressedSize:
            "The image could not be compressed below 768 KB. Choose a simpler or smaller photo.",
          size: "The source image must be 20 MB or smaller.",
        },
      });
      const formData = new FormData();
      formData.set("profile_id", profileId);
      formData.set("photo", preparedPhoto);
      const result = await uploadAdminProfilePhoto(formData);

      setStatus(result.status);
      setMessage(result.message);

      if (result.status === "success") {
        router.refresh();
      }
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not prepare the profile photo.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-[var(--pa-admin-border)] bg-[var(--pa-admin-surface-subtle)] p-3 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:p-4">
      {pendingCrop ? (
        <ProfilePhotoCropper
          photos={pendingCrop}
          onCancel={clearPendingCrop}
          onComplete={(photos) => void uploadCroppedPhoto(photos)}
        />
      ) : null}

      <div className="min-w-0">
        <p className="text-sm font-black text-[var(--pa-admin-ink)]">
          Upload a new main photo
        </p>
        <p className="mt-1 text-xs font-semibold leading-5 text-[var(--pa-admin-muted)]">
          JPG, PNG or WebP. Preview and crop it first; after a successful upload
          it becomes the main photo. The upload uses the member&apos;s normal
          Storage quota.
          {willReplaceMainPhoto
            ? " Because this profile already has five photos, the current main photo is replaced only after the new file is safely attached."
            : ""}
        </p>
        {message ? (
          <p
            role={status === "error" ? "alert" : "status"}
            className={`mt-2 text-xs font-bold ${
              status === "error"
                ? "text-[var(--pa-admin-danger)]"
                : "text-[var(--pa-admin-success)]"
            }`}
          >
            {message}
          </p>
        ) : null}
      </div>

      <input
        id={inputId}
        type="file"
        accept={IMAGE_UPLOAD_ACCEPT}
        disabled={!canUpload || pending}
        className="sr-only"
        onChange={(event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          input.value = "";
          choosePhoto(file);
        }}
      />
      <label
        htmlFor={inputId}
        aria-disabled={!canUpload || pending}
        className={`mt-3 inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl px-4 text-center text-sm font-black sm:mt-0 sm:w-auto ${
          canUpload && !pending
            ? "cursor-pointer bg-[var(--pa-admin-ink)] text-white shadow-sm"
            : "cursor-not-allowed bg-[var(--pa-admin-border)] text-[var(--pa-admin-muted)]"
        }`}
      >
        {pending
          ? "Preparing and uploading…"
          : canUpload
            ? willReplaceMainPhoto
              ? "Choose replacement"
              : "Choose new photo"
            : "Photo data needs repair"}
      </label>
    </div>
  );
}
