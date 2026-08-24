"use client";

import { type ComponentType, useEffect, useState } from "react";

type IdleWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (
      callback: IdleRequestCallback,
      options?: IdleRequestOptions,
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

export function DeferredSitePresenceTracker() {
  const [Tracker, setTracker] = useState<ComponentType | null>(null);

  useEffect(() => {
    let disposed = false;
    let delayId: number | null = null;
    let idleId: number | null = null;
    const idleWindow = window as IdleWindow;

    function importTracker() {
      void import("@/components/analytics/SitePresenceTracker").then(
        ({ SitePresenceTracker }) => {
          if (!disposed) setTracker(() => SitePresenceTracker);
        },
      );
    }

    function scheduleImport() {
      delayId = window.setTimeout(() => {
        if (idleWindow.requestIdleCallback) {
          idleId = idleWindow.requestIdleCallback(importTracker, {
            timeout: 5_000,
          });
          return;
        }

        importTracker();
      }, 1_500);
    }

    if (document.readyState === "complete") {
      scheduleImport();
    } else {
      window.addEventListener("load", scheduleImport, { once: true });
    }

    return () => {
      disposed = true;
      window.removeEventListener("load", scheduleImport);

      if (delayId !== null) window.clearTimeout(delayId);
      if (idleId !== null) idleWindow.cancelIdleCallback?.(idleId);
    };
  }, []);

  return Tracker ? <Tracker /> : null;
}
