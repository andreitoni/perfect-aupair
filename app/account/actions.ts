"use server";

import { isAdminEmail } from "@/lib/admin/access";
import { sendVerificationRequestAdminEmail } from "@/lib/email/admin-notifications";
import {
  removeVerificationSelfieFiles,
  uploadVerificationSelfieFile,
} from "@/lib/images/storage";
import type { AccountDeletionRequestRpcResult } from "@/lib/privacy/account-deletion";
import { sendPendingAccountDeletionConfirmation } from "@/lib/privacy/send-account-deletion-confirmations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const VERIFICATION_IMAGE_MAX_SIZE = 5 * 1024 * 1024;
const DUPLICATE_KEY_ERROR_CODE = "23505";
const RETAINED_REJECTED_VERIFICATION_REQUESTS = 4;

const VERIFICATION_IMAGE_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function revalidatePublicProfileSurfaces(profileId: string, publicSlug?: string | null) {
  revalidatePath("/");
  revalidatePath("/search-aupair");
  revalidatePath("/search-family");
  revalidatePath(`/profile/${profileId}`);

  if (publicSlug) {
    revalidatePath(`/profile/${publicSlug}`);
  }
}

const verificationRedirect = (code: string): never => {
  redirect(`/account?verification=${code}#profile-verification`);
  throw new Error("Unreachable verification redirect.");
};

function isDuplicateVerificationRequestError(
  error: { code?: string | null } | null,
) {
  return error?.code === DUPLICATE_KEY_ERROR_CODE;
}

async function pruneOldRejectedVerificationRequests(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
) {
  const { data: rejectedRequests, error: rejectedRequestsError } = await admin
    .from("profile_verification_requests")
    .select("id, selfie_path")
    .eq("profile_id", profileId)
    .eq("status", "rejected")
    .order("created_at", { ascending: false });

  if (rejectedRequestsError) {
    verificationRedirect("try_again");
  }

  const staleRequests = (rejectedRequests ?? []).slice(
    RETAINED_REJECTED_VERIFICATION_REQUESTS,
  );

  if (staleRequests.length === 0) return;

  const { error: deleteError } = await admin
    .from("profile_verification_requests")
    .delete()
    .in(
      "id",
      staleRequests.map((request) => request.id),
    );

  if (deleteError) {
    verificationRedirect("try_again");
  }

  const { error: storageError } = await removeVerificationSelfieFiles(
    admin,
    staleRequests.map((request) => request.selfie_path),
  );

  if (storageError) {
    console.error(
      "Could not remove an old rejected verification selfie.",
      storageError.message,
    );
    verificationRedirect("try_again");
  }
}

function validateVerificationSelfie(value: FormDataEntryValue | null) {
  const file = value instanceof File ? value : null;

  if (!file) {
    verificationRedirect("missing_selfie");
  }

  const checkedFile = file as File;

  if (checkedFile.size === 0) {
    verificationRedirect("missing_selfie");
  }

  if (!VERIFICATION_IMAGE_ALLOWED_TYPES.has(checkedFile.type)) {
    verificationRedirect("invalid_type");
  }

  if (checkedFile.size > VERIFICATION_IMAGE_MAX_SIZE) {
    verificationRedirect("too_large");
  }

  return checkedFile;
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function requestProfileVerification(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (isAdminEmail(user.email)) {
    verificationRedirect("admin");
  }

  const selfie = validateVerificationSelfie(formData.get("selfie"));
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, onboarding_completed, verification_status, full_name, account_type, city, country, public_slug",
    )
    .eq("id", user.id)
    .maybeSingle<{
      id: string;
      onboarding_completed: boolean | null;
      verification_status: string | null;
      full_name: string | null;
      account_type: string | null;
      city: string | null;
      country: string | null;
      public_slug: string | null;
    }>();

  if (profileError) {
    verificationRedirect("try_again");
  }

  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  if (profile.verification_status === "verified") {
    redirect("/account");
  }

  const admin = (() => {
    try {
      return createAdminClient();
    } catch {
      verificationRedirect("try_again");
      throw new Error("Unreachable verification admin redirect.");
    }
  })();

  const { data: existingPendingRequest, error: existingPendingRequestError } =
    await admin
      .from("profile_verification_requests")
      .select("id")
      .eq("profile_id", user.id)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle<{ id: string }>();

  if (existingPendingRequestError) {
    verificationRedirect("try_again");
  }

  if (existingPendingRequest) {
    if (profile.verification_status !== "pending") {
      const { error: pendingProfileError } = await admin
        .from("profiles")
        .update({
          verification_status: "pending",
          verification_requested_at: new Date().toISOString(),
          verification_rejected_reason: null,
        })
        .eq("id", user.id)
        .neq("verification_status", "verified");

      if (pendingProfileError) {
        console.error(
          "Could not sync pending verification profile status.",
          pendingProfileError.message,
        );
      }
    }

    verificationRedirect("sent");
  }

  await pruneOldRejectedVerificationRequests(admin, user.id);

  const uploadedSelfie = await (async () => {
    try {
      return await uploadVerificationSelfieFile({
        // Use the authenticated client so Storage RLS, feature flags, and the
        // fixed per-user upload quota remain enforceable.
        supabase,
        profileId: user.id,
        file: selfie,
      });
    } catch {
      verificationRedirect("upload_failed");
      throw new Error("Unreachable verification upload redirect.");
    }
  })();

  const { error: requestError } = await admin
    .from("profile_verification_requests")
    .insert({
      profile_id: user.id,
      selfie_path: uploadedSelfie.storagePath,
      status: "pending",
    });

  if (requestError) {
    await removeVerificationSelfieFiles(admin, uploadedSelfie.storagePath);

    if (isDuplicateVerificationRequestError(requestError)) {
      verificationRedirect("sent");
    }

    verificationRedirect("try_again");
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      verification_status: "pending",
      verification_requested_at: new Date().toISOString(),
      verification_rejected_reason: null,
    })
    .eq("id", user.id);

  if (updateError) {
    verificationRedirect("try_again");
  }

  await sendVerificationRequestAdminEmail({
    profileId: user.id,
    profileName: profile.full_name,
    profileEmail: user.email ?? null,
    accountType: profile.account_type,
    profileSlug: profile.public_slug,
    city: profile.city,
    country: profile.country,
  });

  verificationRedirect("sent");
}

