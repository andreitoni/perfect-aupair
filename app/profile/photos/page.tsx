import { Header } from "@/components/layout/Header";
import { LegalFooter } from "@/components/layout/LegalFooter";
import { ProfilePhotoManager } from "@/components/profile/ProfilePhotoManager";
import { redirectAdminToDashboard } from "@/lib/admin/access";
import {
  authHomeHref,
  safeAuthReturnTo,
  withAuthReturnTo,
} from "@/lib/auth/return-to";
import {
  getProfilePhotoPublicUrl,
  getSignedProfileVideoUrl,
} from "@/lib/images/storage";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "My Profile",
  description: "Manage your Perfect AuPair profile photos and intro video.",
  robots: { index: false, follow: false },
};

type ProfileMediaPageRow = {
  id: string;
  account_type: "family" | "au_pair";
  onboarding_completed: boolean;
  profile_photos: Array<{
    id: string;
    storage_path: string;
    is_primary: boolean;
    sort_order: number;
  }>;
  profile_videos: Array<{
    id: string;
    storage_path: string;
    mime_type: string;
    size_bytes: number;
    duration_seconds: number;
    width: number | null;
    height: number | null;
    poster_data_url: string | null;
    content_moderation_status: "pending" | "approved" | "rejected";
  }>;
};

export default async function ProfilePhotosPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    returnTo?: string | string[];
  }>;
}) {
  const { next, returnTo: rawReturnTo } = await searchParams;
  const returnTo = safeAuthReturnTo(rawReturnTo);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(authHomeHref(returnTo));
  }

  redirectAdminToDashboard(user);

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      `
        id,
        account_type,
        onboarding_completed,
        profile_photos (
          id,
          storage_path,
          is_primary,
          sort_order
        ),
        profile_videos!profile_videos_profile_id_fkey (
          id,
          storage_path,
          mime_type,
          size_bytes,
          duration_seconds,
          width,
          height,
          poster_data_url,
          content_moderation_status
        )
      `,
    )
    .eq("id", user.id)
    .single<ProfileMediaPageRow>();

  if (!profile) {
    redirect(authHomeHref(returnTo));
  }

  if (!profile.onboarding_completed) {
    redirect(withAuthReturnTo("/onboarding", returnTo));
  }

  const photos = [...(profile.profile_photos ?? [])].sort(
    (firstPhoto, secondPhoto) =>
      Number(secondPhoto.is_primary) - Number(firstPhoto.is_primary) ||
      firstPhoto.sort_order - secondPhoto.sort_order,
  );
  const profileVideo = profile.profile_videos?.[0] ?? null;

  const photosWithUrls =
    photos?.map((photo) => ({
      ...photo,
      public_url: getProfilePhotoPublicUrl(supabase, photo.storage_path),
    })) ?? [];

  const videoWithSignedUrl = profileVideo
    ? {
        ...profileVideo,
        signed_url: await getSignedProfileVideoUrl(
          supabase,
          profileVideo.storage_path,
        ),
      }
    : null;

  const defaultContinueHref =
    profile.account_type === "family" ? "/search-aupair" : "/search-family";

  const continueHref =
    next === "/account"
      ? "/account"
      : returnTo
        ? authHomeHref(returnTo)
        : defaultContinueHref;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[#25302d]">
      <Header
        subtitle="profile.profileMedia"
        authState="authenticated"
        accountType={profile.account_type}
        initialProfilePhotoUrl={photosWithUrls[0]?.public_url ?? null}
      />

      <section className="mx-auto max-w-5xl px-4 py-4 sm:px-8 sm:py-8">
        <ProfilePhotoManager
          profileId={user.id}
          isRequired
          initialPhotos={photosWithUrls}
          initialVideo={videoWithSignedUrl}
          continueHref={continueHref}
        />
      </section>

      <LegalFooter />
    </main>
  );
}
