"use server";

import {
  authEmailRateLimitMessage,
  recordAuthEmailRequest,
} from "@/lib/auth/email-request-rate-limit";
import { resendSignupConfirmationEmail } from "@/lib/auth/confirmation-email";
import { friendlyAuthErrorMessage } from "@/lib/auth/errors";
import { safeAuthReturnTo } from "@/lib/auth/return-to";
import {
  getActiveSuspensionForEmail,
  getPermanentEmailBan,
  permanentBanLoginMessage,
  suspensionLoginMessage,
} from "@/lib/moderation/auth-block";
import { buildRegistrationOnboardingProfile } from "@/lib/onboarding/registration-metadata";
import {
  recordSecurityRequest,
  securityRateLimitMessage,
} from "@/lib/security/rate-limit";
import { shouldRequireTurnstile } from "@/lib/security/turnstile";
import { createAdminClient } from "@/lib/supabase/admin";

export type RegisterWithOnboardingState = {
  error: string;
  email?: string;
  challengeRequired?: boolean;
};

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function readRawString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function serializeOnboardingFormData(formData: FormData) {
  const metadata: Record<string, string | string[]> = {};
  const privateFields = new Set([
    "registration_email",
    "registration_password",
    "accepted_terms",
    "return_to",
  ]);

  for (const [key, value] of formData.entries()) {
    if (privateFields.has(key) || typeof value !== "string") continue;

    const existingValue = metadata[key];

    if (Array.isArray(existingValue)) {
      existingValue.push(value);
    } else if (typeof existingValue === "string") {
      metadata[key] = [existingValue, value];
    } else {
      metadata[key] = value;
    }
  }

  return metadata;
}

async function deleteIncompleteRegistration(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  await adminClient.from("profiles").delete().eq("id", userId);
  await adminClient.auth.admin.deleteUser(userId).catch(() => null);
}

export async function registerWithOnboarding(
  formData: FormData,
): Promise<RegisterWithOnboardingState> {
  const email = readString(formData.get("registration_email")).toLowerCase();
  const password = readRawString(formData.get("registration_password"));
  const acceptedTerms = readString(formData.get("accepted_terms")) === "yes";
  const returnTo = safeAuthReturnTo(readString(formData.get("return_to")));
  const turnstileToken =
    readString(formData.get("turnstile_token")) ||
    readString(formData.get("cf-turnstile-response"));

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }

  if (!acceptedTerms) {
    return { error: "Please accept the Terms and Conditions to create an account." };
  }

  const securityDecision = await recordSecurityRequest({
    action: "signup",
    subject: email,
  });

  if (!securityDecision.allowed) {
    return {
      error: securityRateLimitMessage(securityDecision.retryAfterSeconds),
    };
  }

  if (
    await shouldRequireTurnstile({
      challengeRequired: securityDecision.challengeRequired,
      token: turnstileToken,
    })
  ) {
    return {
      error: "Please complete the security check and try again.",
      challengeRequired: true,
    };
  }

  const permanentBan = await getPermanentEmailBan(email);

  if (permanentBan) {
    return { error: permanentBanLoginMessage(permanentBan.reason) };
  }

  const activeSuspension = await getActiveSuspensionForEmail(email);

  if (activeSuspension) {
    return { error: suspensionLoginMessage(activeSuspension) };
  }

  let registrationProfile;

  try {
    registrationProfile = buildRegistrationOnboardingProfile(
      serializeOnboardingFormData(formData),
    );
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Please check the form and try again.",
    };
  }

  if (!registrationProfile) {
    return { error: "Please check the form and try again." };
  }

  const emailRequestDecision = await recordAuthEmailRequest(
    "signup_confirmation",
    email,
  );

  if (!emailRequestDecision.allowed) {
    return {
      error: authEmailRateLimitMessage(emailRequestDecision.retryAfterSeconds),
    };
  }

  let adminClient;

  try {
    adminClient = createAdminClient();
  } catch {
    return {
      error: "We could not create your account right now. Please try again later.",
    };
  }

  const { data, error: createUserError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: {
      account_type: registrationProfile.accountType,
    },
  });

  if (createUserError) {
    return { error: friendlyAuthErrorMessage(createUserError.message) };
  }

  if (!data.user) {
    return { error: "We could not create your account. Please try again." };
  }

  const { error: profileError } = await adminClient.from("profiles").upsert(
    {
      id: data.user.id,
      email,
      ...registrationProfile.updateData,
      content_moderation_status: "approved",
      content_moderation_needs_review: true,
      content_moderation_reviewed_at: null,
      content_moderation_reviewed_by: null,
      content_moderation_reason:
        "New profile is public and awaits background content review.",
    },
    { onConflict: "id" },
  );

  if (profileError) {
    await deleteIncompleteRegistration(adminClient, data.user.id);

    return {
      error: "We could not save your profile. Please check the form and try again.",
    };
  }

  let resendError: { message: string } | null = null;

  try {
    const resendResult = await resendSignupConfirmationEmail(email, returnTo);
    resendError = resendResult.error;
  } catch {
    resendError = {
      message: "We could not send your confirmation email right now.",
    };
  }

  if (resendError) {
    await deleteIncompleteRegistration(adminClient, data.user.id);

    return {
      error: friendlyAuthErrorMessage(resendError.message),
    };
  }

  return {
    error: "",
    email,
  };
}