export async function requestAccountDeletion(formData: FormData) {
  if (formData.get("confirm_delete") !== "yes") {
    throw new Error("Please confirm account deletion.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (isAdminEmail(user.email)) {
    throw new Error("Admin accounts cannot be deleted from the account page.");
  }

  const admin = createAdminClient();
  const email = user.email ?? null;
  const { data, error: requestError } = await admin.rpc(
    "request_account_deletion",
    { p_email: email, p_profile_id: user.id },
  );

  if (requestError) {
    throw new Error(requestError.message);
  }

  const deletionRequest = data as AccountDeletionRequestRpcResult | null;

  if (!deletionRequest) {
    throw new Error("Could not request account deletion.");
  }

  if (email && deletionRequest.should_send_confirmation_email) {
    try {
      await sendPendingAccountDeletionConfirmation({
        supabase: admin,
        profileId: user.id,
        fallbackEmail: email,
      });
    } catch (error) {
      console.error("Failed to send account deletion confirmation email.", error);
    }
  }

  revalidatePublicProfileSurfaces(user.id, deletionRequest.public_slug);
  redirect("/account-deletion-pending");
}

export async function updateAccountSettings(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (isAdminEmail(user.email)) {
    redirect("/admin");
  }

  const newMessageEmailsEnabled =
    formData.get("new_message_emails_enabled") === "on";
  const marketingEmailsEnabled =
    formData.get("marketing_emails_enabled") === "on";

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("profile_completion_emails_enabled")
    .eq("id", user.id)
    .single<{ profile_completion_emails_enabled: boolean | null }>();

  if (profileError) {
    throw new Error(profileError.message);
  }

  const profileCompletionEmailsEnabled =
    profile.profile_completion_emails_enabled ?? true;

  const { error } = await supabase
    .from("profiles")
    .update({
      notification_emails_enabled:
        newMessageEmailsEnabled ||
        profileCompletionEmailsEnabled,
      new_message_emails_enabled: newMessageEmailsEnabled,
      marketing_emails_enabled: marketingEmailsEnabled,
    })
    .eq("id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/account/settings");
  redirect("/account/settings?settings=saved");
}

export async function updateSocialMediaConsent(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (isAdminEmail(user.email)) {
    redirect("/admin");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("id", user.id)
    .single<{ account_type: "family" | "au_pair" | null }>();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (
    profile.account_type !== "au_pair" &&
    profile.account_type !== "family"
  ) {
    throw new Error(
      "Social media consent is only available to au pair and family profiles.",
    );
  }

  const consentStatus =
    formData.get("social_media_consent") === "on" ? "accepted" : "declined";
  const { error } = await supabase
    .from("profiles")
    .update({ social_media_consent_status: consentStatus })
    .eq("id", user.id)
    .in("account_type", ["au_pair", "family"]);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/account/settings");
  redirect("/account/settings?social_media=saved");
}
