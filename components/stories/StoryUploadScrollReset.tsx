"use client";

import { scrollToPageTopInstantly } from "@/lib/scroll/instant";
import { useLayoutEffect } from "react";

export function StoryUploadScrollReset() {
  useLayoutEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    scrollToPageTopInstantly();

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  return null;
}
