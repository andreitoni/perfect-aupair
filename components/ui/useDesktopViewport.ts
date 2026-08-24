"use client";

import { useSyncExternalStore } from "react";

const DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";

function subscribeToDesktopViewport(onChange: () => void) {
  const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
  mediaQuery.addEventListener("change", onChange);

  return () => mediaQuery.removeEventListener("change", onChange);
}

function getDesktopViewportSnapshot() {
  return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
}

function getServerDesktopViewportSnapshot() {
  return false;
}

export function useDesktopViewport(initialDesktopViewport = false) {
  return useSyncExternalStore(
    subscribeToDesktopViewport,
    getDesktopViewportSnapshot,
    initialDesktopViewport ? () => true : getServerDesktopViewportSnapshot,
  );
}
