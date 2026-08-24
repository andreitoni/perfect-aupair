"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "@/components/i18n/I18nProvider";

const NAVIGATION_FEEDBACK_TIMEOUT_MS = 10_000;

function isModifiedClick(event: MouseEvent) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

export function NavigationFeedback() {
  const t = useTranslations();
  const [pending, setPending] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const locationWatcherRef = useRef<number | null>(null);

  useEffect(() => {
    function resetFeedback() {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (locationWatcherRef.current !== null) {
        window.clearInterval(locationWatcherRef.current);
        locationWatcherRef.current = null;
      }

      setPending(false);
    }

    function startFeedback() {
      resetFeedback();

      const startingLocation = window.location.href;
      setPending(true);

      locationWatcherRef.current = window.setInterval(() => {
        if (window.location.href !== startingLocation) {
          resetFeedback();
        }
      }, 100);
      timeoutRef.current = window.setTimeout(
        resetFeedback,
        NAVIGATION_FEEDBACK_TIMEOUT_MS,
      );
    }

    function handleDocumentClick(event: MouseEvent) {
      if (isModifiedClick(event)) {
        return;
      }

      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      // Controls nested inside a large linked card own their interaction and
      // may intentionally prevent the surrounding link navigation.
      if (target.closest("button, input, select, textarea, [role='button']")) {
        return;
      }

      const anchor = target.closest<HTMLAnchorElement>("a[href]");

      if (
        !anchor ||
        anchor.dataset.paNavigationFeedback === "off" ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      ) {
        return;
      }

      let destination: URL;

      try {
        destination = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      if (
        destination.origin !== window.location.origin ||
        !["http:", "https:"].includes(destination.protocol) ||
        destination.href === window.location.href ||
        (destination.pathname === window.location.pathname &&
          destination.search === window.location.search &&
          destination.hash)
      ) {
        return;
      }

      startFeedback();
    }

    // Capture is intentional: Next.js Link prevents the native default while
    // starting its client navigation. Links that intentionally open an
    // in-place dialog opt out with data-pa-navigation-feedback="off".
    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("pageshow", resetFeedback);
    window.addEventListener("popstate", resetFeedback);

    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("pageshow", resetFeedback);
      window.removeEventListener("popstate", resetFeedback);
      resetFeedback();
    };
  }, []);

  if (!pending) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[140] h-1 overflow-hidden bg-[#dbe9ee]"
    >
      <span className="absolute inset-y-0 left-0 w-2/3 animate-pulse rounded-r-full bg-[var(--pa-primary)] shadow-[0_0_12px_rgba(61,130,153,0.5)]" />
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
}
