import { Header } from "@/components/layout/Header";
import { LegalFooter } from "@/components/layout/LegalFooter";
import { isAdminEmail } from "@/lib/admin/access";
import { loginHref, safeAuthReturnTo } from "@/lib/auth/return-to";
import { getProfilePhotoUrl } from "@/lib/profile/photos";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { completeOnboarding } from "./actions";
import {
  OnboardingForm,
  type OnboardingProfile,
} from "@/components/onboarding/OnboardingForm";

import {
  childrenOptions,
  countries,
  languageOptions,
  nationalities,
  phoneCountryCodes,
  religionOptions,
  smokingOptions,
} from "@/lib/profile-options";

type OnboardingPageProfile = OnboardingProfile & {
  profile_photos: Array<{
    storage_path: string;
    is_primary: boolean;
    sort_order: number;
  }>;
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string | string[] }>;
}) {
  const returnTo = safeAuthReturnTo((await searchParams)?.returnTo);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(loginHref(returnTo));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      `
        account_type,
        onboarding_completed,
        first_name,
        last_name,
        full_name,
        date_of_birth,
        gender,
        street_address,
        phone_country_code,
        phone_number,
        country,
        city,
        nationality,
        preferred_host_countries,
        religion,
        already_in_germany,
        has_drivers_license,
        has_childcare_experience,
        has_infant_experience,
        has_first_aid,
        will_care_for_elderly,
        will_care_for_pets,
        mother_tongue,
        fluent_languages,
        basic_languages,
        availability_start,
        availability_start_from,
        availability_start_to,
        duration,
        duration_min_months,
        duration_max_months,
        smoking_status,
        bio,
        children_info,
        au_pair_allowance_amount,
        au_pair_allowance_currency,
        accommodation_info,
        expectations,
        profile_photos (
          storage_path,
          is_primary,
          sort_order
        )
      `,
    )
    .eq("id", user.id)
    .single<OnboardingPageProfile>();

  if (!profile) {
    if (isAdminEmail(user.email)) {
      redirect("/admin");
    }

    redirect("/login");
  }

  const { profile_photos: profilePhotos, ...onboardingProfile } = profile;
  const isAuPair = onboardingProfile.account_type === "au_pair";
  const primaryPhoto = [...(profilePhotos ?? [])].sort(
    (firstPhoto, secondPhoto) =>
      Number(secondPhoto.is_primary) - Number(firstPhoto.is_primary) ||
      firstPhoto.sort_order - secondPhoto.sort_order,
  )[0];
  const initialProfilePhotoUrl = getProfilePhotoUrl(
    supabase,
    primaryPhoto?.storage_path ?? null,
  );
  const onboardingAction = completeOnboarding.bind(null, returnTo);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--background)] text-[#25302d]">
      <Header
        subtitle={
          isAuPair
            ? "onboarding.completeAuPairProfile"
            : "onboarding.completeFamilyProfile"
        }
        authState="authenticated"
        accountType={profile.account_type}
        initialProfilePhotoUrl={initialProfilePhotoUrl}
      />

      <section className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-8 sm:py-8">
        <OnboardingForm
          profile={onboardingProfile}
          action={onboardingAction}
          countries={countries}
          nationalities={nationalities}
          languageOptions={languageOptions}
          phoneCountryCodes={phoneCountryCodes}
          childrenOptions={childrenOptions}
          religionOptions={religionOptions}
          smokingOptions={smokingOptions}
        />
      </section>

      <LegalFooter />
    </main>
  );
}
