"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import {
  IMAGE_UPLOAD_ACCEPT,
  IMAGE_COMPRESSION_SOURCE_MAX_SIZE,
  compressImageForUpload,
  validateImageUploadFile,
} from "@/lib/images/compress";
import {
  removeProfilePhotoFiles,
  uploadProfilePhotoFile,
} from "@/lib/images/storage";
import { useTranslations } from "@/components/i18n/I18nProvider";
import type { ProfileVideo } from "@/components/profile/ProfileVideoUploader";
import type {
  CroppedProfilePhoto,
  ProfilePhotoCropSource,
} from "@/components/profile/ProfilePhotoCropper";
import { trackFunnelEvent } from "@/lib/analytics/client";
import {
  getProfilePhotoVariantUrl,
  PROFILE_PHOTO_PREVIEW_WIDTH,
  shouldBypassImageOptimization,
} from "@/lib/images/optimization";

type ProfilePhoto = {
  id: string;
  storage_path: string;
  public_url: string;
  is_primary: boolean;
  sort_order: number;
};

type ProfilePhotoManagerProps = {
  profileId: string;
  isRequired: boolean;
  initialPhotos: ProfilePhoto[];
  initialVideo?: ProfileVideo | null;
  continueHref?: string;
};

const MAX_PHOTOS = 5;
const subscribeToHydration = () => () => {};
function ProfilePhotoCropperLoading() {
  const t = useTranslations();

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
        {t("common.loading")}
      </div>
    </div>
  );
}
const ProfilePhotoCropper = dynamic(
  () =>
    import("@/components/profile/ProfilePhotoCropper").then(
      (module) => module.ProfilePhotoCropper,
    ),
  {
    ssr: false,
    loading: ProfilePhotoCropperLoading,
  },
);
const ProfileVideoUploader = dynamic(
  () =>
    import("@/components/profile/ProfileVideoUploader").then(
      (module) => module.ProfileVideoUploader,
    ),
  {
    ssr: false,
    loading: () => (
      <section
        aria-hidden="true"
        className="mt-4 animate-pulse rounded-[1.25rem] border border-[#d6e2e8] bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.58fr)]">
          <div className="min-w-0 space-y-3">
            <div className="h-8 w-36 rounded-full bg-[#dff6ea]" />
            <div className="h-6 w-44 rounded-lg bg-[#e4ecef]" />
            <div className="h-4 w-full rounded bg-[#eef3f5]" />
            <div className="h-4 w-5/6 rounded bg-[#eef3f5]" />
            <div className="h-11 w-36 rounded-[0.7rem] bg-[#cfe5ec]" />
            <div className="h-3 w-52 max-w-full rounded bg-[#eef3f5]" />
          </div>
          <div className="aspect-square w-full max-w-[16rem] rounded-[0.9rem] bg-[#172426]/90 sm:max-w-[20rem] lg:max-w-none lg:aspect-video" />
        </div>
      </section>
    ),
  },
);

