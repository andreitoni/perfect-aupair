import {
  getProfilePhotoPublicUrl,
  type ImageStorageClient,
} from "@/lib/images/storage";
import type { SupabaseClient } from "@supabase/supabase-js";

type ProfilePhotoClient = SupabaseClient & ImageStorageClient;

type PrimaryProfilePhoto = {
  storage_path: string | null;
};

export function getProfilePhotoUrl(
  supabase: ImageStorageClient,
  storagePath?: string | null,
) {
  if (!storagePath) {
    return null;
  }

  if (storagePath.startsWith("demo-pics/")) {
    return `/${storagePath}`;
  }

  return getProfilePhotoPublicUrl(supabase, storagePath);
}

export async function getPrimaryProfilePhotoUrl(
  supabase: ProfilePhotoClient,
  profileId: string,
) {
  const { data } = await supabase
    .from("profile_photos")
    .select("storage_path")
    .eq("profile_id", profileId)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle<PrimaryProfilePhoto>();

  return getProfilePhotoUrl(supabase, data?.storage_path ?? null);
}
