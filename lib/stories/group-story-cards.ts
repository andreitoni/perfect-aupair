type StoryCardSource = {
  id: string;
  profile_id?: string | null;
  created_at?: string | null;
};

function storyTime(story: StoryCardSource) {
  return new Date(story.created_at ?? 0).getTime();
}

export function groupLatestStoryByProfile<T extends StoryCardSource>(
  stories: T[],
) {
  const latestByProfile = new Map<string, T>();

  for (const story of stories) {
    const key = story.profile_id ?? story.id;
    const currentStory = latestByProfile.get(key);

    if (!currentStory || storyTime(story) > storyTime(currentStory)) {
      latestByProfile.set(key, story);
    }
  }

  return Array.from(latestByProfile.values()).sort(
    (firstStory, secondStory) => storyTime(secondStory) - storyTime(firstStory),
  );
}
