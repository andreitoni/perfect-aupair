"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isMessageProfileAvailable } from "@/lib/messages/profile-availability";

type MessagesInboxAutoRefreshProps = {
  initialFingerprint: string;
};

const INBOX_POLL_INTERVAL_MS = 30_000;
const INBOX_POLL_MAX_BACKOFF_MS = 120_000;
const INBOX_FOCUS_FRESHNESS_MS = 5_000;

type InboxPollRow = {
  conversation_id: string;
  updated_at: string | null;
  last_message_id: string | null;
  last_message_sender_id: string | null;
  last_message_created_at: string | null;
  last_message_read_by_other: boolean | null;
  unread_count: number | null;
  other_profile_available?: boolean | null;
};

function getInboxFingerprint(rows: InboxPollRow[]) {
  return rows
    .map((row) => {
      const hasStoredMessage = Boolean(row.last_message_id);

      return [
        row.conversation_id,
        row.updated_at ?? "",
        hasStoredMessage ? row.last_message_id : "",
        hasStoredMessage ? row.last_message_sender_id : "",
        hasStoredMessage ? row.last_message_created_at : "",
        hasStoredMessage && row.last_message_read_by_other ? "read" : "unread",
        hasStoredMessage ? (row.unread_count ?? 0) : 0,
        isMessageProfileAvailable(row.other_profile_available)
          ? "available"
          : "unavailable",
      ].join(":");
    })
    .sort()
    .join("|");
}

export function MessagesInboxAutoRefresh({
  initialFingerprint,
}: MessagesInboxAutoRefreshProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fingerprintRef = useRef(initialFingerprint);
  const lastInitialFingerprintRef = useRef(initialFingerprint);

  useEffect(() => {
    if (fingerprintRef.current === lastInitialFingerprintRef.current) {
      fingerprintRef.current = initialFingerprint;
    }

    lastInitialFingerprintRef.current = initialFingerprint;
  }, [initialFingerprint]);

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let pendingRefresh = false;
    let pollRequest: Promise<void> | null = null;
    let pollTimer: number | null = null;
    let consecutivePollFailures = 0;
    let lastPollStartedAt = 0;

    function canPoll() {
      return !disposed && !document.hidden && navigator.onLine;
    }

    function getNextPollDelay() {
      return Math.min(
        INBOX_POLL_INTERVAL_MS * 2 ** consecutivePollFailures,
        INBOX_POLL_MAX_BACKOFF_MS,
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

      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;

        if (disposed) return;

        if (document.hidden) {
          pendingRefresh = true;
          return;
        }

        startTransition(() => {
          router.refresh();
        });
      }, 120);
    }

    function pollForChanges() {
      if (!canPoll()) return Promise.resolve();
      if (pollRequest) return pollRequest;

      lastPollStartedAt = Date.now();

      const request = (async () => {
        try {
          const { data, error } = await supabase.rpc(
            "get_message_inbox_fingerprint",
          );

          if (disposed) return;

          if (error) {
            consecutivePollFailures = Math.min(
              consecutivePollFailures + 1,
              2,
            );
            return;
          }

          consecutivePollFailures = 0;

          const nextFingerprint = getInboxFingerprint(
            (data ?? []) as InboxPollRow[],
          );

          if (nextFingerprint !== fingerprintRef.current) {
            fingerprintRef.current = nextFingerprint;
            scheduleRefresh();
          }
        } catch {
          consecutivePollFailures = Math.min(consecutivePollFailures + 1, 2);
          // Keep the current inbox and retry with a bounded backoff.
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

    function refreshWhenVisible() {
      if (!canPoll()) return;

      if (pendingRefresh) {
        scheduleRefresh();
      }

      if (Date.now() - lastPollStartedAt >= INBOX_FOCUS_FRESHNESS_MS) {
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
      stopPolling();
    }

    function handleReadStateChange() {
      if (!canPoll()) return;

      void pollForChanges().finally(scheduleNextPoll);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("online", refreshWhenVisible);
    window.addEventListener("offline", handleOffline);
    window.addEventListener(
      "pa:messages-read-state-changed",
      handleReadStateChange,
    );
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
      window.removeEventListener(
        "pa:messages-read-state-changed",
        handleReadStateChange,
      );
    };
  }, [router, startTransition]);

  return null;
}
