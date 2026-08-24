import { NextResponse } from "next/server";
import { getProfilePhotoUrl } from "@/lib/profile/photos";
import { createClient } from "@/lib/supabase/server";

type ViewerProfile = {
  account_type: "family" | "au_pair";
  onboarding_completed: boolean;
};

type SuggestionProfile = {
  id: string;
  public_slug?: string | null;
  account_type?: "family" | "au_pair" | null;
  full_name: string | null;
  country: string | null;
  city: string | null;
  primary_photo_path: string | null;
  activity_status?: string | null;
  verification_status?: string | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get("q") ?? "";
  const query = normalize(rawQuery).trim();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ suggestions: [] }, { status: 401 });
  }

  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("account_type, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle<ViewerProfile>();

  if (!viewerProfile?.onboarding_completed) {
    return NextResponse.json({ suggestions: [] });
  }

  if (query.length < 2 || query.length > 64) {
    return NextResponse.json({ suggestions: [] });
  }

  const targetType =
    viewerProfile.account_type === "family" ? "au_pair" : "family";
  const { data: fastSuggestions, error: fastSuggestionsError } =
    await supabase.rpc("get_message_profile_suggestions", {
      p_query: rawQuery.trim(),
      p_limit: 12,
    });

  if (!fastSuggestionsError) {
    const suggestions = ((fastSuggestions ?? []) as SuggestionProfile[]).map(
      (profile) => ({
        id: profile.id,
        publicSlug: profile.public_slug ?? null,
        accountType: profile.account_type ?? targetType,
        fullName: profile.full_name,
        city: profile.city,
        country: profile.country,
        photoUrl: getProfilePhotoUrl(supabase, profile.primary_photo_path),
        activityStatus: profile.activity_status ?? null,
        verificationStatus: profile.verification_status ?? null,
      }),
    );

    return NextResponse.json({ suggestions });
  }

  console.error("Profile suggestion lookup failed.", {
    code: fastSuggestionsError.code,
  });
  return NextResponse.json({ suggestions: [] }, { status: 503 });
}
