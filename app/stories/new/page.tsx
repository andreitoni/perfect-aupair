import { Header } from "@/components/layout/Header";
import { LegalFooter } from "@/components/layout/LegalFooter";
import { StoryUploadScrollReset } from "@/components/stories/StoryUploadScrollReset";
import { StoryUploader } from "@/components/stories/StoryUploader";
import { redirectAdminToDashboard } from "@/lib/admin/access";
import { getProfilePhotoUrl } from "@/lib/profile/photos";
import { getSafeStoryReturnTo } from "@/lib/stories/story-links";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type StoryUploadProfile = {
  account_type: "family" | "au_pair";
  onboarding_completed: boolean;
  profile_photos: Array<{
    storage_path: string;
    is_primary: boolean;
    sort_order: number;
  }>;
};

export default async function NewStoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const returnTo = getSafeStoryReturnTo(
    query.returnTo,
    "/account#active-stories",
  );
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  redirectAdminToDashboard(user);

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      `
        account_type,
        onboarding_completed,
        profile_photos (
          storage_path,
          is_primary,
          sort_order
        )
      `,
    )
    .eq("id", user.id)
    .single<StoryUploadProfile>();

  if (!profile) {
    redirect("/login");
  }

  if (!profile.onboarding_completed) {
    redirect("/onboarding");
  }

  const primaryPhoto = [...(profile.profile_photos ?? [])].sort(
    (firstPhoto, secondPhoto) =>
      Number(secondPhoto.is_primary) - Number(firstPhoto.is_primary) ||
      firstPhoto.sort_order - secondPhoto.sort_order,
  )[0];
  const initialProfilePhotoUrl = getProfilePhotoUrl(
    supabase,
    primaryPhoto?.storage_path ?? null,
  );

  if (!initialProfilePhotoUrl) {
    redirect("/profile/photos");
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[#25302d]">
      <StoryUploadScrollReset />
      <Header
        subtitle="stories.add"
        authState="authenticated"
        accountType={profile.account_type}
        initialProfilePhotoUrl={initialProfilePhotoUrl}
      />

      <section className="mx-auto max-w-5xl px-4 py-4 sm:px-8 sm:py-8">
        <StoryUploader profileId={user.id} returnTo={returnTo} />
      </section>

      <LegalFooter />
    </main>
  );
}
