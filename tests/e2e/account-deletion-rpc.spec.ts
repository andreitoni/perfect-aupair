import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { sendPendingAccountDeletionConfirmation } from "../../lib/privacy/send-account-deletion-confirmations";
import { cleanupScheduledAccountDeletions } from "../../lib/privacy/cleanup-scheduled-account-deletions";
import { getSupabaseCredentials } from "./helpers/supabase-local";

const PASSWORD = "TestPassword123!";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type RequestDeletionResult = {
  request_id: string;
  public_slug: string | null;
  should_send_confirmation_email: boolean;
};

function createAdminClient() {
  const { url, serviceRoleKey } = getSupabaseCredentials();

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createAuthenticatedClient() {
  const { url, publishableKey } = getSupabaseCredentials();

  if (!publishableKey) {
    throw new Error("Could not find local Supabase publishable key.");
  }

  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createAuthDeleteFailureClient(
  admin: SupabaseClient,
  failingProfileId: string,
) {
  return new Proxy(admin, {
    get(target, property) {
      if (property === "auth") {
        return {
          admin: {
            getUserById: admin.auth.admin.getUserById.bind(admin.auth.admin),
            deleteUser: async (
              profileId: string,
              shouldSoftDelete?: boolean,
            ) => {
              if (profileId !== failingProfileId) {
                return admin.auth.admin.deleteUser(
                  profileId,
                  shouldSoftDelete,
                );
              }

              return {
                data: null,
                error: {
                  message: "Injected route not found.",
                  status: 404,
                  code: "unexpected_failure",
                },
              };
            },
          },
        };
      }

      const value = Reflect.get(target, property, target);

      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Parameters<typeof cleanupScheduledAccountDeletions>[0]["supabase"];
}

async function removeFixture(admin: SupabaseClient, profileId: string | null) {
  if (!profileId) {
    return;
  }

  await admin
    .from("account_deletion_requests")
    .delete()
    .eq("profile_id", profileId);
  await admin.auth.admin.deleteUser(profileId);
}

test.describe("atomic account deletion RPCs", () => {
  test.describe.configure({ mode: "serial" });

  test("reject anonymous callers", async () => {
    const anonymous = createAuthenticatedClient();

    const [{ error: requestError }, { error: cancelError }] = await Promise.all([
      anonymous.rpc("request_account_deletion", {
        p_email: "anonymous@example.com",
        p_profile_id: "00000000-0000-0000-0000-000000000001",
      }),
      anonymous.rpc("cancel_account_deletion", {
        p_profile_id: "00000000-0000-0000-0000-000000000001",
      }),
    ]);

    expect(requestError).not.toBeNull();
    expect(cancelError).not.toBeNull();
  });

  test("request and cancellation keep profile and queue state synchronized", async () => {
    const admin = createAdminClient();
    const authenticated = createAuthenticatedClient();
    const email = `qa-account-deletion-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}@example.com`;
    let profileId: string | null = null;

    try {
      const { data: createdUser, error: createError } =
        await admin.auth.admin.createUser({
          email,
          password: PASSWORD,
          email_confirm: true,
          user_metadata: { account_type: "au_pair" },
        });

      if (createError || !createdUser.user) {
        throw new Error(createError?.message ?? "Could not create test user.");
      }

      profileId = createdUser.user.id;

      const { error: signInError } = await authenticated.auth.signInWithPassword({
        email,
        password: PASSWORD,
      });

      if (signInError) {
        throw new Error(signInError.message);
      }

      const { error: staleProfileEmailError } = await admin
        .from("profiles")
        .update({ email: "stale-profile-email@example.com" })
        .eq("id", profileId);

      if (staleProfileEmailError) {
        throw new Error(staleProfileEmailError.message);
      }

      const { error: directRequestError } = await authenticated.rpc(
        "request_account_deletion",
        { p_email: email, p_profile_id: profileId },
      );

      expect(directRequestError).not.toBeNull();

      const { data: requestData, error: requestError } = await admin.rpc(
        "request_account_deletion",
        { p_email: email, p_profile_id: profileId },
      );

      expect(requestError).toBeNull();
      expect(
        (requestData as RequestDeletionResult)
          .should_send_confirmation_email,
      ).toBe(true);

      const { data: repeatedRequestData, error: repeatedRequestError } =
        await admin.rpc("request_account_deletion", {
          p_email: email,
          p_profile_id: profileId,
        });

      expect(repeatedRequestError).toBeNull();
      expect(
        (repeatedRequestData as RequestDeletionResult)
          .should_send_confirmation_email,
      ).toBe(true);
      expect((repeatedRequestData as RequestDeletionResult).request_id).toBe(
        (requestData as RequestDeletionResult).request_id,
      );

      const originalFetch = globalThis.fetch;
      const originalResendApiKey = process.env.RESEND_API_KEY;
      let resendRequestCount = 0;

      process.env.RESEND_API_KEY = "test-resend-key";
      globalThis.fetch = async (input, init) => {
        const requestUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;

        if (requestUrl === "https://api.resend.com/emails") {
          resendRequestCount += 1;
          expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
            `account-deletion-requested/${
              (requestData as RequestDeletionResult).request_id
            }`,
          );
          return new Response(JSON.stringify({ id: "test-email-id" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return originalFetch(input, init);
      };

      try {
        const confirmationResults = await Promise.all([
          sendPendingAccountDeletionConfirmation({
            supabase: admin,
            profileId,
            fallbackEmail: email,
          }),
          sendPendingAccountDeletionConfirmation({
            supabase: admin,
            profileId,
            fallbackEmail: email,
          }),
        ]);

        expect(resendRequestCount).toBe(1);
        expect(
          confirmationResults.filter((result) => result.sent),
        ).toHaveLength(1);
      } finally {
        globalThis.fetch = originalFetch;

        if (originalResendApiKey === undefined) {
          delete process.env.RESEND_API_KEY;
        } else {
          process.env.RESEND_API_KEY = originalResendApiKey;
        }
      }

      const { data: cooledDownRequestData, error: cooledDownRequestError } =
        await admin.rpc("request_account_deletion", {
          p_email: email,
          p_profile_id: profileId,
        });

      expect(cooledDownRequestError).toBeNull();
      expect(
        (cooledDownRequestData as RequestDeletionResult)
          .should_send_confirmation_email,
      ).toBe(false);

      const [{ data: requestedProfile }, { data: deletionRequests }] =
        await Promise.all([
          admin
            .from("profiles")
            .select("deletion_requested_at, deletion_scheduled_at")
            .eq("id", profileId)
            .single(),
          admin
            .from("account_deletion_requests")
            .select("id, email, requested_at, scheduled_delete_at, status")
            .eq("profile_id", profileId),
        ]);

      expect(requestedProfile?.deletion_requested_at).toBeTruthy();
      expect(requestedProfile?.deletion_scheduled_at).toBeTruthy();
      expect(deletionRequests).toHaveLength(1);
      expect(deletionRequests?.[0]).toMatchObject({ email, status: "pending" });
      expect(deletionRequests?.[0].requested_at).toBe(
        requestedProfile?.deletion_requested_at,
      );
      expect(deletionRequests?.[0].scheduled_delete_at).toBe(
        requestedProfile?.deletion_scheduled_at,
      );
      expect(
        new Date(deletionRequests?.[0].scheduled_delete_at ?? 0).getTime() -
          new Date(deletionRequests?.[0].requested_at ?? 0).getTime(),
      ).toBe(SEVEN_DAYS_MS);

      const deletionRequestId = deletionRequests?.[0]?.id;

      expect(deletionRequestId).toBeTruthy();
      const firstClaimToken = crypto.randomUUID();
      const secondClaimToken = crypto.randomUUID();

      const dueAt = new Date(Date.now() - 60_000).toISOString();
      const [{ error: dueProfileError }, { error: dueRequestError }] =
        await Promise.all([
          admin
            .from("profiles")
            .update({ deletion_scheduled_at: dueAt })
            .eq("id", profileId),
          admin
            .from("account_deletion_requests")
            .update({ scheduled_delete_at: dueAt })
            .eq("id", deletionRequestId),
        ]);

      if (dueProfileError || dueRequestError) {
        throw new Error(
          dueProfileError?.message ?? dueRequestError?.message ?? "Could not age deletion request.",
        );
      }

      const { data: claimedProfileId, error: claimError } = await admin.rpc(
        "claim_scheduled_account_deletion",
        {
          p_request_id: deletionRequestId,
          p_cutoff: new Date().toISOString(),
          p_stale_before: new Date(Date.now() - 60_000).toISOString(),
          p_processing_token: firstClaimToken,
        },
      );

      expect(claimError).toBeNull();
      expect(claimedProfileId).toBe(profileId);

      const { data: reclaimedProfileId, error: reclaimError } = await admin.rpc(
        "claim_scheduled_account_deletion",
        {
          p_request_id: deletionRequestId,
          p_cutoff: new Date().toISOString(),
          p_stale_before: new Date(Date.now() + 60_000).toISOString(),
          p_processing_token: secondClaimToken,
        },
      );

      expect(reclaimError).toBeNull();
      expect(reclaimedProfileId).toBe(profileId);

      const { error: claimedCancelError } = await admin.rpc(
        "cancel_account_deletion",
        { p_profile_id: profileId },
      );

      expect(claimedCancelError).not.toBeNull();

      const { data: staleRelease, error: staleReleaseError } = await admin
        .from("account_deletion_requests")
        .update({ processing_started_at: null, processing_token: null })
        .eq("id", deletionRequestId)
        .eq("status", "processing")
        .eq("processing_token", firstClaimToken)
        .select("id")
        .maybeSingle();

      expect(staleReleaseError).toBeNull();
      expect(staleRelease).toBeNull();

      const { data: activeLease, error: activeLeaseError } = await admin
        .from("account_deletion_requests")
        .select("processing_token")
        .eq("id", deletionRequestId)
        .single();

      expect(activeLeaseError).toBeNull();
      expect(activeLease?.processing_token).toBe(secondClaimToken);

      const { error: releaseError } = await admin
        .from("account_deletion_requests")
        .update({
          status: "pending",
          processing_started_at: null,
          processing_token: null,
        })
        .eq("id", deletionRequestId)
        .eq("status", "processing")
        .eq("processing_token", secondClaimToken);

      expect(releaseError).toBeNull();

      const { error: cancelError } = await admin.rpc(
        "cancel_account_deletion",
        { p_profile_id: profileId },
      );

      expect(cancelError).toBeNull();

      const { data: cancelledClaim, error: cancelledClaimError } =
        await admin.rpc("claim_scheduled_account_deletion", {
          p_request_id: deletionRequestId,
          p_cutoff: new Date().toISOString(),
          p_stale_before: new Date(Date.now() + 60_000).toISOString(),
          p_processing_token: crypto.randomUUID(),
        });

      expect(cancelledClaimError).toBeNull();
      expect(cancelledClaim).toBeNull();

      const [{ data: reactivatedProfile }, { data: cancelledRequests }] =
        await Promise.all([
          admin
            .from("profiles")
            .select("deletion_requested_at, deletion_scheduled_at")
            .eq("id", profileId)
            .single(),
          admin
            .from("account_deletion_requests")
            .select("status")
            .eq("profile_id", profileId),
        ]);

      expect(reactivatedProfile).toMatchObject({
        deletion_requested_at: null,
        deletion_scheduled_at: null,
      });
      expect(cancelledRequests).toEqual([{ status: "cancelled" }]);

      const { error: resetOnboardingError } = await admin
        .from("profiles")
        .update({ onboarding_completed: false })
        .eq("id", profileId);

      if (resetOnboardingError) {
        throw new Error(resetOnboardingError.message);
      }

      const { error: photoError } = await admin.from("profile_photos").insert({
        profile_id: profileId,
        storage_path: `${profileId}/reactivation-guard.png`,
        is_primary: true,
      });

      if (photoError) {
        throw new Error(photoError.message);
      }

      const { error: repeatedCancelError } = await admin.rpc(
        "cancel_account_deletion",
        { p_profile_id: profileId },
      );

      expect(repeatedCancelError).not.toBeNull();

      const { data: guardedProfile } = await admin
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", profileId)
        .single();

      expect(guardedProfile?.onboarding_completed).toBe(false);
    } finally {
      await authenticated.auth.signOut();
      await removeFixture(admin, profileId);
    }
  });

  test("admin promotion cancels a claimed deletion before destructive work", async () => {
    const admin = createAdminClient();
    const authenticated = createAuthenticatedClient();
    const email = `qa-admin-promotion-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}@example.com`;
    let profileId: string | null = null;

    try {
      const { data: createdUser, error: createError } =
        await admin.auth.admin.createUser({
          email,
          password: PASSWORD,
          email_confirm: true,
          user_metadata: { account_type: "family" },
        });

      if (createError || !createdUser.user) {
        throw new Error(createError?.message ?? "Could not create test user.");
      }

      profileId = createdUser.user.id;
      const { error: signInError } = await authenticated.auth.signInWithPassword({
        email,
        password: PASSWORD,
      });

      if (signInError) {
        throw new Error(signInError.message);
      }

      const { error: selfPromotionError } = await authenticated
        .from("profiles")
        .update({ is_admin: true })
        .eq("id", profileId);

      expect(selfPromotionError).not.toBeNull();

      const { data: unprivilegedProfile } = await admin
        .from("profiles")
        .select("is_admin")
        .eq("id", profileId)
        .single();

      expect(unprivilegedProfile?.is_admin).toBe(false);

      const { data: requestData, error: requestError } = await admin.rpc(
        "request_account_deletion",
        { p_email: email, p_profile_id: profileId },
      );

      expect(requestError).toBeNull();

      const deletionRequestId = (requestData as RequestDeletionResult)
        .request_id;
      const dueAt = new Date(Date.now() - 60_000).toISOString();
      const [{ error: profileDueError }, { error: requestDueError }] =
        await Promise.all([
          admin
            .from("profiles")
            .update({ deletion_scheduled_at: dueAt })
            .eq("id", profileId),
          admin
            .from("account_deletion_requests")
            .update({ scheduled_delete_at: dueAt })
            .eq("id", deletionRequestId),
        ]);

      expect(profileDueError).toBeNull();
      expect(requestDueError).toBeNull();

      const processingToken = crypto.randomUUID();
      const { data: claimedProfileId, error: claimError } = await admin.rpc(
        "claim_scheduled_account_deletion",
        {
          p_request_id: deletionRequestId,
          p_cutoff: new Date().toISOString(),
          p_stale_before: new Date(Date.now() - 60_000).toISOString(),
          p_processing_token: processingToken,
        },
      );

      expect(claimError).toBeNull();
      expect(claimedProfileId).toBe(profileId);

      const { error: promotionError } = await admin
        .from("profiles")
        .update({ is_admin: true })
        .eq("id", profileId);

      expect(promotionError).toBeNull();

      const { data: renewedProfileId, error: renewError } = await admin.rpc(
        "renew_account_deletion_claim",
        {
          p_request_id: deletionRequestId,
          p_processing_token: processingToken,
        },
      );

      expect(renewError).toBeNull();
      expect(renewedProfileId).toBeNull();

      const [{ data: promotedProfile }, { data: cancelledRequest }] =
        await Promise.all([
          admin
            .from("profiles")
            .select("is_admin, deletion_requested_at, deletion_scheduled_at")
            .eq("id", profileId)
            .single(),
          admin
            .from("account_deletion_requests")
            .select("status, processing_token")
            .eq("id", deletionRequestId)
            .single(),
        ]);

      expect(promotedProfile).toMatchObject({
        is_admin: true,
        deletion_requested_at: null,
        deletion_scheduled_at: null,
      });
      expect(cancelledRequest).toMatchObject({
        status: "cancelled",
        processing_token: null,
      });
    } finally {
      await authenticated.auth.signOut();
      await removeFixture(admin, profileId);
    }
  });

  test("one auth failure preserves its manifest without blocking the rest of the batch", async () => {
    const admin = createAdminClient();
    const owner = createAuthenticatedClient();
    const email = `qa-cleanup-retry-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}@example.com`;
    let profileId: string | null = null;
    let storagePath: string | null = null;
    let counterpartId: string | null = null;
    let messageStoragePath: string | null = null;
    let selfieStoragePath: string | null = null;
    let healthyProfileId: string | null = null;

    try {
      const { data: createdUser, error: createError } =
        await admin.auth.admin.createUser({
          email,
          password: PASSWORD,
          email_confirm: true,
          user_metadata: { account_type: "au_pair" },
        });

      if (createError || !createdUser.user) {
        throw new Error(createError?.message ?? "Could not create test user.");
      }

      profileId = createdUser.user.id;
      const { error: ownerSignInError } = await owner.auth.signInWithPassword({
        email,
        password: PASSWORD,
      });
      if (ownerSignInError) {
        throw new Error(ownerSignInError.message);
      }

      const { error: eligibleProfileError } = await admin
        .from("profiles")
        .update({
          onboarding_completed: true,
          content_moderation_status: "approved",
          preferred_host_countries: ["Germany"],
        })
        .eq("id", profileId);
      if (eligibleProfileError) {
        throw new Error(eligibleProfileError.message);
      }

      selfieStoragePath = `${profileId}/cleanup-verification-selfie.webp`;
      const selfieBytes = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]);
      const selfieReservation = await owner.rpc("reserve_storage_upload_quota", {
        p_bucket_id: "verification-selfies",
        p_object_name: selfieStoragePath,
        p_size_bytes: selfieBytes.byteLength,
      });
      if (selfieReservation.error || selfieReservation.data !== true) {
        throw new Error(
          selfieReservation.error?.message ??
            "Could not reserve verification selfie upload.",
        );
      }

      const { error: selfieUploadError } = await owner.storage
        .from("verification-selfies")
        .upload(selfieStoragePath, selfieBytes, {
          contentType: "image/webp",
          upsert: false,
        });
      if (selfieUploadError) {
        throw new Error(selfieUploadError.message);
      }

      const { error: verificationRequestError } = await admin
        .from("profile_verification_requests")
        .insert({ profile_id: profileId, selfie_path: selfieStoragePath });
      if (verificationRequestError) {
        throw new Error(verificationRequestError.message);
      }

      const { data: counterpartUser, error: counterpartError } =
        await admin.auth.admin.createUser({
          email: `qa-cleanup-counterpart-${Date.now()}-${Math.random()
            .toString(16)
            .slice(2)}@example.com`,
          password: PASSWORD,
          email_confirm: true,
          user_metadata: { account_type: "family" },
        });

      if (counterpartError || !counterpartUser.user) {
        throw new Error(
          counterpartError?.message ?? "Could not create counterpart user.",
        );
      }

      counterpartId = counterpartUser.user.id;
      const { data: conversation, error: conversationError } = await admin
        .from("conversations")
        .insert({ family_id: counterpartId, au_pair_id: profileId })
        .select("id")
        .single();

      if (conversationError || !conversation) {
        throw new Error(
          conversationError?.message ?? "Could not create test conversation.",
        );
      }

      messageStoragePath = `${conversation.id}/retention-race.png`;
      const { error: messageUploadError } = await admin.storage
        .from("message-photos")
        .upload(messageStoragePath, new Uint8Array([137, 80, 78, 71]), {
          contentType: "image/png",
          upsert: false,
        });

      if (messageUploadError) {
        throw new Error(messageUploadError.message);
      }

      const { data: message, error: messageError } = await admin
        .from("messages")
        .insert({
          conversation_id: conversation.id,
          sender_id: counterpartId,
          body: "Photo attachment",
          image_path: messageStoragePath,
          image_mime_type: "image/png",
        })
        .select("id")
        .single();

      if (messageError || !message) {
        throw new Error(messageError?.message ?? "Could not create test message.");
      }

      storagePath = `${profileId}/cleanup-retry.png`;
      const { error: uploadError } = await admin.storage
        .from("profile-photos")
        .upload(storagePath, new Uint8Array([137, 80, 78, 71]), {
          contentType: "image/png",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { error: photoError } = await admin.from("profile_photos").insert({
        profile_id: profileId,
        storage_path: storagePath,
        is_primary: true,
      });

      if (photoError) {
        throw new Error(photoError.message);
      }

      const { data: requestData, error: requestError } = await admin.rpc(
        "request_account_deletion",
        { p_email: email, p_profile_id: profileId },
      );

      expect(requestError).toBeNull();

      const deletionRequestId = (requestData as RequestDeletionResult)
        .request_id;
      const healthyEmail = `qa-cleanup-healthy-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}@example.com`;
      const { data: healthyUser, error: healthyUserError } =
        await admin.auth.admin.createUser({
          email: healthyEmail,
          password: PASSWORD,
          email_confirm: true,
          user_metadata: { account_type: "family" },
        });

      if (healthyUserError || !healthyUser.user) {
        throw new Error(
          healthyUserError?.message ?? "Could not create healthy cleanup user.",
        );
      }

      healthyProfileId = healthyUser.user.id;
      const { data: healthyRequestData, error: healthyRequestError } =
        await admin.rpc("request_account_deletion", {
          p_email: healthyEmail,
          p_profile_id: healthyProfileId,
        });

      if (healthyRequestError || !healthyRequestData) {
        throw new Error(
          healthyRequestError?.message ??
            "Could not request healthy account deletion.",
        );
      }

      const healthyDeletionRequestId = (
        healthyRequestData as RequestDeletionResult
      ).request_id;
      const { error: lateMessageError } = await admin.from("messages").insert({
        conversation_id: conversation.id,
        sender_id: counterpartId,
        body: "This must be blocked after deletion is requested",
      });

      expect(lateMessageError).not.toBeNull();

      const dueAt = new Date(Date.now() - 120_000).toISOString();
      const healthyDueAt = new Date(Date.now() - 60_000).toISOString();
      const [
        { error: profileDueError },
        { error: requestDueError },
        { error: healthyProfileDueError },
        { error: healthyRequestDueError },
      ] = await Promise.all([
        admin
          .from("profiles")
          .update({ deletion_scheduled_at: dueAt })
          .eq("id", profileId),
        admin
          .from("account_deletion_requests")
          .update({
            scheduled_delete_at: dueAt,
            confirmation_email_sent_at: new Date().toISOString(),
          })
          .eq("id", deletionRequestId),
        admin
          .from("profiles")
          .update({ deletion_scheduled_at: healthyDueAt })
          .eq("id", healthyProfileId),
        admin
          .from("account_deletion_requests")
          .update({
            scheduled_delete_at: healthyDueAt,
            confirmation_email_sent_at: new Date().toISOString(),
          })
          .eq("id", healthyDeletionRequestId),
      ]);

      expect(profileDueError).toBeNull();
      expect(requestDueError).toBeNull();
      expect(healthyProfileDueError).toBeNull();
      expect(healthyRequestDueError).toBeNull();

      const partialCleanupResult = await cleanupScheduledAccountDeletions({
        supabase: createAuthDeleteFailureClient(admin, profileId),
        batchSize: 2,
        now: new Date(),
      });

      expect(partialCleanupResult).toMatchObject({
        completed: 1,
        failed: 1,
      });
      expect(partialCleanupResult.failures).toEqual([
        {
          requestId: deletionRequestId,
          message: "Injected route not found.",
        },
      ]);

      const { data: healthyCompletedRequest, error: healthyCompletedError } =
        await admin
          .from("account_deletion_requests")
          .select("status, email")
          .eq("id", healthyDeletionRequestId)
          .single();

      expect(healthyCompletedError).toBeNull();
      expect(healthyCompletedRequest?.status).toBe("completed");
      expect(healthyCompletedRequest?.email).toBeNull();

      const [{ data: preservedFile, error: preservedFileError }, failedRequest] =
        await Promise.all([
          admin.storage.from("profile-photos").download(storagePath),
          admin
            .from("account_deletion_requests")
            .select(
              "status, processing_token, destructive_started_at, cleanup_storage_manifest",
            )
            .eq("id", deletionRequestId)
            .single(),
        ]);

      expect(preservedFileError).toBeNull();
      expect(preservedFile).not.toBeNull();
      expect(failedRequest.error).toBeNull();
      expect(failedRequest.data).toMatchObject({
        status: "processing",
        processing_token: null,
      });
      expect(failedRequest.data?.destructive_started_at).toBeTruthy();
      expect(failedRequest.data?.cleanup_storage_manifest).toMatchObject({
        profilePhotoPaths: [storagePath],
        verificationSelfiePaths: [selfieStoragePath],
        messagePhotoPaths: [],
      });

      const { error: retainedInsertError } = await admin
        .from("retained_message_photos")
        .insert({
          message_id: message.id,
          conversation_id: conversation.id,
          sender_id: counterpartId,
          original_image_path: messageStoragePath,
          image_mime_type: "image/png",
          retained_until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        });
      const { error: hideMessageMediaError } = await admin
        .from("messages")
        .update({ image_path: null, image_mime_type: null })
        .eq("id", message.id);

      expect(retainedInsertError).toBeNull();
      expect(hideMessageMediaError).toBeNull();

      const retryResult = await cleanupScheduledAccountDeletions({
        supabase: admin,
        batchSize: 1,
        now: new Date(),
      });

      expect(retryResult.completed).toBe(1);

      const [
        { data: completedRequest },
        removedFile,
        retainedMessageFile,
        retainedMessageRow,
        removedSelfie,
      ] = await Promise.all([
        admin
          .from("account_deletion_requests")
          .select("status, email, processing_token, cleanup_storage_manifest")
          .eq("id", deletionRequestId)
          .single(),
        admin.storage.from("profile-photos").download(storagePath),
        admin.storage.from("message-photos").download(messageStoragePath),
        admin
          .from("retained_message_photos")
          .select("original_image_path")
          .eq("original_image_path", messageStoragePath)
          .single(),
        admin.storage
          .from("verification-selfies")
          .download(selfieStoragePath),
      ]);

      expect(completedRequest).toMatchObject({
        status: "completed",
        email: null,
        processing_token: null,
        cleanup_storage_manifest: null,
      });
      expect(removedFile.error).not.toBeNull();
      expect(retainedMessageFile.error).toBeNull();
      expect(retainedMessageRow.data?.original_image_path).toBe(
        messageStoragePath,
      );
      expect(removedSelfie.error).not.toBeNull();
    } finally {
      await owner.auth.signOut();

      if (storagePath) {
        await admin.storage.from("profile-photos").remove([storagePath]);
      }

      if (messageStoragePath) {
        await admin
          .from("retained_message_photos")
          .delete()
          .eq("original_image_path", messageStoragePath);
        await admin.storage.from("message-photos").remove([messageStoragePath]);
      }

      if (selfieStoragePath) {
        await admin.storage
          .from("verification-selfies")
          .remove([selfieStoragePath]);
      }

      await removeFixture(admin, profileId);
      await removeFixture(admin, healthyProfileId);

      if (counterpartId) {
        await admin.auth.admin.deleteUser(counterpartId);
      }
    }
  });
});
