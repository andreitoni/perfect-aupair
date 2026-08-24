import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let profileId = "";

  try {
    const payload = (await request.json()) as { profileId?: unknown };
    profileId = typeof payload.profileId === "string" ? payload.profileId : "";
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!profileId) {
    return NextResponse.json({ error: "Missing profile" }, { status: 400 });
  }

  const { data: conversationId, error } = await supabase.rpc(
    "create_or_get_conversation",
    {
      p_profile_id: profileId,
    },
  );

  if (error || !conversationId) {
    return NextResponse.json(
      { error: error?.message ?? "Could not start conversation" },
      { status: 400 },
    );
  }

  return NextResponse.json({ conversationId: String(conversationId) });
}
