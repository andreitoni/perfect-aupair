import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { NextResponse } from "next/server";

type MessageNotificationParams = {
  sender: string;
};

function profilePath(sender: string) {
  return `/profile/${encodeURIComponent(sender)}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<MessageNotificationParams> },
) {
  const { sender } = await params;
  const requestUrl = new URL(request.url);
  const conversationId = requestUrl.searchParams.get("conversation")?.trim();
  const { supabase, applyCookies } = await createRouteHandlerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !conversationId) {
    return applyCookies(
      NextResponse.redirect(new URL(profilePath(sender), requestUrl.origin)),
    );
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, family_id, au_pair_id")
    .eq("id", conversationId)
    .maybeSingle<{
      id: string;
      family_id: string;
      au_pair_id: string;
    }>();

  if (
    conversation &&
    (conversation.family_id === user.id || conversation.au_pair_id === user.id)
  ) {
    return applyCookies(
      NextResponse.redirect(
        new URL(
          `/messages?conversation=${encodeURIComponent(conversation.id)}`,
          requestUrl.origin,
        ),
      ),
    );
  }

  return applyCookies(
    NextResponse.redirect(new URL(profilePath(sender), requestUrl.origin)),
  );
}
