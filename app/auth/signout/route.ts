import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

export async function POST(request: Request) {
  const { supabase, applyCookies } = await createRouteHandlerClient();

  await supabase.auth.signOut();

  return applyCookies(NextResponse.redirect(new URL("/", request.url), 303));
}
