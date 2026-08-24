import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_STORY_IDS_PER_REQUEST = 64;

export async function loadViewedStoryIds(
  supabase: SupabaseClient,
  storyIds: Array<string | null | undefined>,
) {
  const boundedStoryIds = Array.from(
    new Set(storyIds.filter((storyId): storyId is string => Boolean(storyId))),
  ).slice(0, MAX_STORY_IDS_PER_REQUEST);

  if (boundedStoryIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase.rpc(
    "get_viewed_profile_story_ids",
    { p_story_ids: boundedStoryIds },
  );

  if (error) {
    console.error("Could not restore viewed story state.", {
      message: error.message,
    });
    return [];
  }

  return (data ?? []).filter(
    (storyId: unknown): storyId is string => typeof storyId === "string",
  );
}
