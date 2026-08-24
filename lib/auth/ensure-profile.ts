import "server-only";

import type { User } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/admin/access";
import type { OAuthAccountType } from "@/lib/auth/oauth-account-type";
import { REGISTRATION_ONBOARDING_METADATA_KEY } from "@/lib/onboarding/registration-constants";
import {
  buildRegistrationOnboardingProfile,
  type RegistrationOnboardingProfile,
} from "@/lib/onboarding/registration-metadata";
import { createAdminClient } from "@/lib/supabase/admin";

type BasicProfile = {
  id: string;
  account_type: string | null;
  onboarding_completed: boolean | null;
  full_name?: string | null;
  city?: string | null;
  country?: string | null;
};

function displayNameForUser(user: User) {
  const meta = user.user_metadata ?? {};

  return (
    meta.display_name ??
    meta.full_name ??
    user.email?.split("@")[0] ??
    "Perfect AuPair member"
  );
}

function accountTypeForUser(user: User) {
  const meta = user.user_metadata ?? {};
  const value = meta.account_type;

  return value === "au_pair" || value === "family" ? value : "family";
}

function getPendingRegistrationOnboarding(user: User) {
  return buildRegistrationOnboardingProfile(
    user.user_metadata?.[REGISTRATION_ONBOARDING_METADATA_KEY],
  );
}

async function clearPendingRegistrationOnboarding(user: User) {
  try {
    const supabase = createAdminClient();
    const metadata = { ...(user.user_metadata ?? {}) };
    delete metadata[REGISTRATION_ONBOARDING_METADATA_KEY];

    await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: metadata,
    });
  } catch (error) {
    console.error("Could not clear pending registration onboarding", error);
  }
}

export async function ensureProfileForAuthUser(
  user: User,
  options: { accountType?: OAuthAccountType | null } = {},
) {
  if (isAdminEmail(user.email)) {
    return null;
  }

  try {
    const supabase = createAdminClient();
    let pendingRegistrationOnboarding: RegistrationOnboardingProfile | null =
      null;

    try {
      pendingRegistrationOnboarding = getPendingRegistrationOnboarding(user);
    } catch (error) {
      console.error("Invalid pending registration onboarding", error);
    }

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id, account_type, onboarding_completed, full_name, city, country")
      .eq("id", user.id)
      .maybeSingle<BasicProfile>();

    if (existingProfile) {
      if (
        pendingRegistrationOnboarding &&
        existingProfile.onboarding_completed !== true
      ) {
        const { data: updatedProfile, error } = await supabase
          .from("profiles")
          .update({
            ...pendingRegistrationOnboarding.updateData,
            content_moderation_status: "approved",
            content_moderation_needs_review: true,
            content_moderation_reviewed_at: null,
            content_moderation_reviewed_by: null,
            content_moderation_reason:
              "New profile is public and awaits background content review.",
          })
          .eq("id", user.id)
          .select(
            "id, account_type, onboarding_completed, full_name, city, country",
          )
          .single<BasicProfile>();

        if (error) {
          console.error("Failed to apply pending registration onboarding", error);
          return existingProfile;
        }

        await clearPendingRegistrationOnboarding(user);
        return updatedProfile;
      }

      if (
        options.accountType &&
        existingProfile.onboarding_completed !== true &&
        existingProfile.account_type !== options.accountType
      ) {
        const { data: updatedProfile, error } = await supabase
          .from("profiles")
          .update({ account_type: options.accountType })
          .eq("id", user.id)
          .select(
            "id, account_type, onboarding_completed, full_name, city, country",
          )
          .single<BasicProfile>();

        if (error) {
          console.error("Failed to apply OAuth account type", error);
          return existingProfile;
        }

        return updatedProfile;
      }

      return existingProfile;
    }

    const payload = {
      id: user.id,
      email: user.email ?? null,
      account_type: options.accountType ?? accountTypeForUser(user),
      display_name: displayNameForUser(user),
      avatar_url: (user.user_metadata?.avatar_url as string | undefined) ?? null,
      onboarding_completed: false,
      content_moderation_status: "approved",
      content_moderation_needs_review: true,
      content_moderation_reviewed_at: null,
      content_moderation_reviewed_by: null,
      content_moderation_reason:
        "New profile is public and awaits background content review.",
    };
    const createPayload = pendingRegistrationOnboarding
      ? {
          ...payload,
          ...pendingRegistrationOnboarding.updateData,
        }
      : payload;

    const { data: createdProfile, error } = await supabase
      .from("profiles")
      .upsert(createPayload, { onConflict: "id" })
      .select("id, account_type, onboarding_completed, full_name, city, country")
      .single<BasicProfile>();

    if (error) {
      console.error("Failed to recreate missing profile", error);
      return null;
    }

    if (pendingRegistrationOnboarding) {
      await clearPendingRegistrationOnboarding(user);
    }

    return createdProfile;
  } catch (error) {
    console.error("Could not ensure profile for auth user", error);
    return null;
  }
}
