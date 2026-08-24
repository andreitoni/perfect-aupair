import type { SupabaseClient } from "@supabase/supabase-js";
import {
  removeMessageAudioFiles,
  removeMessagePhotoFiles,
  removeMessageVideoFiles,
  type ImageStorageClient,
} from "@/lib/images/storage";

type RetainedMessagePhotoCleanupClient = SupabaseClient & ImageStorageClient;

type RetainedMessagePhoto = {
  id: string;
  original_image_path: string;
};

type RetainedMessageVideo = {
  id: string;
  original_video_path: string;
};

type RetainedMessageAudio = {
  id: string;
  original_audio_path: string;
};

type CleanupRetainedMessagePhotosParams = {
  supabase: RetainedMessagePhotoCleanupClient;
  batchSize?: number;
  now?: Date;
};

export async function cleanupRetainedMessagePhotos({
  supabase,
  batchSize = 100,
  now = new Date(),
}: CleanupRetainedMessagePhotosParams) {
  const cutoff = now.toISOString();
  const safeBatchSize = Math.max(1, Math.min(batchSize, 500));

  const [
    { data: retainedPhotoRows, error: selectPhotoError },
    { data: retainedVideoRows, error: selectVideoError },
    { data: retainedAudioRows, error: selectAudioError },
  ] = await Promise.all([
    supabase
      .from("retained_message_photos")
      .select("id, original_image_path")
      .lte("retained_until", cutoff)
      .order("retained_until", { ascending: true })
      .limit(safeBatchSize),
    supabase
      .from("retained_message_videos")
      .select("id, original_video_path")
      .lte("retained_until", cutoff)
      .order("retained_until", { ascending: true })
      .limit(safeBatchSize),
    supabase
      .from("retained_message_audio")
      .select("id, original_audio_path")
      .lte("retained_until", cutoff)
      .order("retained_until", { ascending: true })
      .limit(safeBatchSize),
  ]);

  if (selectPhotoError) {
    throw new Error(selectPhotoError.message);
  }

  if (selectVideoError) {
    throw new Error(selectVideoError.message);
  }

  if (selectAudioError) {
    throw new Error(selectAudioError.message);
  }

  const retainedPhotos =
    ((retainedPhotoRows ?? []) as RetainedMessagePhoto[]).filter(
      (photo) => photo.id && photo.original_image_path,
    );
  const retainedVideos =
    ((retainedVideoRows ?? []) as RetainedMessageVideo[]).filter(
      (video) => video.id && video.original_video_path,
    );
  const retainedAudio =
    ((retainedAudioRows ?? []) as RetainedMessageAudio[]).filter(
      (audio) => audio.id && audio.original_audio_path,
    );

  if (!retainedPhotos.length && !retainedVideos.length && !retainedAudio.length) {
    return {
      cutoff,
      deletedRows: 0,
      removedFiles: 0,
      deletedPhotoRows: 0,
      deletedVideoRows: 0,
      deletedAudioRows: 0,
      hasMore: false,
    };
  }

  const photoStoragePaths = retainedPhotos.map(
    (photo) => photo.original_image_path,
  );
  const videoStoragePaths = retainedVideos.map(
    (video) => video.original_video_path,
  );
  const audioStoragePaths = retainedAudio.map(
    (audio) => audio.original_audio_path,
  );

  if (photoStoragePaths.length) {
    const { error: storageError } = await removeMessagePhotoFiles(
      supabase,
      photoStoragePaths,
    );

    if (storageError) {
      throw new Error(storageError.message);
    }
  }

  if (videoStoragePaths.length) {
    const { error: storageError } = await removeMessageVideoFiles(
      supabase,
      videoStoragePaths,
    );

    if (storageError) {
      throw new Error(storageError.message);
    }
  }

  if (audioStoragePaths.length) {
    const { error: storageError } = await removeMessageAudioFiles(
      supabase,
      audioStoragePaths,
    );

    if (storageError) {
      throw new Error(storageError.message);
    }
  }

  let deletedPhotoRowsCount = 0;
  let deletedVideoRowsCount = 0;
  let deletedAudioRowsCount = 0;

  if (retainedPhotos.length) {
    const { data: deletedRows, error: deleteError } = await supabase
      .from("retained_message_photos")
      .delete()
      .in(
        "id",
        retainedPhotos.map((photo) => photo.id),
      )
      .select("id");

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    deletedPhotoRowsCount = deletedRows?.length ?? retainedPhotos.length;
  }

  if (retainedVideos.length) {
    const { data: deletedRows, error: deleteError } = await supabase
      .from("retained_message_videos")
      .delete()
      .in(
        "id",
        retainedVideos.map((video) => video.id),
      )
      .select("id");

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    deletedVideoRowsCount = deletedRows?.length ?? retainedVideos.length;
  }

  if (retainedAudio.length) {
    const { data: deletedRows, error: deleteError } = await supabase
      .from("retained_message_audio")
      .delete()
      .in(
        "id",
        retainedAudio.map((audio) => audio.id),
      )
      .select("id");

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    deletedAudioRowsCount = deletedRows?.length ?? retainedAudio.length;
  }

  return {
    cutoff,
    deletedRows:
      deletedPhotoRowsCount + deletedVideoRowsCount + deletedAudioRowsCount,
    removedFiles:
      photoStoragePaths.length +
      videoStoragePaths.length +
      audioStoragePaths.length,
    deletedPhotoRows: deletedPhotoRowsCount,
    deletedVideoRows: deletedVideoRowsCount,
    deletedAudioRows: deletedAudioRowsCount,
    hasMore:
      retainedPhotos.length === safeBatchSize ||
      retainedVideos.length === safeBatchSize ||
      retainedAudio.length === safeBatchSize,
  };
}
