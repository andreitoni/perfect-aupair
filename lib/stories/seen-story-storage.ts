export const SEEN_STORIES_CHANGED_EVENT = "pa:seen-stories-changed";

const SEEN_STORIES_STORAGE_KEY = "pa_seen_story_ids_v1";
const SEEN_STORY_TTL_MS = 1000 * 60 * 60 * 48;
const MAX_SEEN_STORIES = 300;

type SeenStoryRecords = Record<string, number>;

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseSeenStories(value: string | null): SeenStoryRecords {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as SeenStoryRecords;
  } catch {
    return {};
  }
}

function normalizeSeenStories(records: SeenStoryRecords) {
  const now = Date.now();

  return Object.fromEntries(
    Object.entries(records)
      .filter(
        ([storyId, viewedAt]) =>
          storyId &&
          Number.isFinite(viewedAt) &&
          now - viewedAt <= SEEN_STORY_TTL_MS,
      )
      .sort(([, firstViewedAt], [, secondViewedAt]) => secondViewedAt - firstViewedAt)
      .slice(0, MAX_SEEN_STORIES),
  );
}

function saveSeenStories(records: SeenStoryRecords) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(SEEN_STORIES_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // localStorage can be unavailable in private contexts; seen state is optional.
  }
}

export function readSeenStoryIds() {
  const storage = getStorage();

  if (!storage) {
    return new Set<string>();
  }

  const records = normalizeSeenStories(
    parseSeenStories(storage.getItem(SEEN_STORIES_STORAGE_KEY)),
  );
  saveSeenStories(records);

  return new Set(Object.keys(records));
}

export function markStorySeen(storyId: string) {
  if (!storyId) {
    return;
  }

  const storage = getStorage();

  if (!storage) {
    return;
  }

  const records = normalizeSeenStories(
    parseSeenStories(storage.getItem(SEEN_STORIES_STORAGE_KEY)),
  );
  records[storyId] = Date.now();
  saveSeenStories(normalizeSeenStories(records));
  window.dispatchEvent(new Event(SEEN_STORIES_CHANGED_EVENT));
}
