import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { NextResponse } from "next/server";

type ToggleFavoritePayload = {
  profileId?: unknown;
};

function readProfileId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as
    | ToggleFavoritePayload
    | null;
  const profileId = readProfileId(payload?.profileId);

  if (!profileId) {
    return NextResponse.json(
      { error: "Missing profile." },
      { status: 400 },
    );
  }

  const { supabase, applyCookies } = await createRouteHandlerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return applyCookies(
      NextResponse.json({ error: "Please log in." }, { status: 401 }),
    );
  }

  const { data, error } = await supabase.rpc("toggle_profile_favorite", {
    p_profile_id: profileId,
  });

  if (error) {
    const rateLimited = error.message.includes("Favorite change limit reached");

    return applyCookies(
      NextResponse.json(
        { error: error.message },
        {
          status: rateLimited ? 429 : 400,
          headers: rateLimited ? { "Retry-After": "600" } : undefined,
        },
      ),
    );
  }

  const saved = Boolean(data);

  return applyCookies(NextResponse.json({ saved }));
}
