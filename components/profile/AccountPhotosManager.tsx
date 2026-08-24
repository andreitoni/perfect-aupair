"use client";

import Image from "next/image";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { removeProfilePhotoFiles } from "@/lib/images/storage";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "@/components/i18n/I18nProvider";
import {
  getProfilePhotoVariantUrl,
  PROFILE_PHOTO_PREVIEW_WIDTH,
  shouldBypassImageOptimization,
} from "@/lib/images/optimization";

const MAX_PROFILE_PHOTOS = 5;

type AccountPhoto = {
  id: string;
  storage_path: string;
  public_url: string;
  is_primary: boolean;
  sort_order: number;
};

type AccountPhotosManagerProps = {
  initialPhotos: AccountPhoto[];
  isPhotoRequired: boolean;
};

export function AccountPhotosManager({
  initialPhotos,
  isPhotoRequired,
}: AccountPhotosManagerProps) {
  const t = useTranslations();
  const router = useRouter();
  const supabase = createClient();

  const [photos, setPhotos] = useState(initialPhotos);
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const canAddMorePhotos = photos.length < MAX_PROFILE_PHOTOS;

  async function setPrimaryPhoto(photoId: string) {
    setError("");
    setIsBusy(true);

    try {
      const { error: rpcError } = await supabase.rpc(
        "set_primary_profile_photo",
        {
          p_photo_id: photoId,
        },
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

      router.refresh();
    } finally {
      setIsBusy(false);
    }
  }

  async function deletePhoto(photo: AccountPhoto) {
    setError("");

    if (isPhotoRequired && photos.length <= 1) {
      setError(t("profile.requiredPhotoText"));
      return;
    }

    setIsBusy(true);

    try {
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
        const nextPrimaryPhoto = remainingPhotos[0];

        const { error: rpcError } = await supabase.rpc(
          "set_primary_profile_photo",
          {
            p_photo_id: nextPrimaryPhoto.id,
          },
        );

        if (!rpcError) {
          setPhotos((currentPhotos) =>
            currentPhotos.map((item) => ({
              ...item,
              is_primary: item.id === nextPrimaryPhoto.id,
            })),
          );
        }
      }

      router.refresh();
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="mt-4 rounded-[1.25rem] border border-[#d6e2e8] bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black tracking-normal text-[#172426]">
            {t("common.photos")}
          </h2>
          <p className="mt-1 text-sm font-semibold text-[#25302d]/50">
            {t("profile.photosUploaded", {
              count: photos.length,
              max: MAX_PROFILE_PHOTOS,
            })}
          </p>
        </div>

        {canAddMorePhotos ? (
          <Link
            href="/profile/photos?next=/account"
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[0.7rem] bg-[#cfe5ec] px-5 text-center text-sm font-black text-[#172426] transition hover:bg-[#bddae3] sm:w-auto"
          >
            <span aria-hidden="true" className="text-base leading-none">
              +
            </span>
            {t("profile.addPhotos")}
          </Link>
        ) : (
          <span className="inline-flex h-10 w-full items-center justify-center rounded-[0.7rem] bg-[#e7f1f4] px-5 text-sm font-black text-[#45636f] sm:w-auto">
            {t("profile.photoLimitReached")}
          </span>
        )}
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-[#d95f49]/20 bg-[#fff5f2] p-4 text-sm font-semibold text-[#9d3f2f]">
          {error}
        </div>
      ) : null}

      {photos.length > 0 ? (
        <div className="grid max-w-[34rem] grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(12rem,16rem))] sm:gap-4">
          {photos.map((photo) => {
            const previewUrl = getProfilePhotoVariantUrl(
              photo.public_url,
              PROFILE_PHOTO_PREVIEW_WIDTH,
            );

            return (
              <div
                key={photo.id}
                className="overflow-hidden rounded-[0.9rem] border border-[#d6e2e8] bg-white shadow-sm"
              >
                <div className="relative aspect-square">
                  <Image
                    src={previewUrl}
                    alt=""
                    fill
                    sizes="320px"
                    unoptimized={shouldBypassImageOptimization(previewUrl)}
                    draggable={false}
                    className="pa-protected-media h-full w-full object-cover object-[center_22%]"
                  />
                </div>

                <div className="space-y-2 bg-white p-2.5">
                  {photo.is_primary ? (
                    <div className="rounded-[0.55rem] bg-[#e7f1f4] px-2 py-1.5 text-center text-xs font-bold leading-tight text-[#45636f]">
                      {t("profile.mainPhoto")}
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setPrimaryPhoto(photo.id)}
                      className="min-h-11 w-full rounded-[0.55rem] border border-[#cbe3ec] bg-[#f7fbfc] px-2 py-1.5 text-xs font-bold leading-tight text-[#2f6578] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t("profile.makeMainPhoto")}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => deletePhoto(photo)}
                    className="min-h-11 w-full rounded-[0.55rem] bg-[#fff2ed] px-2 py-1.5 text-xs font-bold leading-tight text-[#9d3f2f] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t("common.delete")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[0.9rem] border border-[#d6e2e8] bg-[#f7fbfc] p-6 text-center text-sm font-semibold text-[#25302d]/55">
          {t("profile.noPhotosUploaded")}
        </div>
      )}
    </section>
  );
}
