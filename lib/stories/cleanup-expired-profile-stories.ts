import type { SupabaseClient } from "@supabase/supabase-js";
import {
  removeStoryPhotoFiles,
  type ImageStorageClient,
} from "@/lib/images/storage";

type ProfileStoryCleanupClient = SupabaseClient & ImageStorageClient;

type ExpiredProfileStory = {
  id: string;
  storage_path: string;
};

type CleanupExpiredProfileStoriesParams = {
  supabase: ProfileStoryCleanupClient;
  batchSize?: number;
  now?: Date;
};

export async function cleanupExpiredProfileStories({
  supabase,
  batchSize = 100,
  now = new Date(),
}: CleanupExpiredProfileStoriesParams) {
  const cutoff = now.toISOString();
  const safeBatchSize = Math.max(1, Math.min(batchSize, 500));
  const { data: expiredStories, error: selectError } = await supabase
    .from("profile_stories")
    .select("id, storage_path")
    .lte("expires_at", cutoff)
    .order("expires_at", { ascending: true })
    .limit(safeBatchSize);

  if (selectError) {
    throw new Error(selectError.message);
  }

  const stories = ((expiredStories ?? []) as ExpiredProfileStory[]).filter(
    (story) => story.id && story.storage_path,
  );

  if (!stories.length) {
    return {
      cutoff,
      deletedStories: 0,
      removedFiles: 0,
      hasMore: false,
    };
  }

  const storagePaths = stories.map((story) => story.storage_path);
  const { error: storageError } = await removeStoryPhotoFiles(
    supabase,
    storagePaths,
  );

  if (storageError) {
    throw new Error(storageError.message);
  }

  const { data: deletedRows, error: deleteError } = await supabase
    .from("profile_stories")
    .delete()
    .in(
      "id",
      stories.map((story) => story.id),
    )
    .select("id");

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  return {
    cutoff,
    deletedStories: deletedRows?.length ?? stories.length,
    removedFiles: storagePaths.length,
    hasMore: stories.length === safeBatchSize,
  };
}
