"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type UnreadConversationDotProps = {
  conversationId: string;
};

export function UnreadConversationDot({
  conversationId,
}: UnreadConversationDotProps) {
  const supabase = createClient();
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadUnreadStatus() {
      const { data } = await supabase.rpc("has_unread_conversation", {
        p_conversation_id: conversationId,
      });

      if (isMounted) {
        setHasUnread(Boolean(data));
      }
    }

    loadUnreadStatus();

    return () => {
      isMounted = false;
    };
  }, [conversationId, supabase]);

  if (!hasUnread) {
    return null;
  }

  return (
    <div className="absolute bottom-5 right-5 z-20 inline-flex items-center gap-2 rounded-full bg-[#d95f49] px-3 py-1.5 text-xs font-black uppercase tracking-[0.08em] text-white shadow-sm ring-2 ring-white">
      <span className="h-2 w-2 rounded-full bg-white" />
      New
    </div>
  );
}
