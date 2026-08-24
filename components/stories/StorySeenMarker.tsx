"use client";

import { useEffect, useRef } from "react";
import { markStorySeen } from "@/lib/stories/seen-story-storage";
import { createClient } from "@/lib/supabase/client";

type StorySeenMarkerProps = {
  storyId: string;
  shouldRecordView?: boolean;
};

export function StorySeenMarker({
  storyId,
  shouldRecordView = false,
}: StorySeenMarkerProps) {
  const recordedStoryId = useRef<string | null>(null);

  useEffect(() => {
    markStorySeen(storyId);

    if (!shouldRecordView || recordedStoryId.current === storyId) {
      return;
    }

    recordedStoryId.current = storyId;
    const supabase = createClient();

    void supabase
      .rpc("record_profile_story_view", { p_story_id: storyId })
      .then(({ error }) => {
        if (error) {
          console.error("Could not record profile story view.", {
            storyId,
            message: error.message,
          });
        }
      });
  }, [shouldRecordView, storyId]);

  return null;
}
