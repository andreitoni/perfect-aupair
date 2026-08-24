"use client";

import Script from "next/script";
import { useEffect, useId, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

type TurnstileChallengeProps = {
  siteKey?: string;
  refreshKey?: string | number;
  onToken: (token: string) => void;
};

export function TurnstileChallenge({
  siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  refreshKey = 0,
  onToken,
}: TurnstileChallengeProps) {
  const rawId = useId();
  const elementId = `turnstile-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const widgetIdRef = useRef<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!siteKey || !isReady || !window.turnstile) {
      return;
    }

    if (widgetIdRef.current) {
      window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    }

    const widgetId = window.turnstile.render(`#${elementId}`, {
      sitekey: siteKey,
      callback: onToken,
      "expired-callback": () => onToken(""),
      "error-callback": () => onToken(""),
    });
    widgetIdRef.current = widgetId;

    return () => {
      if (widgetIdRef.current) {
        window.turnstile?.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [elementId, isReady, onToken, refreshKey, siteKey]);

  if (!siteKey) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-[#d8e6eb] bg-[#f8fbfc] p-4">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setIsReady(true)}
      />
      <div id={elementId} className="min-h-[65px]" />
    </div>
  );
}