export function ProfilePhotoManager({
  profileId,
  isRequired,
  initialPhotos,
  initialVideo = null,
  continueHref = "/auth/home",
}: ProfilePhotoManagerProps) {
  const t = useTranslations();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingCropPhotosRef = useRef<ProfilePhotoCropSource[] | null>(null);
  const publicationNotificationRequestedRef = useRef(false);

  const [photos, setPhotos] = useState(initialPhotos);
  const [pendingCropPhotos, setPendingCropPhotos] = useState<
    ProfilePhotoCropSource[] | null
  >(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [pendingPhotoAction, setPendingPhotoAction] = useState<string | null>(
    null,
  );
  const isInteractive = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const [error, setError] = useState("");

  const canContinue = !isRequired || photos.length > 0;
  const remainingPhotoSlots = MAX_PHOTOS - photos.length;
  const isBusy =
    isUploading ||
    isContinuing ||
    pendingCropPhotos !== null ||
    pendingPhotoAction !== null;
  const statusMessage = isUploading
    ? t("profile.uploadingPhotosStatus")
    : isContinuing
      ? t("profile.continuingStatus")
      : "";

  useEffect(
    () => () => {
      for (const photo of pendingCropPhotosRef.current ?? []) {
        URL.revokeObjectURL(photo.imageUrl);
      }
    },
    [],
  );

  function handleUpload(
    files: FileList | null,
    sourceInput = inputRef.current,
  ) {
    setError("");

    if (!files?.length) return;

    const selectedFiles = Array.from(files);
    const remainingSlots = MAX_PHOTOS - photos.length;

    if (remainingSlots <= 0) {
      setError(t("profile.photoLimit"));
      if (sourceInput) sourceInput.value = "";
      return;
    }

    if (selectedFiles.length > remainingSlots) {
      setError(t("profile.photoSlotsRemaining", { count: remainingSlots }));
      if (sourceInput) sourceInput.value = "";
      return;
    }

    const filesToUpload = selectedFiles;

    for (const file of filesToUpload) {
      const validationError = validateImageUploadFile(file, {
        maxSizeBytes: IMAGE_COMPRESSION_SOURCE_MAX_SIZE,
        messages: {
          size: t("profile.photoSize"),
        },
      });

      if (validationError) {
        setError(validationError);
        if (sourceInput) sourceInput.value = "";
        return;
      }
    }

    const cropPhotos = filesToUpload.map((file) => ({
      file,
      imageUrl: URL.createObjectURL(file),
    }));

    pendingCropPhotosRef.current = cropPhotos;
    setPendingCropPhotos(cropPhotos);

    if (sourceInput) sourceInput.value = "";
  }

  function clearPendingPhotoCrop() {
    for (const photo of pendingCropPhotosRef.current ?? []) {
      URL.revokeObjectURL(photo.imageUrl);
    }

    pendingCropPhotosRef.current = null;
    setPendingCropPhotos(null);
  }

  function cancelPhotoCrop() {
    clearPendingPhotoCrop();
  }

  const notifyProfilePublishedOnce = useCallback(() => {
    if (publicationNotificationRequestedRef.current) return;

    publicationNotificationRequestedRef.current = true;
    void fetch("/api/admin-notifications/profile-published", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
    })
      .then((response) => {
        if (!response.ok) {
          publicationNotificationRequestedRef.current = false;
        }
      })
      .catch(() => {
        publicationNotificationRequestedRef.current = false;
      });
  }, []);

  useEffect(() => {
    if (photos.length === 0) return;

    notifyProfilePublishedOnce();
  }, [notifyProfilePublishedOnce, photos.length]);

  async function uploadCroppedPhotos(croppedPhotos: CroppedProfilePhoto[]) {
    clearPendingPhotoCrop();
    setIsUploading(true);
    const uploadedPhotos: ProfilePhoto[] = [];

    try {
      const supabasePromise = import("@/lib/supabase/client").then(
        ({ createClient }) => createClient(),
      );
      const filesForUpload: File[] = [];

      for (const { file, crop } of croppedPhotos) {
        filesForUpload.push(
          await compressImageForUpload(file, {
            maxDimension: 1400,
            quality: 0.78,
            maxSizeBytes: IMAGE_COMPRESSION_SOURCE_MAX_SIZE,
            maxOutputSizeBytes: 768 * 1024,
            crop,
            messages: {
              size: t("profile.photoSize"),
              compressedSize: t("profile.photoCompressedTooLarge"),
            },
          }),
        );
      }

      const supabase = await supabasePromise;

      for (const file of filesForUpload) {
        const shouldBePrimary =
          photos.length === 0 && uploadedPhotos.length === 0;
        const { storagePath, publicUrl } = await uploadProfilePhotoFile({
          supabase,
          profileId,
          file,
        });

        const { data: insertedPhoto, error: insertError } = await supabase
          .from("profile_photos")
          .insert({
            profile_id: profileId,
            storage_path: storagePath,
            sort_order: photos.length + uploadedPhotos.length,
            is_primary: shouldBePrimary,
          })
          .select("id, storage_path, is_primary, sort_order")
          .single();

        if (insertError) {
          await removeProfilePhotoFiles(supabase, storagePath);
          throw new Error(insertError.message);
        }

        const uploadedPhoto = {
          ...insertedPhoto,
          public_url: publicUrl,
        };

        uploadedPhotos.push(uploadedPhoto);
        setPhotos((currentPhotos) => [...currentPhotos, uploadedPhoto]);

      }

      trackFunnelEvent("profile_photo_uploaded", {
        uploaded_count: uploadedPhotos.length,
        first_photo: photos.length === 0,
        required_step: isRequired,
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : t("profile.photoUploadFailed"),
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function setPrimaryPhoto(photoId: string) {
    if (pendingPhotoAction) return;

    setError("");
    setPendingPhotoAction(`primary:${photoId}`);

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc(
        "set_primary_profile_photo",
        { p_photo_id: photoId },
      );

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      setPhotos((currentPhotos) =>
        currentPhotos.map((photo) => ({
          ...photo,
          is_primary: photo.id === photoId,
        })),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : t("common.errorTryAgain"),
      );
    } finally {
      setPendingPhotoAction(null);
    }
  }

  async function deletePhoto(photo: ProfilePhoto) {
    if (pendingPhotoAction) return;

    setError("");
    setPendingPhotoAction(`delete:${photo.id}`);

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("profile_photos")
        .delete()
        .eq("id", photo.id);

      if (deleteError) {
        setError(deleteError.message);
        return;
      }

      await removeProfilePhotoFiles(supabase, photo.storage_path);

      const remainingPhotos = photos.filter((item) => item.id !== photo.id);

      setPhotos(remainingPhotos);

      if (photo.is_primary && remainingPhotos.length > 0) {
        const { error: primaryError } = await supabase.rpc(
          "set_primary_profile_photo",
          { p_photo_id: remainingPhotos[0].id },
        );

        if (primaryError) {
          setError(primaryError.message);
        } else {
          setPhotos((currentPhotos) =>
            currentPhotos.map((item, index) => ({
              ...item,
              is_primary: index === 0,
            })),
          );
        }
      } else if (remainingPhotos.length === 0) {
        router.refresh();
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : t("common.errorTryAgain"),
      );
    } finally {
      setPendingPhotoAction(null);
    }
  }

  function navigateToContinueHref() {
    if (isBusy) return;
    setError("");
    setIsContinuing(true);
    window.location.assign(continueHref);
  }

  function continueToAccount() {
    if (isBusy) return;

    if (!canContinue) {
      setError(t("profile.photoRequired"));
      return;
    }

    trackFunnelEvent("profile_photo_step_completed", {
      photo_count: photos.length,
      required_step: isRequired,
    });
    navigateToContinueHref();
  }

  return (
    <div className="rounded-[1.5rem] bg-white p-4 shadow-sm ring-1 ring-black/5 sm:rounded-[2rem] sm:p-7">
      {pendingCropPhotos ? (
        <ProfilePhotoCropper
          photos={pendingCropPhotos}
          onCancel={cancelPhotoCrop}
          onComplete={uploadCroppedPhotos}
        />
      ) : null}

      <div className="mb-7">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#6f8793]">
          {t("profile.requiredPhotoTitle")}
        </p>

        <h1 className="mt-3 text-2xl font-bold tracking-[-0.03em] sm:text-4xl">
          {t("profile.addPhotosTitle")}
        </h1>

        <p className="mt-3 max-w-2xl leading-7 text-[#25302d]/58">
          {t("profile.addPhotosHelp")}
          {isRequired ? ` ${t("profile.requiredProfilePhotoHelp")}` : ""}
        </p>
      </div>

      {error ? (
        <div className="mb-5 rounded-2xl border border-[#d95f49]/20 bg-[#fff5f2] p-4 text-sm font-semibold text-[#9d3f2f]">
          {error}
        </div>
      ) : null}

      <div className="rounded-[1.5rem] border border-dashed border-black/15 bg-[var(--background)] p-4 sm:p-5">
        {isInteractive ? (
          <input
            ref={inputRef}
            type="file"
            accept={IMAGE_UPLOAD_ACCEPT}
            multiple={remainingPhotoSlots > 1}
            className="hidden"
            onChange={(event) =>
              handleUpload(event.currentTarget.files, event.currentTarget)
            }
          />
        ) : null}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold">{t("profile.uploadPhotos")}</p>
            <p className="mt-1 text-sm font-semibold text-[#25302d]/50">
              {t("profile.photoFileHelp")}
            </p>
          </div>

          <button
            type="button"
            disabled={!isInteractive || isBusy || photos.length >= MAX_PHOTOS}
            onClick={() => inputRef.current?.click()}
            className="w-full rounded-full bg-[var(--pa-primary)] px-5 py-3 text-sm font-bold text-[var(--pa-primary-ink)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {isUploading ? t("common.uploading") : t("profile.choosePhotos")}
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-bold text-[#25302d]/70">
          {t("profile.photosUploaded", {
            count: photos.length,
            max: MAX_PHOTOS,
          })}
        </p>

        {photos.length > 0 ? (
          <p className="text-sm font-semibold text-[#25302d]/45">
            {t("profile.mainPhotoSearchHelp")}
          </p>
        ) : null}
      </div>

      {photos.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {photos.map((photo) => {
            const previewUrl = getProfilePhotoVariantUrl(
              photo.public_url,
              PROFILE_PHOTO_PREVIEW_WIDTH,
            );

            return (
              <div
                key={photo.id}
                className="overflow-hidden rounded-[1.5rem] border border-black/10 bg-white shadow-sm"
              >
                <div className="relative aspect-square bg-[#f7f3ed]">
                  <Image
                    src={previewUrl}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 280px, 50vw"
                    loading={photo.is_primary ? "eager" : "lazy"}
                    unoptimized={shouldBypassImageOptimization(previewUrl)}
                    draggable={false}
                    className="pa-protected-media h-full w-full object-cover object-[center_22%]"
                  />
                </div>

                <div className="space-y-2 p-3">
                  {photo.is_primary ? (
                    <div className="rounded-full bg-[#e7f1f4] px-3 py-2 text-center text-xs font-bold text-[#45636f]">
                      {t("profile.mainPhoto")}
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy}
                      aria-busy={
                        pendingPhotoAction === `primary:${photo.id}` || undefined
                      }
                      onClick={() => setPrimaryPhoto(photo.id)}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-black/10 px-3 py-2 text-xs font-bold text-[#25302d] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {pendingPhotoAction === `primary:${photo.id}` ? (
                        <span
                          aria-hidden="true"
                          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                        />
                      ) : null}
                      {t("profile.makeMainPhoto")}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isBusy}
                    aria-busy={
                      pendingPhotoAction === `delete:${photo.id}` || undefined
                    }
                    onClick={() => deletePhoto(photo)}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#fff5f2] px-3 py-2 text-xs font-bold text-[#9d3f2f] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pendingPhotoAction === `delete:${photo.id}` ? (
                      <span
                        aria-hidden="true"
                        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                      />
                    ) : null}
                    {t("common.delete")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-[1.5rem] bg-[#f7f3ed] p-6 text-center text-sm font-semibold text-[#25302d]/55">
          {t("profile.noPhotosUploaded")}
        </div>
      )}

      <ProfileVideoUploader profileId={profileId} initialVideo={initialVideo} />

      <div className="mt-7 flex flex-col justify-end gap-3 border-t border-black/10 pt-6 sm:flex-row">
        {!isRequired ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={navigateToContinueHref}
            className="w-full rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-bold text-[#25302d] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {t("profile.skipForNow")}
          </button>
        ) : null}

        <button
          type="button"
          disabled={isBusy}
          onClick={continueToAccount}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--pa-primary)] px-5 py-3 text-sm font-bold text-[var(--pa-primary-ink)] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
        >
          {isContinuing ? (
            <span
              aria-hidden="true"
              className="h-4 w-4 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
            />
          ) : null}
          {isContinuing ? t("profile.continuing") : t("profile.continue")}
        </button>
      </div>

      {statusMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 rounded-2xl border border-[#b7d7e3] bg-[#f4fbff] px-4 py-3 text-sm font-bold text-[#45636f]"
        >
          {statusMessage}
        </div>
      ) : null}
    </div>
  );
}
