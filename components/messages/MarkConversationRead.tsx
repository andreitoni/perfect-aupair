"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type MarkConversationReadProps = {
  conversationId: string;
  hasUnreadMessages: boolean;
  latestMessageId: string | null;
  latestMessageAt: string | null;
  messageCount: number;
  refreshAfterMark?: boolean;
};

const markedConversationFingerprints = new Set<string>();

export function MarkConversationRead({
  conversationId,
  hasUnreadMessages,
  latestMessageId,
  latestMessageAt,
  messageCount,
  refreshAfterMark = true,
}: MarkConversationReadProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!hasUnreadMessages) {
      return;
    }

    const fingerprint = `${conversationId}:${messageCount}:${latestMessageAt ?? ""}`;

    if (markedConversationFingerprints.has(fingerprint)) {
      return;
    }

    markedConversationFingerprints.add(fingerprint);

    async function markRead() {
      const { error } = await supabase.rpc("mark_conversation_read", {
        p_conversation_id: conversationId,
      });

      if (error) {
        markedConversationFingerprints.delete(fingerprint);
        return;
      }

      window.dispatchEvent(
        new CustomEvent("pa:messages-read-state-changed", {
          detail: { conversationId, latestMessageId },
        }),
      );
      if (refreshAfterMark) {
        router.refresh();
      }
    }

    void markRead();
  }, [
    conversationId,
    hasUnreadMessages,
    latestMessageId,
    latestMessageAt,
    messageCount,
    refreshAfterMark,
    router,
    supabase,
  ]);

  return null;
}
