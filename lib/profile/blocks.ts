import type { SupabaseClient } from "@supabase/supabase-js";

type ProfileLike = {
  id: string;
};

type StoryLike = {
  profile_id?: string | null;
};

type BlockedProfileRow = {
  profile_id: string | null;
};

export async function isProfilePairBlocked(
  supabase: SupabaseClient,
  firstProfileId: string | null | undefined,
  secondProfileId: string | null | undefined,
) {
  if (!firstProfileId || !secondProfileId || firstProfileId === secondProfileId) {
    return false;
  }

  try {
    const { data, error } = await supabase.rpc("profile_pair_blocked", {
      p_first_profile_id: firstProfileId,
      p_second_profile_id: secondProfileId,
    });

    if (error) {
      return true;
    }

    return Boolean(data);
  } catch {
    return true;
  }
}

export async function getBlockedProfileIdsForViewer(
  supabase: SupabaseClient,
  viewerProfileId: string | null | undefined,
  profileIds: Array<string | null | undefined>,
) {
  const uniqueProfileIds = Array.from(
    new Set(
      profileIds.filter(
        (profileId): profileId is string =>
          Boolean(profileId) && profileId !== viewerProfileId,
      ),
    ),
  );

  if (!viewerProfileId || uniqueProfileIds.length === 0) {
    return new Set<string>();
  }

  const batches = Array.from(
    { length: Math.ceil(uniqueProfileIds.length / 200) },
    (_, index) => uniqueProfileIds.slice(index * 200, (index + 1) * 200),
  );
  const batchResults = await Promise.allSettled(
    batches.map((profileIdBatch) =>
      supabase.rpc("get_blocked_profile_ids", {
        p_profile_ids: profileIdBatch,
      }),
    ),
  );

  const successfulBatchResults = batchResults.flatMap((result) =>
    result.status === "fulfilled" && !result.value.error ? [result.value] : [],
  );

  if (successfulBatchResults.length === batches.length) {
    return new Set(
      successfulBatchResults
        .flatMap(({ data }) => (data ?? []) as BlockedProfileRow[])
        .map((row) => row.profile_id)
        .filter((profileId): profileId is string => Boolean(profileId)),
    );
  }

  const blockedChecks = await Promise.all(
    uniqueProfileIds.map((profileId) =>
      isProfilePairBlocked(supabase, viewerProfileId, profileId),
    ),
  );

  return new Set(
    uniqueProfileIds.filter((_, index) => blockedChecks[index]),
  );
}

export async function filterBlockedProfilesForViewer<TProfile extends ProfileLike>(
  supabase: SupabaseClient,
  viewerProfileId: string | null | undefined,
  profiles: TProfile[],
) {
  if (!viewerProfileId || profiles.length === 0) {
    return profiles;
  }

  const blockedProfileIds = await getBlockedProfileIdsForViewer(
    supabase,
    viewerProfileId,
    profiles.map((profile) => profile.id),
  );

  return profiles.filter((profile) => !blockedProfileIds.has(profile.id));
}

export async function filterBlockedStoriesForViewer<TStory extends StoryLike>(
  supabase: SupabaseClient,
  viewerProfileId: string | null | undefined,
  stories: TStory[],
) {
  if (!viewerProfileId || stories.length === 0) {
    return stories;
  }

  const blockedProfileIds = await getBlockedProfileIdsForViewer(
    supabase,
    viewerProfileId,
    stories.map((story) => story.profile_id),
  );

  return stories.filter(
    (story) => !story.profile_id || !blockedProfileIds.has(story.profile_id),
  );
}
