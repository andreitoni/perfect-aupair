"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type ConversationBlockActionResult = {
  ok: boolean;
  error?: string;
  errorCode?: "block_cooldown";
  retryAt?: string;
  isConversationBlocked?: boolean;
};

type ProfileBlockRpcResult = {
  ok?: boolean;
  error_code?: string | null;
  retry_at?: string | null;
};

export async function hideConversationFromInbox(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const conversationId = String(formData.get("conversation_id") ?? "");
  const redirectTo = String(formData.get("redirect_to") ?? "");

  if (!conversationId) {
    throw new Error("Missing conversation");
  }

  const { error } = await supabase.rpc("hide_conversation_from_inbox", {
    p_conversation_id: conversationId,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId}`);

  if (redirectTo === "/messages") {
    redirect("/messages");
  }
}

async function getConversationBlockTarget(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const conversationId = String(formData.get("conversation_id") ?? "");

  if (!conversationId) {
    return {
      supabase,
      conversationId,
      userId: user.id,
      error: "Missing conversation",
    };
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, family_id, au_pair_id")
    .eq("id", conversationId)
    .single<{
      id: string;
      family_id: string;
      au_pair_id: string;
    }>();

  if (conversationError || !conversation) {
    return {
      supabase,
      conversationId,
      userId: user.id,
      error: "Conversation not found",
    };
  }

  const isParticipant =
    user.id === conversation.family_id || user.id === conversation.au_pair_id;

  if (!isParticipant) {
    return {
      supabase,
      conversationId,
      userId: user.id,
      error: "Conversation not found",
    };
  }

  const blockedProfileId =
    user.id === conversation.family_id
      ? conversation.au_pair_id
      : conversation.family_id;

  return {
    supabase,
    conversationId,
    userId: user.id,
    blockedProfileId,
  };
}

export async function blockProfileFromConversation(
  formData: FormData,
): Promise<ConversationBlockActionResult> {
  const target = await getConversationBlockTarget(formData);

  if ("error" in target) {
    return { ok: false, error: target.error };
  }

  const { data: blockResultData, error: blockError } = await target.supabase.rpc(
    "block_profile",
    {
      p_blocked_profile_id: target.blockedProfileId,
    },
  );
  const blockResult = blockResultData as ProfileBlockRpcResult | null;

  if (blockError) {
    return { ok: false, error: blockError.message };
  }

  if (blockResult?.error_code === "block_cooldown") {
    return {
      ok: false,
      errorCode: "block_cooldown",
      retryAt: blockResult.retry_at ?? undefined,
    };
  }

  if (blockResult?.ok === false) {
    return { ok: false, error: "Could not block this profile." };
  }

  return { ok: true, isConversationBlocked: true };
}

export async function unblockProfileFromConversation(
  formData: FormData,
): Promise<ConversationBlockActionResult> {
  const target = await getConversationBlockTarget(formData);

  if ("error" in target) {
    return { ok: false, error: target.error };
  }

  const { error: unblockError } = await target.supabase.rpc("unblock_profile", {
    p_blocked_profile_id: target.blockedProfileId,
  });

  if (unblockError) {
    return { ok: false, error: unblockError.message };
  }

  const { data: isConversationBlocked, error: blockStatusError } =
    await target.supabase.rpc("profile_pair_blocked", {
      p_first_profile_id: target.userId,
      p_second_profile_id: target.blockedProfileId,
    });

  if (blockStatusError) {
    return { ok: false, error: blockStatusError.message };
  }

  return { ok: true, isConversationBlocked: Boolean(isConversationBlocked) };
}
