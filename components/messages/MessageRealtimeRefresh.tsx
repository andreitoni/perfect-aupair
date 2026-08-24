"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type MessageRealtimeRefreshProps = {
  conversationId: string;
  messageVisibilityAfter?: string | null;
  initialMessageCount: number;
  initialLatestMessageAt: string | null;
  initialConversationUpdatedAt: string;
  initialIsConversationBlocked?: boolean;
};

const REALTIME_POLL_INTERVAL_MS = 180_000;
const DISCONNECTED_POLL_INTERVAL_MS = 30_000;
const POLL_MAX_BACKOFF_MS = 300_000;
const FOCUS_FRESHNESS_MS = 5_000;
const MIN_REFRESH_GAP_MS = 1_000;

export function MessageRealtimeRefresh({
  conversationId,
  messageVisibilityAfter = null,
  initialMessageCount,
  initialLatestMessageAt,
  initialConversationUpdatedAt,
  initialIsConversationBlocked = false,
}: MessageRealtimeRefreshProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialFingerprint = [
    initialMessageCount,
    initialLatestMessageAt ?? "",
    initialConversationUpdatedAt,
    initialIsConversationBlocked ? "blocked" : "open",
  ].join(":");
  const fingerprintRef = useRef(initialFingerprint);
  const lastInitialFingerprintRef = useRef(initialFingerprint);
  const lastConversationIdRef = useRef(conversationId);

  useEffect(() => {
    if (lastConversationIdRef.current !== conversationId) {
      fingerprintRef.current = initialFingerprint;
      lastConversationIdRef.current = conversationId;
    } else if (fingerprintRef.current === lastInitialFingerprintRef.current) {
      fingerprintRef.current = initialFingerprint;
    }

    lastInitialFingerprintRef.current = initialFingerprint;
  }, [conversationId, initialFingerprint]);

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let pendingRefresh = false;
    let pollRequest: Promise<void> | null = null;
    let pollTimer: number | null = null;
    let consecutivePollFailures = 0;
    let lastPollStartedAt = 0;
    let lastRefreshAt = 0;
    let realtimeConnected = false;
    let realtimeStopped = false;

    function canPoll() {
      return !disposed && !document.hidden && navigator.onLine;
    }

    function getNextPollDelay() {
      const baseDelay = realtimeConnected
        ? REALTIME_POLL_INTERVAL_MS
        : DISCONNECTED_POLL_INTERVAL_MS;

      return Math.min(
        baseDelay * 2 ** consecutivePollFailures,
        POLL_MAX_BACKOFF_MS,
      );
    }

    function scheduleRefresh() {
      if (disposed) return;

      if (document.hidden) {
        pendingRefresh = true;
        return;
      }

      pendingRefresh = false;

      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }

      const refreshDelay = Math.max(
        120,
        MIN_REFRESH_GAP_MS - (Date.now() - lastRefreshAt),
      );

      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;

        if (disposed) return;

        if (document.hidden) {
          pendingRefresh = true;
          return;
        }

        lastRefreshAt = Date.now();
        startTransition(() => {
          router.refresh();
        });
      }, refreshDelay);
    }

    function pollForChanges() {
      if (!canPoll()) return Promise.resolve();
      if (pollRequest) return pollRequest;

      lastPollStartedAt = Date.now();

      const request = (async () => {
        try {
          const { data, error } = await supabase.rpc(
            "get_message_conversation_fingerprint",
            {
              p_conversation_id: conversationId,
              p_visibility_after: messageVisibilityAfter,
            },
          );

          if (disposed || error) {
            consecutivePollFailures = Math.min(
              consecutivePollFailures + 1,
              3,
            );
            return;
          }

          consecutivePollFailures = 0;

          const fingerprint = (data ?? [])[0] as
            | {
                message_count: number | null;
                latest_message_at: string | null;
                conversation_updated_at: string;
                is_blocked: boolean;
              }
            | undefined;

          if (!fingerprint) {
            consecutivePollFailures = Math.min(
              consecutivePollFailures + 1,
              3,
            );
            return;
          }

          const nextFingerprint = [
            fingerprint.message_count ?? 0,
            fingerprint.latest_message_at ?? "",
            fingerprint.conversation_updated_at,
            fingerprint.is_blocked ? "blocked" : "open",
          ].join(":");

          if (nextFingerprint !== fingerprintRef.current) {
            fingerprintRef.current = nextFingerprint;
            scheduleRefresh();
          }
        } catch {
          consecutivePollFailures = Math.min(consecutivePollFailures + 1, 3);
          // Realtime remains active; the fallback retries with bounded backoff.
        }
      })();

      pollRequest = request;
      void request.finally(() => {
        if (pollRequest === request) {
          pollRequest = null;
        }
      });

      return request;
    }

    function stopPolling() {
      if (pollTimer === null) return;

      window.clearTimeout(pollTimer);
      pollTimer = null;
    }

    function scheduleNextPoll() {
      stopPolling();

      if (!canPoll()) return;

      pollTimer = window.setTimeout(() => {
        pollTimer = null;
        void pollForChanges().finally(scheduleNextPoll);
      }, getNextPollDelay());
    }

    function restartPolling() {
      stopPolling();
      scheduleNextPoll();
    }

    function refreshWhenVisible() {
      if (!canPoll()) return;

      if (pendingRefresh) {
        scheduleRefresh();
      }

      if (Date.now() - lastPollStartedAt >= FOCUS_FRESHNESS_MS) {
        void pollForChanges().finally(scheduleNextPoll);
        return;
      }

      scheduleNextPoll();
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        stopPolling();
        return;
      }

      refreshWhenVisible();
    }

    function handleOffline() {
      realtimeConnected = false;
      stopPolling();
    }

    const channel = supabase
      .channel(`conversation-messages:${conversationId}`, {
        config: { private: true },
      })
      .on(
        "broadcast",
        { event: "changed" },
        scheduleRefresh,
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          realtimeConnected = false;

          if (!realtimeStopped) {
            realtimeStopped = true;
            void supabase.removeChannel(channel);
          }

          restartPolling();
          return;
        }

        const nextRealtimeConnected = status === "SUBSCRIBED";
        const justConnected = nextRealtimeConnected && !realtimeConnected;

        if (nextRealtimeConnected !== realtimeConnected) {
          realtimeConnected = nextRealtimeConnected;
          if (nextRealtimeConnected) {
            consecutivePollFailures = 0;
          }
          restartPolling();
        }

        if (justConnected && canPoll()) {
          void pollForChanges().finally(scheduleNextPoll);
        }
      });

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("online", refreshWhenVisible);
    window.addEventListener("offline", handleOffline);
    scheduleNextPoll();

    return () => {
      disposed = true;

      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }

      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("online", refreshWhenVisible);
      window.removeEventListener("offline", handleOffline);
      if (!realtimeStopped) {
        realtimeStopped = true;
        void supabase.removeChannel(channel);
      }
    };
  }, [
    conversationId,
    messageVisibilityAfter,
    router,
    startTransition,
  ]);

  return null;
}
