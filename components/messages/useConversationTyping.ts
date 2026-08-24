"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

const TYPING_BROADCAST_EVENT = "typing";
const TYPING_HEARTBEAT_MS = 1_500;
const TYPING_IDLE_TIMEOUT_MS = 2_000;
const REMOTE_TYPING_TIMEOUT_MS = 5_000;
export const CONVERSATION_TYPING_STATE_EVENT = "conversation-typing-state";
export type ConversationTypingStateDetail = {
  conversationId: string;
  active: boolean;
};

type TypingBroadcastPayload = {
  profileId?: unknown;
  clientId?: unknown;
  active?: unknown;
  sentAt?: unknown;
};

type UseConversationTypingOptions = {
  conversationId: string;
  currentUserId: string;
  otherUserId: string;
  enabled: boolean;
};

function createTypingClientId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useConversationTyping({
  conversationId,
  currentUserId,
  otherUserId,
  enabled,
}: UseConversationTypingOptions) {
  const [remoteTypingState, setRemoteTypingState] = useState(() => ({
    conversationId,
    active: false,
    lastActiveAt: null as number | null,
  }));
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);
  const localTypingRef = useRef(false);
  const lastTypingBroadcastAtRef = useRef(0);
  const idleTimerRef = useRef<number | null>(null);
  const clientIdRef = useRef("");

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const sendTypingState = useCallback(
    (active: boolean, force = false) => {
      if (!enabled) return;

      const now = Date.now();

      if (
        active &&
        !force &&
        localTypingRef.current &&
        now - lastTypingBroadcastAtRef.current < TYPING_HEARTBEAT_MS
      ) {
        return;
      }

      if (!active && !force && !localTypingRef.current) {
        return;
      }

      localTypingRef.current = active;

      if (active) {
        lastTypingBroadcastAtRef.current = now;
      }

      const channel = channelRef.current;

      if (!channel || !subscribedRef.current) {
        return;
      }

      void channel
        .send({
          type: "broadcast",
          event: TYPING_BROADCAST_EVENT,
          payload: {
            profileId: currentUserId,
            clientId: clientIdRef.current,
            active,
            sentAt: now,
          },
        })
        .catch(() => undefined);
    },
    [currentUserId, enabled],
  );

  const updateTyping = useCallback(
    (active: boolean) => {
      clearIdleTimer();

      if (!active || document.hidden) {
        sendTypingState(false);
        return;
      }

      sendTypingState(true);
      idleTimerRef.current = window.setTimeout(() => {
        idleTimerRef.current = null;
        sendTypingState(false);
      }, TYPING_IDLE_TIMEOUT_MS);
    },
    [clearIdleTimer, sendTypingState],
  );

  useEffect(() => {
    if (!enabled) {
      clearIdleTimer();
      localTypingRef.current = false;
      return;
    }

    const supabase = createClient();
    const remoteTypingClients = new Map<string, number>();
    let disposed = false;
    let remoteExpiryTimer: number | null = null;
    let lastRemoteTypingAt: number | null = null;
    let channelStopped = false;

    clientIdRef.current = createTypingClientId();
    subscribedRef.current = false;
    localTypingRef.current = false;
    lastTypingBroadcastAtRef.current = 0;

    function clearRemoteTyping() {
      remoteTypingClients.clear();

      if (remoteExpiryTimer) {
        window.clearTimeout(remoteExpiryTimer);
        remoteExpiryTimer = null;
      }

      if (!disposed) {
        setRemoteTypingState({
          conversationId,
          active: false,
          lastActiveAt: lastRemoteTypingAt,
        });
        window.dispatchEvent(
          new CustomEvent<ConversationTypingStateDetail>(
            CONVERSATION_TYPING_STATE_EVENT,
            { detail: { conversationId, active: false } },
          ),
        );
      }
    }

    function syncRemoteTyping() {
      if (disposed) return;

      const now = Date.now();

      for (const [clientId, expiresAt] of remoteTypingClients) {
        if (expiresAt <= now) {
          remoteTypingClients.delete(clientId);
        }
      }

      setRemoteTypingState({
        conversationId,
        active: remoteTypingClients.size > 0,
        lastActiveAt: lastRemoteTypingAt,
      });
      window.dispatchEvent(
        new CustomEvent<ConversationTypingStateDetail>(
          CONVERSATION_TYPING_STATE_EVENT,
          {
            detail: {
              conversationId,
              active: remoteTypingClients.size > 0,
            },
          },
        ),
      );

      if (remoteExpiryTimer) {
        window.clearTimeout(remoteExpiryTimer);
        remoteExpiryTimer = null;
      }

      if (!remoteTypingClients.size) return;

      const nextExpiry = Math.min(...remoteTypingClients.values());
      remoteExpiryTimer = window.setTimeout(
        syncRemoteTyping,
        Math.max(0, nextExpiry - now) + 25,
      );
    }

    const channel = supabase
      .channel(`conversation-typing:${conversationId}`, {
        config: {
          private: true,
          broadcast: { ack: false, self: false },
        },
      })
      .on<TypingBroadcastPayload>(
        "broadcast",
        { event: TYPING_BROADCAST_EVENT },
        ({ payload }) => {
          if (
            payload.profileId !== otherUserId ||
            typeof payload.clientId !== "string" ||
            payload.clientId.length === 0 ||
            payload.clientId.length > 128 ||
            typeof payload.active !== "boolean"
          ) {
            return;
          }

          if (payload.active) {
            lastRemoteTypingAt = Date.now();
            remoteTypingClients.set(
              payload.clientId,
              Date.now() + REMOTE_TYPING_TIMEOUT_MS,
            );
          } else {
            remoteTypingClients.delete(payload.clientId);
          }

          syncRemoteTyping();
        },
      )
      .subscribe((status) => {
        if (disposed) return;

        if (status === "CHANNEL_ERROR") {
          subscribedRef.current = false;
          clearRemoteTyping();

          if (!channelStopped) {
            channelStopped = true;
            void supabase.removeChannel(channel);
          }

          return;
        }

        subscribedRef.current = status === "SUBSCRIBED";

        if (status === "SUBSCRIBED") {
          if (localTypingRef.current) {
            sendTypingState(true, true);
          }
          return;
        }

        clearRemoteTyping();
      });

    channelRef.current = channel;

    function stopTypingWhenHidden() {
      if (document.hidden) {
        clearIdleTimer();
        sendTypingState(false);
      }
    }

    function stopTypingBeforePageExit() {
      clearIdleTimer();
      sendTypingState(false);
    }

    document.addEventListener("visibilitychange", stopTypingWhenHidden);
    window.addEventListener("pagehide", stopTypingBeforePageExit);

    return () => {
      if (localTypingRef.current && subscribedRef.current) {
        sendTypingState(false, true);
      }

      clearIdleTimer();
      clearRemoteTyping();
      disposed = true;
      document.removeEventListener("visibilitychange", stopTypingWhenHidden);
      window.removeEventListener("pagehide", stopTypingBeforePageExit);
      subscribedRef.current = false;
      localTypingRef.current = false;

      if (channelRef.current === channel) {
        channelRef.current = null;
      }

      if (!channelStopped) {
        channelStopped = true;
        void supabase.removeChannel(channel);
      }
    };
  }, [
    clearIdleTimer,
    conversationId,
    enabled,
    otherUserId,
    sendTypingState,
  ]);

  const isOtherTyping =
    enabled &&
    remoteTypingState.conversationId === conversationId &&
    remoteTypingState.active;
  const lastOtherTypingAt =
    remoteTypingState.conversationId === conversationId
      ? remoteTypingState.lastActiveAt
      : null;

  return { isOtherTyping, lastOtherTypingAt, updateTyping };
}
