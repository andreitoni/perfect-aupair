import { NextResponse } from "next/server";
import { getProfilePhotoUrl } from "@/lib/profile/photos";
import { createClient } from "@/lib/supabase/server";

type AccountType = "family" | "au_pair";

type ViewerProfile = {
  account_type: AccountType | null;
  onboarding_completed: boolean | null;
  suspended_at?: string | null;
  deletion_requested_at?: string | null;
  is_admin?: boolean | null;
};

type SearchProfile = {
  id: string;
  public_slug?: string | null;
  account_type?: AccountType | null;
  full_name: string | null;
  first_name?: string | null;
  country: string | null;
  city: string | null;
  nationality?: string | null;
  preferred_host_countries?: string[] | null;
  mother_tongue?: string | null;
  fluent_languages?: string[] | null;
  basic_languages?: string[] | null;
  age?: number | null;
  children_info?: string | null;
  will_care_for_elderly?: boolean | null;
  will_care_for_pets?: boolean | null;
  primary_photo_path: string | null;
  activity_status?: string | null;
  verification_status?: string | null;
  created_at?: string | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSearchTerms(query: string) {
  return normalize(query)
    .split(" ")
    .map((term) => term.trim())
    .filter(Boolean);
}

function compactList(values: Array<string | null | undefined>) {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

function searchableText(profile: SearchProfile) {
  return normalize(
    compactList([
      profile.full_name,
      profile.first_name,
      profile.city,
      profile.country,
      profile.nationality,
      profile.children_info,
      ...(profile.preferred_host_countries ?? []),
      profile.mother_tongue,
      ...(profile.fluent_languages ?? []),
      ...(profile.basic_languages ?? []),
      profile.will_care_for_elderly ? "elderly care senior care" : null,
      profile.will_care_for_pets ? "pet care pets" : null,
    ]).join(" "),
  );
}

function getMatchText(profile: SearchProfile, terms: string[]) {
  const fields = [
    profile.first_name,
    profile.full_name,
    profile.city,
    profile.country,
    profile.nationality,
    ...(profile.preferred_host_countries ?? []),
    profile.mother_tongue,
    ...(profile.fluent_languages ?? []),
    ...(profile.basic_languages ?? []),
  ];

  return (
    fields.find((field) => {
      const normalizedField = normalize(field);
      return (
        normalizedField && terms.some((term) => normalizedField.includes(term))
      );
    }) ?? null
  );
}

function rankProfile(profile: SearchProfile, terms: string[]) {
  const name = normalize([profile.first_name, profile.full_name].join(" "));
  const location = normalize([profile.city, profile.country].join(" "));
  const nationality = normalize(profile.nationality);
  const languages = normalize(
    compactList([
      profile.mother_tongue,
      ...(profile.fluent_languages ?? []),
      ...(profile.basic_languages ?? []),
    ]).join(" "),
  );
  const preferredCountries = normalize(
    (profile.preferred_host_countries ?? []).join(" "),
  );

  let score = 0;

  for (const term of terms) {
    if (name.startsWith(term)) score += 60;
    else if (name.includes(term)) score += 45;

    if (location.startsWith(term)) score += 35;
    else if (location.includes(term)) score += 26;

    if (nationality.includes(term)) score += 18;
    if (preferredCountries.includes(term)) score += 16;
    if (languages.includes(term)) score += 12;
  }

  if (profile.activity_status === "active") score += 6;
  if (profile.activity_status === "recently_active") score += 3;
  if (profile.verification_status === "verified") score += 2;

  return score;
}

function newestTime(profile: SearchProfile) {
  return profile.created_at ? new Date(profile.created_at).getTime() : 0;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get("q") ?? "";
  const requestedTarget = searchParams.get("target");
  const terms = getSearchTerms(rawQuery);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ results: [] }, { status: 401 });
  }

  if (
    rawQuery.trim().length < 2 ||
    rawQuery.trim().length > 64 ||
    terms.length === 0
  ) {
    return NextResponse.json({ results: [] });
  }

  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select(
      "account_type, onboarding_completed, suspended_at, deletion_requested_at, is_admin",
    )
    .eq("id", user.id)
    .maybeSingle<ViewerProfile>();

  if (
    !viewerProfile?.onboarding_completed ||
    (viewerProfile.account_type !== "family" &&
      viewerProfile.account_type !== "au_pair") ||
    viewerProfile.suspended_at ||
    viewerProfile.deletion_requested_at ||
    viewerProfile.is_admin
  ) {
    return NextResponse.json({ results: [] }, { status: 403 });
  }

  const allowedTarget: AccountType =
    viewerProfile.account_type === "family" ? "au_pair" : "family";
  const targetType =
    requestedTarget === allowedTarget ? requestedTarget : allowedTarget;
  const { data, error } = await supabase.rpc("search_profile_cards", {
    p_query: rawQuery.trim(),
    p_limit: 20,
  });

  if (error) {
    return NextResponse.json({ results: [] }, { status: 500 });
  }

  const visibleProfiles = (data ?? []) as SearchProfile[];

  const matchingProfiles = visibleProfiles
    .filter((profile) => {
      if (profile.id === user.id) return false;
      if (terms.length === 0) return false;

      const haystack = searchableText(profile);
      return terms.every((term) => haystack.includes(term));
    })
    .map((profile) => ({
      profile,
      score: rankProfile(profile, terms),
    }))
    .sort((first, second) => {
      if (first.score !== second.score) {
        return second.score - first.score;
      }

      return newestTime(second.profile) - newestTime(first.profile);
    })
    .slice(0, 10)
    .map(({ profile }) => ({
      id: profile.id,
      publicSlug: profile.public_slug ?? null,
      accountType: targetType,
      fullName: profile.full_name,
      firstName: profile.first_name ?? null,
      age: profile.age ?? null,
      city: profile.city,
      country: profile.country,
      photoUrl: getProfilePhotoUrl(supabase, profile.primary_photo_path),
      activityStatus: profile.activity_status ?? null,
      verificationStatus: profile.verification_status ?? null,
      matchText: getMatchText(profile, terms),
    }));

  return NextResponse.json({ results: matchingProfiles });
}
