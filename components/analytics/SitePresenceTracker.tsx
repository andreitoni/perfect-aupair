"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  LIVE_SITE_PRESENCE_CHANNEL,
  type LivePresenceAudience,
} from "@/lib/analytics/live-presence";
import { isAnalyticsAllowedPath } from "@/lib/analytics/route-privacy";
import { createClient } from "@/lib/supabase/client";

function createPresenceKey() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function SitePresenceTracker() {
  const pathname = usePathname();
  const analyticsAllowed = isAnalyticsAllowedPath(pathname);

  useEffect(() => {
    if (!analyticsAllowed) return;

    const supabase = createClient();
    const presenceKey = createPresenceKey();
    const channel = supabase.channel(LIVE_SITE_PRESENCE_CHANNEL, {
      config: {
        presence: { key: presenceKey },
      },
    });
    let audience: LivePresenceAudience = "visitor";
    let subscribed = false;
    let disposed = false;

    function updatePresence() {
      if (disposed || !subscribed) return;

      if (document.hidden) {
        void channel.untrack();
        return;
      }

      void channel.track({
        audience,
        online_at: new Date().toISOString(),
      });
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (disposed) return;

      audience = data.session ? "authenticated" : "visitor";
      updatePresence();
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        audience = session ? "authenticated" : "visitor";
        updatePresence();
      },
    );

    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED" || disposed) return;

      subscribed = true;
      updatePresence();
    });

    document.addEventListener("visibilitychange", updatePresence);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", updatePresence);
      authListener.subscription.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [analyticsAllowed]);

  return null;
}
