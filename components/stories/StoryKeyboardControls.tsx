"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type StoryKeyboardControlsProps = {
  closeHref: string;
  previousHref?: string | null;
  nextHref?: string | null;
};

export function StoryKeyboardControls({
  closeHref,
  previousHref,
  nextHref,
}: StoryKeyboardControlsProps) {
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        router.replace(closeHref);
        return;
      }

      if (event.key === "ArrowLeft" && previousHref) {
        event.preventDefault();
        router.push(previousHref);
        return;
      }

      if (event.key === "ArrowRight" && nextHref) {
        event.preventDefault();
        router.push(nextHref);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeHref, nextHref, previousHref, router]);

  return null;
}
