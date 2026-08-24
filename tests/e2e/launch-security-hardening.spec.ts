import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { cleanupOrphanedMedia } from "../../lib/images/cleanup-orphaned-media";
import { getSupabaseCredentials } from "./helpers/supabase-local";

const PASSWORD = "TestPassword123!";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TestPair = {
  admin: SupabaseClient;
  anonymous: SupabaseClient;
  auPair: SupabaseClient;
  auPairId: string;
  family: SupabaseClient;
  familyId: string;
  suffix: string;
};

function createAdminClient() {
  const { url, serviceRoleKey } = getSupabaseCredentials();

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function createPublicClient() {
  const { url, publishableKey } = getSupabaseCredentials();

  if (!publishableKey) {
    throw new Error("Could not find local Supabase publishable key.");
  }

  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createPair(): Promise<TestPair> {
  const admin = createAdminClient();
  const anonymous = createPublicClient();
  const family = createPublicClient();
  const auPair = createPublicClient();
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const familyEmail = `qa-launch-family-${suffix}@example.com`;
  const auPairEmail = `qa-launch-aupair-${suffix}@example.com`;

  const [familyUserResult, auPairUserResult] = await Promise.all([
    admin.auth.admin.createUser({
      email: familyEmail,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { account_type: "family" },
    }),
    admin.auth.admin.createUser({
      email: auPairEmail,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { account_type: "au_pair" },
    }),
  ]);

  if (familyUserResult.error || !familyUserResult.data.user) {
    throw new Error(
      familyUserResult.error?.message ?? "Could not create family fixture.",
    );
  }

  if (auPairUserResult.error || !auPairUserResult.data.user) {
    await admin.auth.admin.deleteUser(familyUserResult.data.user.id);
    throw new Error(
      auPairUserResult.error?.message ?? "Could not create au pair fixture.",
    );
  }

  const familyId = familyUserResult.data.user.id;
  const auPairId = auPairUserResult.data.user.id;
  const { error: profileError } = await admin.from("profiles").upsert([
    {
      id: familyId,
      email: familyEmail,
      account_type: "family",
      full_name: `QA Family ${suffix}`,
      first_name: "QA",
      last_name: `Family-${suffix}`,
      city: "Berlin",
      country: "Germany",
      preferred_host_countries: [],
      onboarding_completed: true,
      public_slug: `qa-family-${suffix}`,
      content_moderation_status: "approved",
      last_active_at: new Date().toISOString(),
    },
    {
      id: auPairId,
      email: auPairEmail,
      account_type: "au_pair",
      full_name: `QA AuPair ${suffix}`,
      first_name: "QA",
      last_name: `AuPair-${suffix}`,
      city: "London",
      country: "United Kingdom",
      preferred_host_countries: ["Germany"],
      onboarding_completed: true,
      public_slug: `qa-aupair-${suffix}`,
      content_moderation_status: "approved",
      last_active_at: new Date().toISOString(),
    },
  ]);

  if (profileError) {
    await Promise.all([
      admin.auth.admin.deleteUser(familyId),
      admin.auth.admin.deleteUser(auPairId),
    ]);
    throw new Error(profileError.message);
  }

  const { error: photoError } = await admin.from("profile_photos").insert([
    {
      profile_id: familyId,
      storage_path: `${familyId}/launch-family-${suffix}.webp`,
      is_primary: true,
    },
    {
      profile_id: auPairId,
      storage_path: `${auPairId}/launch-aupair-${suffix}.webp`,
      is_primary: true,
    },
  ]);

  if (photoError) {
    await Promise.all([
      admin.auth.admin.deleteUser(familyId),
      admin.auth.admin.deleteUser(auPairId),
    ]);
    throw new Error(photoError.message);
  }

  const { error: moderationRestoreError } = await admin
    .from("profiles")
    .update({ content_moderation_status: "approved" })
    .in("id", [familyId, auPairId]);

  if (moderationRestoreError) {
    await admin
      .from("profile_photos")
      .delete()
      .in("profile_id", [familyId, auPairId]);
    await Promise.all([
      admin.auth.admin.deleteUser(familyId),
      admin.auth.admin.deleteUser(auPairId),
    ]);
    throw new Error(moderationRestoreError.message);
  }

  const [familySignIn, auPairSignIn] = await Promise.all([
    family.auth.signInWithPassword({ email: familyEmail, password: PASSWORD }),
    auPair.auth.signInWithPassword({ email: auPairEmail, password: PASSWORD }),
  ]);

  if (familySignIn.error || auPairSignIn.error) {
    await admin
      .from("profile_photos")
      .delete()
      .in("profile_id", [familyId, auPairId]);
    await Promise.all([
      admin.auth.admin.deleteUser(familyId),
      admin.auth.admin.deleteUser(auPairId),
    ]);
    throw new Error(
      familySignIn.error?.message ??
        auPairSignIn.error?.message ??
        "Could not authenticate fixtures.",
    );
  }

  return {
    admin,
    anonymous,
    auPair,
    auPairId,
    family,
    familyId,
    suffix,
  };
}

async function removePair(pair: TestPair) {
  await pair.admin
    .from("moderation_reports")
    .delete()
    .or(
      `reporter_id.in.(${pair.familyId},${pair.auPairId}),reported_profile_id.in.(${pair.familyId},${pair.auPairId})`,
    );
  await pair.admin
    .from("account_deletion_requests")
    .delete()
    .in("profile_id", [pair.familyId, pair.auPairId]);
  await pair.admin
    .from("profile_photos")
    .delete()
    .in("profile_id", [pair.familyId, pair.auPairId]);
  await Promise.all([
    pair.admin.auth.admin.deleteUser(pair.familyId),
    pair.admin.auth.admin.deleteUser(pair.auPairId),
  ]);
}

test.describe("launch security hardening", () => {
  test.describe.configure({ mode: "serial" });

  test("protects server-owned profile fields and hides ineligible photo rows", async () => {
    const pair = await createPair();

    try {
      const { error: massAssignmentError } = await pair.family
        .from("profiles")
        .update({
          account_type: "au_pair",
          content_moderation_status: "approved",
          onboarding_completed: false,
          verification_status: "verified",
        })
        .eq("id", pair.familyId);

      expect(massAssignmentError).not.toBeNull();
      expect(massAssignmentError?.code).toBe("42501");

      const forgedActivity = new Date("2099-01-01T00:00:00.000Z").toISOString();
      const { error: forgedActivityError } = await pair.family
        .from("profiles")
        .update({ last_active_at: forgedActivity })
        .eq("id", pair.familyId);

      expect(forgedActivityError?.code).toBe("42501");

      const beforeTouch = Date.now();
      const { data: touchedAt, error: touchError } = await pair.family.rpc(
        "touch_profile_activity",
      );

      expect(touchError).toBeNull();
      expect(new Date(String(touchedAt)).getTime()).toBeGreaterThanOrEqual(
        beforeTouch - 1_000,
      );

      const { error: bioError } = await pair.family
        .from("profiles")
        .update({ bio: "A normal user-editable introduction." })
        .eq("id", pair.familyId);

      expect(bioError).toBeNull();

      const { error: oversizedBioError } = await pair.family
        .from("profiles")
        .update({ bio: "x".repeat(1_401) })
        .eq("id", pair.familyId);
      const { error: digitNameError } = await pair.auPair
        .from("profiles")
        .update({ first_name: "Ana2" })
        .eq("id", pair.auPairId);
      const { error: oversizedLanguagesError } = await pair.auPair
        .from("profiles")
        .update({
          languages: Array.from({ length: 13 }, (_, index) => `Language ${index}`),
        })
        .eq("id", pair.auPairId);
      const { error: underageError } = await pair.auPair
        .from("profiles")
        .update({ date_of_birth: "2010-01-01" })
        .eq("id", pair.auPairId);

      expect(oversizedBioError?.code).toBe("22023");
      expect(digitNameError?.code).toBe("22023");
      expect(oversizedLanguagesError?.code).toBe("22023");
      expect(underageError?.code).toBe("22023");

      const { error: internationalNameError } = await pair.auPair
        .from("profiles")
        .update({
          first_name: "Élise-Marie",
          last_name: "O'Neil",
          full_name: "Élise-Marie O'Neil",
          date_of_birth: "2000-02-29",
        })
        .eq("id", pair.auPairId);

      expect(internationalNameError).toBeNull();

      const { data: synchronizedBirthDate } = await pair.auPair
        .from("profiles")
        .select("birth_date, date_of_birth")
        .eq("id", pair.auPairId)
        .single();

      expect(synchronizedBirthDate).toMatchObject({
        birth_date: "2000-02-29",
        date_of_birth: "2000-02-29",
      });

      const { data: publicEditedProfile, error: publicEditedProfileError } =
        await pair.anonymous.rpc("get_public_profile", {
          p_profile_id: pair.auPairId,
        });

      expect(publicEditedProfileError).toBeNull();
      expect(publicEditedProfile?.[0]?.full_name).toBe("Élise-Marie O'Neil");

      const { data: ownProfile, error: ownProfileError } = await pair.family
        .from("profiles")
        .select(
          "account_type, content_moderation_status, content_moderation_needs_review, verification_status",
        )
        .eq("id", pair.familyId)
        .single();

      expect(ownProfileError).toBeNull();
      expect(ownProfile?.account_type).toBe("family");
      expect(ownProfile?.verification_status).not.toBe("verified");
      expect(ownProfile?.content_moderation_status).toBe("approved");
      expect(ownProfile?.content_moderation_needs_review).toBe(true);

      const { data: anonymousPendingPhotos, error: pendingPhotoError } =
        await pair.anonymous
          .from("profile_photos")
          .select("id")
          .eq("profile_id", pair.familyId);

      expect(pendingPhotoError).toBeNull();
      expect(anonymousPendingPhotos).toHaveLength(1);

      const { data: ownerPhotos, error: ownerPhotoError } = await pair.family
        .from("profile_photos")
        .select("id")
        .eq("profile_id", pair.familyId);

      expect(ownerPhotoError).toBeNull();
      expect(ownerPhotos).toHaveLength(1);

      const { error: adminUpdateError } = await pair.admin
        .from("profiles")
        .update({
          verification_status: "verified",
        })
        .eq("id", pair.familyId);

      expect(adminUpdateError).toBeNull();

      const { data: anonymousApprovedPhotos, error: approvedPhotoError } =
        await pair.anonymous
          .from("profile_photos")
          .select("id")
          .eq("profile_id", pair.familyId);

      expect(approvedPhotoError).toBeNull();
      expect(anonymousApprovedPhotos).toHaveLength(1);

      const { error: verifiedDeleteError } =
        await pair.admin.auth.admin.deleteUser(pair.familyId);

      expect(verifiedDeleteError).toBeNull();
    } finally {
      await removePair(pair);
    }
  });

  test("server-stamps verification requests and moderation reports", async () => {
    const pair = await createPair();
    const selfiePath =
      `${pair.familyId}/launch-verification-${pair.suffix}.webp`;

    try {
      const selfieBytes = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]);
      const selfieReservation = await pair.family.rpc(
        "reserve_storage_upload_quota",
        {
          p_bucket_id: "verification-selfies",
          p_object_name: selfiePath,
          p_size_bytes: selfieBytes.byteLength,
        },
      );
      expect(selfieReservation.error).toBeNull();
      expect(selfieReservation.data).toBe(true);

      const { error: selfieUploadError } = await pair.family.storage
        .from("verification-selfies")
        .upload(selfiePath, selfieBytes, {
          contentType: "image/webp",
          upsert: false,
        });
      expect(selfieUploadError).toBeNull();

      const nonexistentSelfie = await pair.family
        .from("profile_verification_requests")
        .insert({
          profile_id: pair.familyId,
          selfie_path: `${pair.familyId}/missing-verification.webp`,
        });
      expect(nonexistentSelfie.error?.code).toBe("42501");

      const beforeInsert = Date.now();
      const { data: verificationRequest, error: verificationError } =
        await pair.family
          .from("profile_verification_requests")
          .insert({
            profile_id: pair.familyId,
            selfie_path: selfiePath,
            status: "verified",
            reviewer_note: "Forged reviewer decision",
            reviewed_at: "2000-01-01T00:00:00.000Z",
            reviewed_by: pair.auPairId,
            created_at: "2000-01-01T00:00:00.000Z",
          })
          .select(
            "id, status, reviewer_note, reviewed_at, reviewed_by, created_at",
          )
          .single();

      expect(verificationError).toBeNull();
      expect(verificationRequest?.status).toBe("pending");
      expect(verificationRequest?.reviewer_note).toBe("");
      expect(verificationRequest?.reviewed_at).toBeNull();
      expect(verificationRequest?.reviewed_by).toBeNull();
      expect(
        new Date(verificationRequest?.created_at ?? 0).getTime(),
      ).toBeGreaterThanOrEqual(beforeInsert - 1_000);

      const { error: verificationUpdateError } = await pair.family
        .from("profile_verification_requests")
        .update({ status: "verified" })
        .eq("id", verificationRequest?.id);

      expect(verificationUpdateError).not.toBeNull();

      const { data: report, error: reportError } = await pair.family
        .from("moderation_reports")
        .insert({
          reporter_id: pair.familyId,
          subject_type: "profile",
          subject_id: pair.auPairId,
          reported_profile_id: pair.auPairId,
          category: "spam_scam",
          reason: "Suspicious profile",
          details: "A direct client must not control review state.",
          status: "dismissed",
          admin_notes: "Forged admin note",
          reviewed_at: "2000-01-01T00:00:00.000Z",
          reviewed_by: pair.familyId,
          created_at: "2000-01-01T00:00:00.000Z",
        })
        .select("id, status, admin_notes, reviewed_at, reviewed_by, created_at")
        .single();

      expect(reportError).toBeNull();
      expect(report?.status).toBe("open");
      expect(report?.admin_notes).toBe("");
      expect(report?.reviewed_at).toBeNull();
      expect(report?.reviewed_by).toBeNull();
      expect(new Date(report?.created_at ?? 0).getTime()).toBeGreaterThanOrEqual(
        beforeInsert - 1_000,
      );

      const { data: reportUpdateRows, error: reportUpdateError } =
        await pair.family
        .from("moderation_reports")
        .update({ status: "reviewed" })
        .eq("id", report?.id)
        .select("id");

      expect(reportUpdateError).toBeNull();
      expect(reportUpdateRows).toEqual([]);

      const { data: unchangedReport } = await pair.family
        .from("moderation_reports")
        .select("status")
        .eq("id", report?.id)
        .single();

      expect(unchangedReport?.status).toBe("open");

      const { error: mismatchedSubjectError } = await pair.family
        .from("moderation_reports")
        .insert({
          reporter_id: pair.familyId,
          subject_type: "profile",
          subject_id: pair.familyId,
          reported_profile_id: pair.auPairId,
          category: "other",
          reason: "Mismatched target",
        });

      expect(mismatchedSubjectError).not.toBeNull();
    } finally {
      await pair.admin.storage
        .from("verification-selfies")
        .remove([selfiePath]);
      await removePair(pair);
    }
  });

  test("server-stamps stories as immediately active while preserving access controls", async () => {
    const pair = await createPair();
    const storyPath = `${pair.familyId}/launch-story-${pair.suffix}.webp`;

    try {
      const [profileEligibility, storiesEnabled, uploadsEnabled] =
        await Promise.all([
          pair.family.rpc("public_profile_is_eligible", {
            p_profile_id: pair.familyId,
            p_require_photo: true,
          }),
          pair.family.rpc("database_feature_flag_enabled", {
            p_key: "stories",
          }),
          pair.family.rpc("database_feature_flag_enabled", {
            p_key: "uploads",
          }),
        ]);
      const [{ data: eligibilityProfile }, { count: eligibilityPhotoCount }] =
        await Promise.all([
          pair.admin
            .from("profiles")
            .select(
              "onboarding_completed, public_slug, suspended_at, deletion_requested_at, deletion_scheduled_at, content_moderation_status, is_admin",
            )
            .eq("id", pair.familyId)
            .single(),
          pair.admin
            .from("profile_photos")
            .select("id", { count: "exact", head: true })
            .eq("profile_id", pair.familyId),
        ]);

      expect(profileEligibility.error).toBeNull();
      expect({
        eligibility: profileEligibility.data,
        photoCount: eligibilityPhotoCount,
        profile: eligibilityProfile,
      }).toMatchObject({
        eligibility: true,
        photoCount: 1,
        profile: {
          content_moderation_status: "approved",
          deletion_requested_at: null,
          deletion_scheduled_at: null,
          is_admin: false,
          onboarding_completed: true,
          suspended_at: null,
        },
      });
      expect(storiesEnabled.data).toBe(true);
      expect(uploadsEnabled.data).toBe(true);

      const { data: storyQuotaReserved, error: storyQuotaError } =
        await pair.family.rpc("reserve_storage_upload_quota", {
          p_bucket_id: "profile-stories",
          p_object_name: storyPath,
          p_size_bytes: 8,
        });
      const { error: storyUploadError } = await pair.family.storage
        .from("profile-stories")
        .upload(storyPath, new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]), {
          contentType: "image/webp",
        });

      expect(storyQuotaError).toBeNull();
      expect(storyQuotaReserved).toBe(true);
      expect(storyUploadError).toBeNull();

      const insertedAt = Date.now();
      const { data: story, error: storyError } = await pair.family
        .from("profile_stories")
        .insert({
          profile_id: pair.familyId,
          storage_path: storyPath,
          created_at: "2000-01-01T00:00:00.000Z",
          expires_at: "2099-01-01T00:00:00.000Z",
          content_moderation_status: "approved",
        })
        .select(
          "id, created_at, expires_at, content_moderation_status, content_moderation_reviewed_at",
        )
        .single();

      expect(storyError).toBeNull();
      expect(story?.content_moderation_status).toBe("approved");
      expect(story?.content_moderation_reviewed_at).toBeNull();
      expect(new Date(story?.created_at ?? 0).getTime()).toBeGreaterThanOrEqual(
        insertedAt - 1_000,
      );
      expect(
        new Date(story?.expires_at ?? 0).getTime() -
          new Date(story?.created_at ?? 0).getTime(),
      ).toBe(24 * 60 * 60 * 1_000);

      const { data: hiddenStory, error: hiddenStoryError } =
        await pair.anonymous
          .from("profile_stories")
          .select("id")
          .eq("id", story?.id);

      expect(hiddenStoryError).not.toBeNull();
      expect(hiddenStory).toBeNull();

      const { data: ownerPublishedStory, error: ownerPublishedStoryError } =
        await pair.family.rpc("get_public_story", { p_story_id: story?.id });
      const { data: viewerPublishedStory, error: viewerPublishedStoryError } =
        await pair.auPair.rpc("get_public_story", { p_story_id: story?.id });
      const ownerDirectStorageImage = await pair.family.storage
        .from("profile-stories")
        .download(storyPath);

      expect(ownerPublishedStoryError).toBeNull();
      expect(ownerPublishedStory).toHaveLength(1);
      expect(viewerPublishedStoryError).toBeNull();
      expect(viewerPublishedStory).toHaveLength(1);
      expect(ownerDirectStorageImage.error).not.toBeNull();
      expect(ownerDirectStorageImage.data).toBeNull();

      const { data: lifecycleUpdateRows, error: lifecycleUpdateError } =
        await pair.family
        .from("profile_stories")
        .update({ expires_at: "2099-01-01T00:00:00.000Z" })
        .eq("id", story?.id)
        .select("id");

      expect(lifecycleUpdateError).toBeNull();
      expect(lifecycleUpdateRows).toEqual([]);

      const { data: unchangedStory } = await pair.family
        .from("profile_stories")
        .select("expires_at")
        .eq("id", story?.id)
        .single();

      expect(unchangedStory?.expires_at).toBe(story?.expires_at);

      const { error: approvalError } = await pair.admin
        .from("profile_stories")
        .update({
          content_moderation_status: "approved",
          content_moderation_reviewed_at: new Date().toISOString(),
        })
        .eq("id", story?.id);

      expect(approvalError).toBeNull();

      const { data: publicStory, error: publicStoryError } =
        await pair.anonymous
          .from("profile_stories")
          .select("id")
          .eq("id", story?.id);

      expect(publicStoryError).not.toBeNull();
      expect(publicStory).toBeNull();

      const legacyGuestCards = await pair.anonymous.rpc(
        "get_active_story_cards",
        { p_account_type: "family" },
      );
      const legacyAuthenticatedCards = await pair.auPair.rpc(
        "get_active_story_cards",
        { p_account_type: "family" },
      );
      const { data: guestCards, error: guestCardsError } = await pair.admin.rpc(
        "get_bounded_public_story_cards",
        { p_account_type: "family", p_viewer_id: null },
      );
      const { data: eligibleViewerCards, error: eligibleViewerCardsError } =
        await pair.admin.rpc("get_bounded_public_story_cards", {
          p_account_type: "family",
          p_viewer_id: pair.auPairId,
        });
      const { data: sameTypeCards, error: sameTypeCardsError } =
        await pair.admin.rpc("get_bounded_public_story_cards", {
          p_account_type: "family",
          p_viewer_id: pair.familyId,
        });
      const { error: anonymousStoryError } = await pair.anonymous.rpc(
        "get_public_story",
        { p_story_id: story?.id },
      );
      const { data: ownerStory, error: ownerStoryError } = await pair.family.rpc(
        "get_public_story",
        { p_story_id: story?.id },
      );
      const { data: eligibleViewerStory, error: eligibleViewerStoryError } =
        await pair.auPair.rpc("get_public_story", { p_story_id: story?.id });

      expect(legacyGuestCards.data).toBeNull();
      expect(legacyGuestCards.error?.message).toMatch(/permission denied/i);
      expect(legacyAuthenticatedCards.data).toBeNull();
      expect(legacyAuthenticatedCards.error?.message).toMatch(
        /permission denied/i,
      );
      expect(guestCardsError).toBeNull();
      expect(
        guestCards?.find((card) => card.id === story?.id)?.storage_path,
      ).toBeNull();
      expect(
        guestCards?.find((card) => card.id === story?.id)
          ?.primary_photo_path,
      ).toBe(`${pair.familyId}/launch-family-${pair.suffix}.webp`);
      expect(eligibleViewerCardsError).toBeNull();
      expect(
        eligibleViewerCards?.find((card) => card.id === story?.id)
          ?.storage_path,
      ).toBe(storyPath);
      expect(sameTypeCardsError).toBeNull();
      expect(sameTypeCards).toEqual([]);
      expect(anonymousStoryError).not.toBeNull();
      expect(ownerStoryError).toBeNull();
      expect(ownerStory).toHaveLength(1);
      expect(eligibleViewerStoryError).toBeNull();
      expect(eligibleViewerStory).toHaveLength(1);

      const { error: blockError } = await pair.admin.from("profile_blocks").insert({
        blocker_id: pair.auPairId,
        blocked_profile_id: pair.familyId,
      });
      expect(blockError).toBeNull();
      const { data: blockedViewerCards, error: blockedViewerCardsError } =
        await pair.admin.rpc("get_bounded_public_story_cards", {
          p_account_type: "family",
          p_viewer_id: pair.auPairId,
        });
      expect(blockedViewerCardsError).toBeNull();
      expect(blockedViewerCards).toEqual([]);
      await pair.admin
        .from("profile_blocks")
        .delete()
        .eq("blocker_id", pair.auPairId)
        .eq("blocked_profile_id", pair.familyId);

      await pair.admin
        .from("profiles")
        .update({ content_moderation_status: "rejected" })
        .eq("id", pair.auPairId);

      const { data: rejectedViewerStory, error: rejectedViewerStoryError } =
        await pair.auPair.rpc("get_public_story", { p_story_id: story?.id });
      const { data: rejectedViewerCards, error: rejectedViewerCardsError } =
        await pair.admin.rpc("get_bounded_public_story_cards", {
          p_account_type: "family",
          p_viewer_id: pair.auPairId,
        });

      expect(rejectedViewerStoryError).toBeNull();
      expect(rejectedViewerStory).toEqual([]);
      expect(rejectedViewerCardsError).toBeNull();
      expect(rejectedViewerCards).toEqual([]);

      await pair.admin
        .from("profiles")
        .update({ content_moderation_status: "approved" })
        .eq("id", pair.auPairId);

      await pair.admin
        .from("profiles")
        .update({ suspended_at: new Date().toISOString() })
        .eq("id", pair.auPairId);
      const { data: suspendedViewerCards, error: suspendedViewerCardsError } =
        await pair.admin.rpc("get_bounded_public_story_cards", {
          p_account_type: "family",
          p_viewer_id: pair.auPairId,
        });
      expect(suspendedViewerCardsError).toBeNull();
      expect(suspendedViewerCards).toEqual([]);
      await pair.admin
        .from("profiles")
        .update({ suspended_at: null })
        .eq("id", pair.auPairId);

      await pair.admin
        .from("feature_flags")
        .update({ enabled: false })
        .eq("key", "stories");

      const { data: disabledStories, error: disabledStoriesError } =
        await pair.anonymous
          .from("profile_stories")
          .select("id")
          .eq("id", story?.id);

      expect(disabledStoriesError).not.toBeNull();
      expect(disabledStories).toBeNull();

      const { data: disabledCards } = await pair.admin.rpc(
        "get_bounded_public_story_cards",
        { p_account_type: "family", p_viewer_id: null },
      );
      const { data: disabledOwnerStory } = await pair.family.rpc(
        "get_public_story",
        { p_story_id: story?.id },
      );

      expect(disabledCards).toEqual([]);
      expect(disabledOwnerStory).toEqual([]);
    } finally {
      await pair.admin
        .from("feature_flags")
        .update({ enabled: true })
        .eq("key", "stories");
      await pair.admin.storage.from("profile-stories").remove([storyPath]);
      await removePair(pair);
    }
  });

  test("server-stamps direct messages and enforces account and feature gates", async () => {
    const pair = await createPair();

    try {
      const { data: conversationId, error: conversationError } =
        await pair.family.rpc("create_or_get_conversation", {
          p_profile_id: pair.auPairId,
        });
      const conversation = conversationId ? { id: conversationId } : null;

      expect(conversationError).toBeNull();

      const { error: conversationRewriteError } = await pair.family
        .from("conversations")
        .update({ au_pair_id: randomUUID() })
        .eq("id", conversation?.id);
      const { error: directConversationInsertError } = await pair.family
        .from("conversations")
        .insert({ family_id: pair.familyId, au_pair_id: pair.auPairId });

      expect(conversationRewriteError).not.toBeNull();
      expect(directConversationInsertError).not.toBeNull();

      const beforeInsert = Date.now();
      const { data: message, error: messageError } = await pair.family
        .from("messages")
        .insert({
          conversation_id: conversation?.id,
          sender_id: pair.familyId,
          body: "Launch hardening timestamp test",
          created_at: "2000-01-01T00:00:00.000Z",
        })
        .select("id, created_at")
        .single();

      expect(messageError).toBeNull();
      expect(new Date(message?.created_at ?? 0).getTime()).toBeGreaterThanOrEqual(
        beforeInsert - 1_000,
      );

      const messageBroadcast = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Message broadcast was not received.")),
          5_000,
        );

        pair.family
          .channel(`conversation-messages:${conversation?.id}`, {
            config: { private: true },
          })
          .on("broadcast", { event: "changed" }, () => {
            clearTimeout(timeout);
            resolve();
          })
          .subscribe((status) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              clearTimeout(timeout);
              reject(new Error(`Message broadcast subscription ${status}.`));
            }
          });
      });

      await expect
        .poll(
          async () =>
            pair.family.getChannels().some(
              (channel) =>
                channel.topic ===
                  `realtime:conversation-messages:${conversation?.id}` &&
                channel.state === "joined",
            ),
          { timeout: 5_000 },
        )
        .toBe(true);

      const rpcMessageId = randomUUID();
      const { data: rpcSendResult, error: rpcSendError } =
        await pair.family.rpc("send_message_if_allowed", {
          p_message_id: rpcMessageId,
          p_conversation_id: conversation?.id,
          p_body: "Atomic message insert test",
          p_image_path: null,
          p_image_mime_type: null,
          p_video_path: null,
          p_video_mime_type: null,
          p_video_size_bytes: null,
          p_video_duration_seconds: null,
          p_audio_path: null,
          p_audio_mime_type: null,
          p_audio_size_bytes: null,
          p_audio_duration_seconds: null,
        });

      expect(rpcSendError).toBeNull();
      expect(rpcSendResult).toBe("sent");
      await messageBroadcast;

      const { data: duplicateSendResult, error: duplicateSendError } =
        await pair.family.rpc("send_message_if_allowed", {
          p_message_id: rpcMessageId,
          p_conversation_id: conversation?.id,
          p_body: "Atomic message insert test",
          p_image_path: null,
          p_image_mime_type: null,
          p_video_path: null,
          p_video_mime_type: null,
          p_video_size_bytes: null,
          p_video_duration_seconds: null,
          p_audio_path: null,
          p_audio_mime_type: null,
          p_audio_size_bytes: null,
          p_audio_duration_seconds: null,
        });

      expect(duplicateSendError).toBeNull();
      expect(duplicateSendResult).toBe("already_sent");
      await Promise.all(
        pair.family.getChannels().map((channel) =>
          pair.family.removeChannel(channel),
        ),
      );

      const { data: fingerprint, error: fingerprintError } =
        await pair.family.rpc("get_message_conversation_fingerprint", {
          p_conversation_id: conversation?.id,
          p_visibility_after: null,
        });

      expect(fingerprintError).toBeNull();
      expect(fingerprint?.[0]?.message_count).toBe(2);
      expect(fingerprint?.[0]?.latest_message_at).toBeTruthy();
      expect(fingerprint?.[0]?.is_blocked).toBe(false);

      const { error: directUpdateError } = await pair.family
        .from("messages")
        .update({ image_path: null })
        .eq("id", message?.id);
      const { error: directDeleteError } = await pair.family
        .from("messages")
        .delete()
        .eq("id", message?.id);

      expect(directUpdateError).not.toBeNull();
      expect(directDeleteError).not.toBeNull();

      const retainedImagePath = `${conversation?.id}/retained-launch.webp`;
      const { data: mediaMessage, error: mediaMessageError } = await pair.admin
        .from("messages")
        .insert({
          conversation_id: conversation?.id,
          sender_id: pair.familyId,
          body: "Keep this text",
          image_path: retainedImagePath,
          image_mime_type: "image/webp",
        })
        .select("id")
        .single();

      expect(mediaMessageError).toBeNull();

      const { data: conversationBeforeMediaDelete } = await pair.admin
        .from("conversations")
        .select("updated_at")
        .eq("id", conversation?.id)
        .single();

      const { data: mediaDeleted, error: mediaDeleteError } =
        await pair.family.rpc("delete_own_message_media", {
          p_conversation_id: conversation?.id,
          p_message_id: mediaMessage?.id,
        });
      const [
        { data: retainedMedia },
        { data: visibleMessage },
        { data: conversationAfterMediaDelete },
      ] =
        await Promise.all([
          pair.admin
            .from("retained_message_photos")
            .select("original_image_path")
            .eq("original_image_path", retainedImagePath)
            .maybeSingle(),
          pair.admin
            .from("messages")
            .select("body, image_path")
            .eq("id", mediaMessage?.id)
            .maybeSingle(),
          pair.admin
            .from("conversations")
            .select("updated_at")
            .eq("id", conversation?.id)
            .single(),
        ]);

      expect(mediaDeleteError).toBeNull();
      expect(mediaDeleted).toBe(true);
      expect(retainedMedia?.original_image_path).toBe(retainedImagePath);
      expect(visibleMessage).toMatchObject({
        body: "Keep this text",
        image_path: null,
      });
      expect(
        new Date(conversationAfterMediaDelete?.updated_at ?? 0).getTime(),
      ).toBeGreaterThan(
        new Date(conversationBeforeMediaDelete?.updated_at ?? 0).getTime(),
      );

      const { error: retainedReattachError } = await pair.family
        .from("messages")
        .insert({
          conversation_id: conversation?.id,
          sender_id: pair.familyId,
          body: "A retained object must stay unavailable",
          image_path: retainedImagePath,
          image_mime_type: "image/webp",
        });

      expect(retainedReattachError).not.toBeNull();

      await pair.admin
        .from("profiles")
        .update({
          content_moderation_status: "rejected",
          content_moderation_needs_review: false,
        })
        .eq("id", pair.auPairId);

      const reopenedDuringContentReview = await pair.family.rpc(
        "create_or_get_conversation",
        { p_profile_id: pair.auPairId },
      );

      const { error: backgroundReviewMessageError } = await pair.family
        .from("messages")
        .insert({
          conversation_id: conversation?.id,
          sender_id: pair.familyId,
          body: "Content moderation must not block this message",
        });
      const inboxDuringContentReview = await pair.family.rpc(
        "get_message_inbox_cards",
      );

      expect(reopenedDuringContentReview.error).toBeNull();
      expect(reopenedDuringContentReview.data).toBe(conversation?.id);
      expect(backgroundReviewMessageError).toBeNull();
      expect(inboxDuringContentReview.error).toBeNull();
      expect(
        inboxDuringContentReview.data?.some(
          (card) => card.conversation_id === conversation?.id,
        ),
      ).toBe(true);

      await pair.admin
        .from("profiles")
        .update({ content_moderation_status: "approved" })
        .eq("id", pair.auPairId);

      await pair.admin
        .from("feature_flags")
        .update({ enabled: false })
        .eq("key", "message_send");

      const { data: denialBefore } = await pair.admin
        .from("message_send_denial_counters")
        .select("denial_count")
        .eq("reason", "feature_disabled")
        .single();
      const disabledEligibility = await pair.family.rpc(
        "get_message_send_eligibility",
        { p_conversation_id: conversation?.id },
      );
      const { data: denialAfter } = await pair.admin
        .from("message_send_denial_counters")
        .select("denial_count")
        .eq("reason", "feature_disabled")
        .single();

      expect(disabledEligibility.error).toBeNull();
      expect(disabledEligibility.data).toBe("feature_disabled");
      expect(Number(denialAfter?.denial_count ?? 0)).toBe(
        Number(denialBefore?.denial_count ?? 0) + 1,
      );

      const { error: disabledError } = await pair.family.from("messages").insert({
        conversation_id: conversation?.id,
        sender_id: pair.familyId,
        body: "This must be blocked by the database feature flag",
      });

      expect(disabledError).not.toBeNull();

      await pair.admin
        .from("feature_flags")
        .update({ enabled: true })
        .eq("key", "message_send");
      await pair.admin
        .from("profiles")
        .update({ suspended_at: new Date().toISOString() })
        .eq("id", pair.auPairId);

      const { error: suspensionError } = await pair.family
        .from("messages")
        .insert({
          conversation_id: conversation?.id,
          sender_id: pair.familyId,
          body: "This must be blocked for a suspended participant",
        });

      expect(suspensionError).not.toBeNull();
    } finally {
      await pair.admin
        .from("retained_message_photos")
        .delete()
        .eq("sender_id", pair.familyId);
      await pair.admin
        .from("feature_flags")
        .update({ enabled: true })
        .eq("key", "message_send");
      await removePair(pair);
    }
  });

  test("claims one admin email only when a profile first becomes public", async () => {
    const pair = await createPair();

    try {
      const firstClaim = await pair.admin.rpc(
        "claim_admin_profile_publication_notification",
        { p_profile_id: pair.familyId },
      );
      expect(firstClaim.error).toBeNull();
      expect(firstClaim.data).toMatch(UUID_PATTERN);

      const duplicateActiveClaim = await pair.admin.rpc(
        "claim_admin_profile_publication_notification",
        { p_profile_id: pair.familyId },
      );
      expect(duplicateActiveClaim).toMatchObject({ data: null, error: null });

      const release = await pair.admin.rpc(
        "release_admin_profile_publication_notification",
        {
          p_claim_token: firstClaim.data,
          p_profile_id: pair.familyId,
        },
      );
      expect(release).toMatchObject({ data: true, error: null });

      const retryClaim = await pair.admin.rpc(
        "claim_admin_profile_publication_notification",
        { p_profile_id: pair.familyId },
      );
      expect(retryClaim.error).toBeNull();
      expect(retryClaim.data).toMatch(UUID_PATTERN);

      const complete = await pair.admin.rpc(
        "complete_admin_profile_publication_notification",
        {
          p_claim_token: retryClaim.data,
          p_profile_id: pair.familyId,
          p_sent_at: new Date().toISOString(),
        },
      );
      expect(complete).toMatchObject({ data: true, error: null });

      const { error: editError } = await pair.admin
        .from("profiles")
        .update({ bio: "An edit after the one-time publication email." })
        .eq("id", pair.familyId);
      expect(editError).toBeNull();

      const claimAfterEdit = await pair.admin.rpc(
        "claim_admin_profile_publication_notification",
        { p_profile_id: pair.familyId },
      );
      expect(claimAfterEdit).toMatchObject({ data: null, error: null });
    } finally {
      await removePair(pair);
    }
  });

  test("bounds autocomplete and makes favorite notifications cooldown-safe", async () => {
    const pair = await createPair();

    try {
      const { data: shortSuggestions, error: shortError } = await pair.family.rpc(
        "get_message_profile_suggestions",
        { p_limit: 100, p_query: "Q" },
      );
      const { data: longSuggestions, error: longError } = await pair.family.rpc(
        "get_message_profile_suggestions",
        { p_limit: 100, p_query: "x".repeat(65) },
      );
      const { data: matchingSuggestions, error: matchingError } =
        await pair.family.rpc("get_message_profile_suggestions", {
          p_limit: 100,
          p_query: "QA AuPair",
        });

      expect(shortError).toBeNull();
      expect(longError).toBeNull();
      expect(matchingError).toBeNull();
      expect(shortSuggestions).toEqual([]);
      expect(longSuggestions).toEqual([]);
      expect(matchingSuggestions).toHaveLength(1);
      expect(matchingSuggestions?.[0]?.id).toBe(pair.auPairId);

      const { data: saved, error: saveError } = await pair.family.rpc(
        "toggle_profile_favorite",
        { p_profile_id: pair.auPairId },
      );
      const legacyFavoriteClaim = await pair.family.rpc(
        "claim_profile_favorite_notification",
        { p_profile_id: pair.auPairId },
      );
      const firstFavoriteClaim = await pair.admin.rpc(
        "claim_profile_favorite_notification_delivery",
        {
          p_actor_id: pair.familyId,
          p_recipient_id: pair.auPairId,
        },
      );
      const concurrentFavoriteClaim = await pair.admin.rpc(
        "claim_profile_favorite_notification_delivery",
        {
          p_actor_id: pair.familyId,
          p_recipient_id: pair.auPairId,
        },
      );

      expect(saveError).toBeNull();
      expect(saved).toBe(true);

      const visibleSavedProfiles = await pair.family.rpc(
        "get_saved_public_profiles",
        { p_limit: 100, p_offset: 500 },
      );
      expect(visibleSavedProfiles.error).toBeNull();
      expect(visibleSavedProfiles.data).toMatchObject({
        total: 1,
        limit: 50,
        offset: 0,
      });
      expect(
        (
          visibleSavedProfiles.data as {
            items?: Array<{ profile?: { id?: string } }>;
          }
        )?.items,
      ).toHaveLength(1);
      expect(
        (
          visibleSavedProfiles.data as {
            items?: Array<{ profile?: { id?: string } }>;
          }
        )?.items?.[0]?.profile?.id,
      ).toBe(pair.auPairId);

      await pair.admin
        .from("profiles")
        .update({ suspended_at: new Date().toISOString() })
        .eq("id", pair.auPairId);
      const hiddenSavedProfiles = await pair.family.rpc(
        "get_saved_public_profiles",
        { p_limit: 12, p_offset: 0 },
      );
      expect(hiddenSavedProfiles.error).toBeNull();
      expect(hiddenSavedProfiles.data).toMatchObject({
        items: [],
        total: 0,
        limit: 12,
        offset: 0,
      });
      await pair.admin
        .from("profiles")
        .update({ suspended_at: null })
        .eq("id", pair.auPairId);

      expect(legacyFavoriteClaim.error).not.toBeNull();
      expect(firstFavoriteClaim.error).toBeNull();
      expect(firstFavoriteClaim.data).toHaveLength(1);
      expect(concurrentFavoriteClaim.error).toBeNull();
      expect(concurrentFavoriteClaim.data).toEqual([]);

      const favoriteDeliveryId = firstFavoriteClaim.data?.[0]?.delivery_id;
      const favoriteClaimToken = firstFavoriteClaim.data?.[0]?.claim_token;
      expect(favoriteDeliveryId).toBeTruthy();
      expect(favoriteClaimToken).toBeTruthy();

      const releasedFavoriteClaim = await pair.admin.rpc(
        "release_profile_favorite_notification_delivery",
        {
          p_actor_id: pair.familyId,
          p_claim_token: favoriteClaimToken,
          p_recipient_id: pair.auPairId,
        },
      );
      const retriedFavoriteClaim = await pair.admin.rpc(
        "claim_profile_favorite_notification_delivery",
        {
          p_actor_id: pair.familyId,
          p_recipient_id: pair.auPairId,
        },
      );

      expect(releasedFavoriteClaim.error).toBeNull();
      expect(releasedFavoriteClaim.data).toBe(true);
      expect(retriedFavoriteClaim.error).toBeNull();
      expect(retriedFavoriteClaim.data).toHaveLength(1);
      expect(retriedFavoriteClaim.data?.[0]?.delivery_id).toBe(
        favoriteDeliveryId,
      );
      expect(retriedFavoriteClaim.data?.[0]?.claim_token).not.toBe(
        favoriteClaimToken,
      );

      const completedFavoriteClaim = await pair.admin.rpc(
        "complete_profile_favorite_notification_delivery",
        {
          p_actor_id: pair.familyId,
          p_claim_token: retriedFavoriteClaim.data?.[0]?.claim_token,
          p_recipient_id: pair.auPairId,
        },
      );

      expect(completedFavoriteClaim.error).toBeNull();
      expect(completedFavoriteClaim.data).toBe(true);

      expect(
        (
          await pair.family.rpc("toggle_profile_favorite", {
            p_profile_id: pair.auPairId,
          })
        ).data,
      ).toBe(false);
      expect(
        (
          await pair.family.rpc("toggle_profile_favorite", {
            p_profile_id: pair.auPairId,
          })
        ).data,
      ).toBe(true);
      expect(
        (
          await pair.admin.rpc(
            "claim_profile_favorite_notification_delivery",
            {
              p_actor_id: pair.familyId,
              p_recipient_id: pair.auPairId,
            },
          )
        ).data,
      ).toEqual([]);

      const { data: conversationId, error: conversationError } =
        await pair.family.rpc("create_or_get_conversation", {
          p_profile_id: pair.auPairId,
        });
      const conversation = conversationId ? { id: conversationId } : null;

      expect(conversationError).toBeNull();
      expect(conversation?.id).toBeTruthy();

      const firstMessageId = randomUUID();
      const { error: messageError } = await pair.family.from("messages").insert({
        id: firstMessageId,
        conversation_id: conversation?.id,
        sender_id: pair.familyId,
        body: "Lease protected notification",
      });

      expect(messageError).toBeNull();

      const legacyMessageClaim = await pair.family.rpc(
        "claim_new_message_notification",
        {
          p_conversation_id: conversation?.id,
          p_message_id: firstMessageId,
        },
      );
      const firstMessageClaim = await pair.admin.rpc(
        "claim_new_message_notification_delivery",
        {
          p_conversation_id: conversation?.id,
          p_message_id: firstMessageId,
          p_sender_id: pair.familyId,
        },
      );
      const concurrentMessageClaim = await pair.admin.rpc(
        "claim_new_message_notification_delivery",
        {
          p_conversation_id: conversation?.id,
          p_message_id: firstMessageId,
          p_sender_id: pair.familyId,
        },
      );

      expect(legacyMessageClaim.error).not.toBeNull();
      expect(firstMessageClaim.error).toBeNull();
      expect(firstMessageClaim.data).toHaveLength(1);
      expect(concurrentMessageClaim.error).toBeNull();
      expect(concurrentMessageClaim.data).toEqual([]);

      const messageDeliveryId = firstMessageClaim.data?.[0]?.delivery_id;
      const messageClaimToken = firstMessageClaim.data?.[0]?.claim_token;
      const releasedMessageClaim = await pair.admin.rpc(
        "release_new_message_notification_delivery",
        {
          p_claim_token: messageClaimToken,
          p_conversation_id: conversation?.id,
          p_sender_id: pair.familyId,
        },
      );
      const retriedMessageClaim = await pair.admin.rpc(
        "claim_new_message_notification_delivery",
        {
          p_conversation_id: conversation?.id,
          p_message_id: firstMessageId,
          p_sender_id: pair.familyId,
        },
      );

      expect(releasedMessageClaim.error).toBeNull();
      expect(releasedMessageClaim.data).toBe(true);
      expect(retriedMessageClaim.error).toBeNull();
      expect(retriedMessageClaim.data).toHaveLength(1);
      expect(retriedMessageClaim.data?.[0]?.delivery_id).toBe(
        messageDeliveryId,
      );
      expect(retriedMessageClaim.data?.[0]?.claim_token).not.toBe(
        messageClaimToken,
      );

      const completedMessageClaim = await pair.admin.rpc(
        "complete_new_message_notification_delivery",
        {
          p_claim_token: retriedMessageClaim.data?.[0]?.claim_token,
          p_conversation_id: conversation?.id,
          p_sender_id: pair.familyId,
        },
      );

      expect(completedMessageClaim.error).toBeNull();
      expect(completedMessageClaim.data).toBe(true);
      expect(
        (
          await pair.admin.rpc(
            "claim_new_message_notification_delivery",
            {
              p_conversation_id: conversation?.id,
              p_message_id: firstMessageId,
              p_sender_id: pair.familyId,
            },
          )
        ).data,
      ).toEqual([]);

      const { data: blockResult, error: blockError } = await pair.family.rpc(
        "block_profile",
        { p_blocked_profile_id: pair.auPairId },
      );

      expect(blockError).toBeNull();
      expect(blockResult?.ok).toBe(true);

      const { data: blockedSuggestions, error: blockedSuggestionsError } =
        await pair.family.rpc("get_message_profile_suggestions", {
          p_query: "QA AuPair",
          p_limit: 12,
        });

      expect(blockedSuggestionsError).toBeNull();
      expect(blockedSuggestions).toEqual([]);

      const { data: unsavedAfterBlock, error: unsaveError } =
        await pair.family.rpc("toggle_profile_favorite", {
          p_profile_id: pair.auPairId,
        });

      expect(unsaveError).toBeNull();
      expect(unsavedAfterBlock).toBe(false);

      const { error: blockedSaveError } = await pair.family.rpc(
        "toggle_profile_favorite",
        { p_profile_id: pair.auPairId },
      );

      expect(blockedSaveError).not.toBeNull();
    } finally {
      await removePair(pair);
    }
  });

  test("normalizes profile search and saturates its direct-RPC rate counter", async () => {
    const pair = await createPair();

    try {
      const second = new Date().getSeconds();
      // Keep enough headroom for the RPC burst below so the assertion cannot
      // straddle two database minute buckets on a slower CI runner.
      if (second >= 40) {
        await new Promise((resolve) =>
          setTimeout(resolve, (62 - second) * 1_000),
        );
      }

      const { error: cityUpdateError } = await pair.admin
        .from("profiles")
        .update({ city: "München" })
        .eq("id", pair.auPairId);

      expect(cityUpdateError).toBeNull();

      const [multiTerm, accentTerm, wildcard] = await Promise.all([
        pair.family.rpc("search_profile_cards", {
          p_limit: 20,
          p_query: "QA Munchen",
        }),
        pair.family.rpc("search_profile_cards", {
          p_limit: 20,
          p_query: "Munchen",
        }),
        pair.family.rpc("search_profile_cards", {
          p_limit: 20,
          p_query: "%%__--",
        }),
      ]);

      expect(multiTerm.error).toBeNull();
      expect(accentTerm.error).toBeNull();
      expect(wildcard.error).toBeNull();
      expect(multiTerm.data?.map((profile) => profile.id)).toContain(pair.auPairId);
      expect(accentTerm.data?.map((profile) => profile.id)).toContain(pair.auPairId);
      expect(wildcard.data).toEqual([]);

      const { data: searchCounter, error: searchCounterError } = await pair.admin
        .from("profile_search_rate_counters")
        .select("request_count")
        .eq("profile_id", pair.familyId)
        .order("window_started_at", { ascending: false })
        .limit(1)
        .single();

      expect(searchCounterError).toBeNull();
      expect(searchCounter?.request_count).toBeGreaterThanOrEqual(2);

      const { error: resetCounterError } = await pair.admin
        .from("profile_search_rate_counters")
        .delete()
        .eq("profile_id", pair.familyId);

      expect(resetCounterError).toBeNull();

      const firstReservation = await pair.family.rpc(
        "reserve_profile_search_request",
        { p_limit_per_minute: 2 },
      );
      const secondReservation = await pair.family.rpc(
        "reserve_profile_search_request",
        { p_limit_per_minute: 2 },
      );

      expect(firstReservation.error).toBeNull();
      expect(firstReservation.data).toBe(true);
      expect(secondReservation.error).toBeNull();
      expect(secondReservation.data).toBe(true);

      const rejectedCalls = await Promise.all(
        Array.from({ length: 10 }, () =>
          pair.family.rpc("reserve_profile_search_request", {
            p_limit_per_minute: 2,
          }),
        ),
      );

      expect(rejectedCalls.every(({ error }) => error === null)).toBe(true);
      expect(rejectedCalls.every(({ data }) => data === false)).toBe(true);

      const { data: counter, error: counterError } = await pair.admin
        .from("profile_search_rate_counters")
        .select("request_count")
        .eq("profile_id", pair.familyId)
        .order("window_started_at", { ascending: false })
        .limit(1)
        .single();

      expect(counterError).toBeNull();
      expect(counter?.request_count).toBe(2);
    } finally {
      await removePair(pair);
    }
  });

  test("enforces fixed upload quotas and immutable referenced media", async ({
    request,
  }) => {
    const pair = await createPair();
    const storagePath =
      pair.familyId + "/quota-" + pair.suffix + ".webp";
    const extraPaths = Array.from(
      { length: 5 },
      (_, index) =>
        pair.familyId + "/quota-" + pair.suffix + "-" + index + ".webp",
    );
    try {
      const forgedReservation = await pair.family.rpc(
        "reserve_storage_upload_quota",
        {
          p_bucket_id: "profile-photos",
          p_object_name: storagePath,
          p_size_bytes: 1,
        },
      );
      const resizedReservation = await pair.family.rpc(
        "reserve_storage_upload_quota",
        {
          p_bucket_id: "profile-photos",
          p_object_name: storagePath,
          p_size_bytes: 5 * 1024 * 1024,
        },
      );

      expect(forgedReservation.error).toBeNull();
      expect(forgedReservation.data).toBe(true);
      expect(resizedReservation.error).toBeNull();
      expect(resizedReservation.data).toBe(true);

      const { data: resizedLedger } = await pair.admin
        .from("storage_upload_usage_events")
        .select("size_bytes")
        .eq("bucket_id", "profile-photos")
        .eq("object_name", storagePath)
        .single();

      expect(Number(resizedLedger?.size_bytes)).toBe(5 * 1024 * 1024);

      const liveCapReservations = [];
      for (const objectName of extraPaths) {
        liveCapReservations.push(
          await pair.family.rpc("reserve_storage_upload_quota", {
            p_bucket_id: "profile-photos",
            p_object_name: objectName,
            p_size_bytes: 1,
          }),
        );
      }

      expect(
        liveCapReservations.slice(0, 4).every(({ data }) => data === true),
      ).toBe(true);
      expect(liveCapReservations[4]?.data).toBe(false);

      const bytes = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]);
      const { error: uploadError } = await pair.family.storage
        .from("profile-photos")
        .upload(storagePath, bytes, {
          contentType: "image/webp",
          upsert: false,
        });

      expect(uploadError).toBeNull();

      const { error: photoRowError } = await pair.admin
        .from("profile_photos")
        .insert({
          profile_id: pair.familyId,
          storage_path: storagePath,
          is_primary: false,
        });

      expect(photoRowError).toBeNull();

      const directDownload = await pair.anonymous.storage
        .from("profile-photos")
        .download(storagePath);
      const ownerDownload = await pair.family.storage
        .from("profile-photos")
        .download(storagePath);
      const overwrite = await pair.family.storage
        .from("profile-photos")
        .update(storagePath, bytes, { contentType: "image/webp" });
      const referencedDelete = await pair.family.storage
        .from("profile-photos")
        .remove([storagePath]);
      const downloadAfterReferencedDelete = await pair.admin.storage
        .from("profile-photos")
        .download(storagePath);

      expect(directDownload.error).not.toBeNull();
      expect(ownerDownload.error).not.toBeNull();
      expect(overwrite.error).not.toBeNull();
      // Storage DELETE is intentionally non-enumerating and can return success
      // when RLS matched zero rows; the durable assertion is that the referenced
      // object remains available to the counted server-side delivery path.
      expect(referencedDelete.error).toBeNull();
      expect(downloadAfterReferencedDelete.error).toBeNull();

      const referencedClaim = await pair.admin.rpc(
        "claim_orphan_media_deletion",
        {
          p_bucket_id: "profile-photos",
          p_storage_path: storagePath,
          p_uploader_id: pair.familyId,
        },
      );
      const forbiddenUserClaim = await pair.family.rpc(
        "claim_orphan_media_deletion",
        {
          p_bucket_id: "profile-photos",
          p_storage_path: storagePath,
          p_uploader_id: pair.familyId,
        },
      );

      expect(referencedClaim.error).toBeNull();
      expect(referencedClaim.data).toBeNull();
      expect(forbiddenUserClaim.error).not.toBeNull();

      await pair.admin
        .from("profile_media_delivery_counters")
        .update({
          byte_count: 0,
          request_count: 0,
          window_started_at: "2000-01-01T00:00:00.000Z",
        })
        .neq("identity_hash", "qa-never-matches");

      const missingProxyResponse = await request.get(
        `/api/media/profile-photo/${pair.familyId}/missing.webp`,
        { maxRedirects: 0 },
      );
      const { count: counterCountAfterMissing } = await pair.admin
        .from("profile_media_delivery_counters")
        .select("scope", { count: "exact", head: true })
        .gt("request_count", 0);

      expect(missingProxyResponse.status()).toBe(404);
      expect(counterCountAfterMissing).toBe(0);

      const proxyResponse = await request.get(
        "/api/media/profile-photo/" + storagePath,
        { maxRedirects: 0 },
      );
      expect(proxyResponse.status()).toBe(200);
      expect(proxyResponse.headers()["content-type"]).toContain("image/");
      expect(proxyResponse.headers()["location"]).toBeUndefined();
      expect(proxyResponse.headers()["cross-origin-resource-policy"]).toBe(
        "same-site",
      );
      expect(proxyResponse.headers()["cache-control"]).toContain("max-age=300");
      expect(proxyResponse.headers()["cache-control"]).toContain(
        "must-revalidate",
      );
      expect(proxyResponse.headers()["x-robots-tag"]).toBe(
        "noindex, noimageindex",
      );
      const proxyEtag = proxyResponse.headers().etag;
      expect(proxyEtag).toMatch(/^W\/"pa-v1-/);

      const unchangedProxyResponse = await request.get(
        "/api/media/profile-photo/" + storagePath,
        {
          headers: { "If-None-Match": proxyEtag },
          maxRedirects: 0,
        },
      );
      expect(unchangedProxyResponse.status()).toBe(304);
      expect(unchangedProxyResponse.headers().etag).toBe(proxyEtag);

      const malformedRangeResponse = await request.get(
        "/api/media/profile-photo/" + storagePath,
        {
          headers: { Range: "bytes=0-1,3-4" },
          maxRedirects: 0,
        },
      );
      expect(malformedRangeResponse.status()).toBe(416);
      expect(malformedRangeResponse.headers()["content-range"]).toBeUndefined();

      const transformedRangeResponse = await request.get(
        "/api/media/profile-photo/" + storagePath + "?width=96",
        {
          headers: { Range: "bytes=0-1" },
          maxRedirects: 0,
        },
      );
      expect(transformedRangeResponse.status()).toBe(416);

      const headProxyResponse = await request.head(
        "/api/media/profile-photo/" + storagePath,
        { maxRedirects: 0 },
      );
      expect(headProxyResponse.status()).toBe(405);
      expect(headProxyResponse.headers().allow).toBe("GET");

      const { data: mediaCounter, error: mediaCounterError } = await pair.admin
        .from("profile_media_delivery_counters")
        .select("identity_hash, window_started_at")
        .eq("scope", "ip_10m")
        .gt("request_count", 0)
        .order("window_started_at", { ascending: false })
        .limit(1)
        .single();

      expect(mediaCounterError).toBeNull();
      expect(mediaCounter?.identity_hash).toMatch(/^s\d{4}$/);

      const { data: globalMediaCounter, error: globalMediaCounterError } =
        await pair.admin
          .from("profile_media_delivery_counters")
          .select("identity_hash, request_count")
          .eq("scope", "global_hour")
          .gt("request_count", 0)
          .single();
      expect(globalMediaCounterError).toBeNull();
      expect(globalMediaCounter?.identity_hash).toMatch(/^s\d{4}$/);
      expect(globalMediaCounter?.identity_hash).not.toBe("all");

      const { error: saturateMediaCounterError } = await pair.admin
        .from("profile_media_delivery_counters")
        .update({ request_count: 2000 })
        .eq("scope", "ip_10m")
        .eq("identity_hash", mediaCounter?.identity_hash)
        .eq("window_started_at", mediaCounter?.window_started_at);

      expect(saturateMediaCounterError).toBeNull();

      const limitedProxyResponse = await request.get(
        "/api/media/profile-photo/" + storagePath,
        { maxRedirects: 0 },
      );
      expect(limitedProxyResponse.status()).toBe(429);
      expect(Number(limitedProxyResponse.headers()["retry-after"])).toBeGreaterThan(
        0,
      );

      const optimizerBypassResponse = await request.get(
        `/_next/image?url=${encodeURIComponent(
          "/api/media/profile-photo/" + storagePath,
        )}&w=640&q=75`,
      );
      expect(optimizerBypassResponse.status()).toBe(400);

      const { error: photoDeleteError } = await pair.admin
        .from("profile_photos")
        .delete()
        .eq("storage_path", storagePath);
      expect(photoDeleteError).toBeNull();

      const { data: queuedLedger, error: queuedLedgerError } = await pair.admin
        .from("storage_upload_usage_events")
        .select("deletion_claim_token, deletion_claimed_at, deleted_at")
        .eq("bucket_id", "profile-photos")
        .eq("object_name", storagePath)
        .single();
      expect(queuedLedgerError).toBeNull();
      expect(typeof queuedLedger?.deletion_claim_token).toBe("string");
      expect(queuedLedger?.deleted_at).toBeNull();
      expect(
        new Date(String(queuedLedger?.deletion_claimed_at)).getTime(),
      ).toBeLessThan(Date.now() - 5 * 60 * 1000);

      const directOrphanDelete = await pair.family.storage
        .from("profile-photos")
        .remove([storagePath]);
      const downloadAfterDirectDelete = await pair.admin.storage
        .from("profile-photos")
        .download(storagePath);
      expect(directOrphanDelete.error).toBeNull();
      expect(downloadAfterDirectDelete.error).toBeNull();

      const wrongOwnerClaim = await pair.admin.rpc(
        "claim_orphan_media_deletion",
        {
          p_bucket_id: "profile-photos",
          p_storage_path: storagePath,
          p_uploader_id: pair.auPairId,
        },
      );
      const orphanClaim = await pair.admin.rpc("claim_orphan_media_deletion", {
        p_bucket_id: "profile-photos",
        p_storage_path: storagePath,
        p_uploader_id: pair.familyId,
      });
      const duplicateClaim = await pair.admin.rpc(
        "claim_orphan_media_deletion",
        {
          p_bucket_id: "profile-photos",
          p_storage_path: storagePath,
          p_uploader_id: pair.familyId,
        },
      );

      expect(wrongOwnerClaim.error).toBeNull();
      expect(wrongOwnerClaim.data).toBeNull();
      expect(orphanClaim.error).toBeNull();
      expect(typeof orphanClaim.data).toBe("string");
      expect(duplicateClaim.error).toBeNull();
      expect(duplicateClaim.data).toBeNull();

      const wrongCompletion = await pair.admin.rpc(
        "complete_orphan_media_deletion",
        {
          p_bucket_id: "profile-photos",
          p_storage_path: storagePath,
          p_uploader_id: pair.familyId,
          p_claim_token: randomUUID(),
          p_succeeded: true,
        },
      );
      expect(wrongCompletion.error).toBeNull();
      expect(wrongCompletion.data).toBe(false);

      const reattachClaimedMedia = await pair.admin
        .from("profile_photos")
        .insert({
          profile_id: pair.familyId,
          storage_path: storagePath,
          is_primary: false,
        });
      expect(reattachClaimedMedia.error?.code).toBe("42501");

      const claimedStorageDelete = await pair.admin.storage
        .from("profile-photos")
        .remove([storagePath]);
      expect(claimedStorageDelete.error).toBeNull();

      const completedClaim = await pair.admin.rpc(
        "complete_orphan_media_deletion",
        {
          p_bucket_id: "profile-photos",
          p_storage_path: storagePath,
          p_uploader_id: pair.familyId,
          p_claim_token: orphanClaim.data,
          p_succeeded: true,
        },
      );
      expect(completedClaim.error).toBeNull();
      expect(completedClaim.data).toBe(true);

      const downloadAfterClaimedDelete = await pair.admin.storage
        .from("profile-photos")
        .download(storagePath);
      expect(downloadAfterClaimedDelete.error).not.toBeNull();

      const { data: deletedLedger } = await pair.admin
        .from("storage_upload_usage_events")
        .select("deleted_at, deletion_claim_token, deletion_claimed_at")
        .eq("bucket_id", "profile-photos")
        .eq("object_name", storagePath)
        .single();
      expect(deletedLedger?.deleted_at).not.toBeNull();
      expect(deletedLedger?.deletion_claim_token).toBeNull();
      expect(deletedLedger?.deletion_claimed_at).toBeNull();
    } finally {
      await pair.admin
        .from("profile_media_delivery_counters")
        .update({
          byte_count: 0,
          request_count: 0,
          window_started_at: "2000-01-01T00:00:00.000Z",
        })
        .neq("identity_hash", "qa-never-matches");
      await pair.admin.storage
        .from("profile-photos")
        .remove([storagePath, ...extraPaths]);
      await removePair(pair);
    }
  });

  test("sweeps stale orphan uploads without touching referenced media", async () => {
    const pair = await createPair();
    const referencedPath =
      `${pair.familyId}/referenced-sweep-${pair.suffix}.webp`;
    const orphanPath = `${pair.familyId}/orphan-sweep-${pair.suffix}.webp`;
    const paths = [referencedPath, orphanPath];

    try {
      const bytes = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]);

      for (const storagePath of paths) {
        const reservation = await pair.family.rpc(
          "reserve_storage_upload_quota",
          {
            p_bucket_id: "profile-photos",
            p_object_name: storagePath,
            p_size_bytes: bytes.byteLength,
          },
        );
        expect(reservation.error).toBeNull();
        expect(reservation.data).toBe(true);

        const { error: uploadError } = await pair.family.storage
          .from("profile-photos")
          .upload(storagePath, bytes, {
            contentType: "image/webp",
            upsert: false,
          });
        expect(uploadError).toBeNull();
      }

      const { error: referenceError } = await pair.admin
        .from("profile_photos")
        .insert({
          profile_id: pair.familyId,
          storage_path: referencedPath,
          is_primary: false,
        });
      expect(referenceError).toBeNull();

      const staleCommittedAt = new Date(
        Date.now() - 2 * 60 * 60 * 1_000,
      ).toISOString();
      const { error: ageLedgerError } = await pair.admin
        .from("storage_upload_usage_events")
        .update({ committed_at: staleCommittedAt, orphan_checked_at: null })
        .eq("bucket_id", "profile-photos")
        .in("object_name", paths);
      expect(ageLedgerError).toBeNull();

      const result = await cleanupOrphanedMedia({
        supabase: pair.admin,
        batchSize: 50,
        now: new Date(),
      });
      expect(result.scannedUploads).toBeGreaterThanOrEqual(2);
      expect(result.queuedUploads).toBeGreaterThanOrEqual(1);
      expect(result.deletedFiles).toBeGreaterThanOrEqual(1);
      expect(result.failedFiles).toBe(0);

      const [referencedDownload, orphanDownload] = await Promise.all([
        pair.admin.storage.from("profile-photos").download(referencedPath),
        pair.admin.storage.from("profile-photos").download(orphanPath),
      ]);
      expect(referencedDownload.error).toBeNull();
      expect(orphanDownload.error).not.toBeNull();

      const { data: sweepLedger, error: sweepLedgerError } = await pair.admin
        .from("storage_upload_usage_events")
        .select(
          "object_name, deleted_at, deletion_claim_token, orphan_checked_at",
        )
        .eq("bucket_id", "profile-photos")
        .in("object_name", paths);
      expect(sweepLedgerError).toBeNull();
      expect(sweepLedger).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            object_name: referencedPath,
            deleted_at: null,
            deletion_claim_token: null,
            orphan_checked_at: expect.any(String),
          }),
          expect.objectContaining({
            object_name: orphanPath,
            deletion_claim_token: null,
            deleted_at: expect.any(String),
          }),
        ]),
      );
    } finally {
      await pair.admin
        .from("profile_photos")
        .delete()
        .eq("storage_path", referencedPath);
      await pair.admin.storage.from("profile-photos").remove(paths);
      await removePair(pair);
    }
  });

  test("serializes auth-email budgets and debounces profile-view writes", async () => {
    const admin = createAdminClient();
    const unique = randomUUID().replaceAll("-", "").padEnd(64, "0");
    const sharedIpHash = `a${unique.slice(1)}`;
    const sharedPrefixHash = `b${unique.slice(1)}`;
    const sharedEmailHash = `f${unique.slice(1)}`;
    const blockedSubjectHash = `c${unique.slice(1)}`;
    const blockedIpHash = `d${unique.slice(1)}`;
    const blockedPrefixHash = `e${unique.slice(1)}`;
    const pair = await createPair();

    try {
      const ipLimitedResults = await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          admin.rpc("record_auth_email_request", {
            p_action:
              index % 2 === 0
                ? "signup_confirmation"
                : "resend_confirmation",
            p_email_domain: "example.com",
            p_email_hash: `${index.toString(16).padStart(8, "0")}${unique}`.slice(
              0,
              64,
            ),
            p_ip_hash: sharedIpHash,
            p_ip_prefix_hash: sharedPrefixHash,
            p_user_agent_hash: null,
          }),
        ),
      );

      expect(ipLimitedResults.every(({ error }) => error === null)).toBe(true);
      expect(
        ipLimitedResults.filter(({ data }) => data?.[0]?.allowed === true),
      ).toHaveLength(5);

      const { count: ipEventCount, error: ipEventCountError } = await admin
        .from("auth_email_request_events")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", sharedIpHash);

      expect(ipEventCountError).toBeNull();
      expect(ipEventCount).toBe(20);

      const emailLimitedResults = await Promise.all(
        Array.from({ length: 10 }, (_, index) => {
          const dimension = (100 + index).toString(16).padStart(8, "0");

          return admin.rpc("record_auth_email_request", {
            p_action:
              index % 2 === 0
                ? "signup_confirmation"
                : "resend_confirmation",
            p_email_domain: "example.net",
            p_email_hash: sharedEmailHash,
            p_ip_hash: `${dimension}${unique}`.slice(0, 64),
            p_ip_prefix_hash: `${dimension}${unique.split("").reverse().join("")}`.slice(
              0,
              64,
            ),
            p_user_agent_hash: null,
          });
        }),
      );

      expect(emailLimitedResults.every(({ error }) => error === null)).toBe(
        true,
      );
      expect(
        emailLimitedResults.filter(({ data }) => data?.[0]?.allowed === true),
      ).toHaveLength(1);

      const { error: activeBlockInsertError } = await admin
        .from("security_rate_limit_events")
        .insert({
          action: "login",
          blocked: true,
          created_at: new Date(Date.now() - 45_000).toISOString(),
          ip_hash: blockedIpHash,
          ip_prefix_hash: blockedPrefixHash,
          reason: "subject_limit",
          retry_after_seconds: 60,
          subject_hash: blockedSubjectHash,
        });

      expect(activeBlockInsertError).toBeNull();

      const { data: activeBlockResult, error: activeBlockError } =
        await admin.rpc("record_security_rate_limit_event", {
          p_action: "login",
          p_ip_hash: blockedIpHash,
          p_ip_prefix_hash: blockedPrefixHash,
          p_subject_hash: blockedSubjectHash,
          p_user_agent_hash: null,
        });

      expect(activeBlockError).toBeNull();
      expect(activeBlockResult?.[0]?.allowed).toBe(false);
      expect(activeBlockResult?.[0]?.challenge_required).toBe(false);
      expect(activeBlockResult?.[0]?.reason).toBe("subject_limit");
      expect(activeBlockResult?.[0]?.retry_after_seconds).toBeGreaterThan(0);

      const { count: activeBlockCount, error: activeBlockCountError } =
        await admin
          .from("security_rate_limit_events")
          .select("id", { count: "exact", head: true })
          .eq("subject_hash", blockedSubjectHash);

      expect(activeBlockCountError).toBeNull();
      expect(activeBlockCount).toBe(1);

      const profileViewResults = await Promise.all(
        Array.from({ length: 12 }, () =>
          pair.family.rpc("record_profile_view", {
            p_profile_id: pair.auPairId,
          }),
        ),
      );

      expect(profileViewResults.every(({ error }) => error === null)).toBe(true);
      expect(
        profileViewResults.filter(({ data }) => data === true),
      ).toHaveLength(1);

      const { data: profileView, error: profileViewError } = await admin
        .from("profile_views")
        .select("first_viewed_at, last_viewed_at, view_count")
        .eq("viewer_id", pair.familyId)
        .eq("profile_id", pair.auPairId)
        .single();

      expect(profileViewError).toBeNull();
      expect(profileView?.view_count).toBe(1);
      expect(profileView?.last_viewed_at).toBe(profileView?.first_viewed_at);

      const { data: firstSummary, error: firstSummaryError } =
        await pair.auPair.rpc("get_profile_notification_summary");

      expect(firstSummaryError).toBeNull();
      expect(firstSummary?.[0]?.profile_view_count).toBe(1);

      const { error: markViewsReadError } = await pair.auPair.rpc(
        "mark_profile_activity_notifications_read",
        { p_kind: "views" },
      );

      expect(markViewsReadError).toBeNull();

      const { error: ageLastViewError } = await admin
        .from("profile_views")
        .update({
          last_viewed_at: new Date(Date.now() - 10 * 60_000).toISOString(),
        })
        .eq("viewer_id", pair.familyId)
        .eq("profile_id", pair.auPairId);

      expect(ageLastViewError).toBeNull();

      const { data: repeatedViewResult, error: repeatedViewError } =
        await pair.family.rpc("record_profile_view", {
          p_profile_id: pair.auPairId,
        });

      expect(repeatedViewError).toBeNull();
      expect(repeatedViewResult).toBe(false);

      const { data: repeatedSummary, error: repeatedSummaryError } =
        await pair.auPair.rpc("get_profile_notification_summary");

      expect(repeatedSummaryError).toBeNull();
      expect(repeatedSummary?.[0]?.profile_view_count).toBe(0);
    } finally {
      await Promise.all([
        admin
          .from("auth_email_request_events")
          .delete()
          .eq("ip_hash", sharedIpHash),
        admin
          .from("auth_email_request_events")
          .delete()
          .eq("email_hash", sharedEmailHash),
        admin
          .from("security_rate_limit_events")
          .delete()
          .eq("subject_hash", blockedSubjectHash),
      ]);
      await removePair(pair);
    }
  });

  test("caps message emails to one local day with twelve-hour spacing", async () => {
    const pair = await createPair();

    try {
      const anonymousReservation = await pair.anonymous.rpc(
        "reserve_engagement_email_delivery",
        {
          p_category: "new_message",
          p_recipient_id: pair.familyId,
        },
      );

      expect(anonymousReservation.error).not.toBeNull();

      const concurrentReservations = await Promise.all(
        Array.from({ length: 8 }, () =>
          pair.admin.rpc("reserve_engagement_email_delivery", {
            p_category: "new_message",
            p_recipient_id: pair.familyId,
          }),
        ),
      );

      expect(
        concurrentReservations.every(({ error }) => error === null),
      ).toBe(true);

      const reservationIds = concurrentReservations
        .map(({ data }) => data)
        .filter((data): data is string => typeof data === "string");

      expect(reservationIds).toHaveLength(1);

      const { data: released, error: releaseError } = await pair.admin.rpc(
        "release_engagement_email_delivery",
        { p_delivery_id: reservationIds[0] },
      );

      expect(releaseError).toBeNull();
      expect(released).toBe(true);

      const replacementReservation = await pair.admin.rpc(
        "reserve_engagement_email_delivery",
        {
          p_category: "new_message",
          p_recipient_id: pair.familyId,
        },
      );

      expect(replacementReservation.error).toBeNull();
      expect(typeof replacementReservation.data).toBe("string");

      const completedReservation = await pair.admin.rpc(
        "complete_engagement_email_delivery",
        { p_delivery_id: replacementReservation.data },
      );

      expect(completedReservation.error).toBeNull();
      expect(completedReservation.data).toBe(true);

      const cadenceBlockedReservation = await pair.admin.rpc(
        "reserve_engagement_email_delivery",
        {
          p_category: "new_message",
          p_recipient_id: pair.familyId,
        },
      );

      expect(cadenceBlockedReservation.error).toBeNull();
      expect(cadenceBlockedReservation.data).toBeNull();

      const insideTwelveHours = new Date(
        Date.now() - (12 * 60 * 60 * 1_000 - 60_000),
      ).toISOString();
      await pair.admin
        .from("engagement_email_delivery_reservations")
        .update({ reserved_at: insideTwelveHours, sent_at: insideTwelveHours })
        .eq("id", replacementReservation.data);

      const spacingBlockedReservation = await pair.admin.rpc(
        "reserve_engagement_email_delivery",
        {
          p_category: "new_message",
          p_recipient_id: pair.familyId,
        },
      );

      expect(spacingBlockedReservation.error).toBeNull();
      expect(spacingBlockedReservation.data).toBeNull();

      const fixedOffsetMarkets = [
        { country: "American Samoa", offsetMinutes: -11 * 60 },
        { country: "Unknown", offsetMinutes: 0 },
        { country: "Nigeria", offsetMinutes: 60 },
        { country: "South Africa", offsetMinutes: 2 * 60 },
        { country: "Ethiopia", offsetMinutes: 3 * 60 },
        { country: "India", offsetMinutes: 5 * 60 + 30 },
        { country: "Nepal", offsetMinutes: 5 * 60 + 45 },
        { country: "Bangladesh", offsetMinutes: 6 * 60 },
        { country: "Indonesia", offsetMinutes: 7 * 60 },
        { country: "Philippines", offsetMinutes: 8 * 60 },
        { country: "Japan", offsetMinutes: 9 * 60 },
      ];
      const currentTime = new Date();
      const currentUtcMinute =
        currentTime.getUTCHours() * 60 + currentTime.getUTCMinutes();
      const localMarket = fixedOffsetMarkets.find(({ offsetMinutes }) => {
        const localMinute =
          (currentUtcMinute + offsetMinutes + 24 * 60) % (24 * 60);
        return localMinute >= 13 * 60;
      });

      expect(localMarket).toBeDefined();

      const { error: countryError } = await pair.admin
        .from("profiles")
        .update({ country: localMarket?.country })
        .eq("id", pair.familyId);

      expect(countryError).toBeNull();

      const localTime = new Date(
        currentTime.getTime() + (localMarket?.offsetMinutes ?? 0) * 60_000,
      );
      const sameLocalDay = new Date(
        Date.UTC(
          localTime.getUTCFullYear(),
          localTime.getUTCMonth(),
          localTime.getUTCDate(),
          0,
          5,
        ) -
          (localMarket?.offsetMinutes ?? 0) * 60_000,
      );

      await pair.admin
        .from("engagement_email_delivery_reservations")
        .update({
          reserved_at: sameLocalDay.toISOString(),
          sent_at: sameLocalDay.toISOString(),
        })
        .eq("id", replacementReservation.data);

      const sameDayBlockedReservation = await pair.admin.rpc(
        "reserve_engagement_email_delivery",
        {
          p_category: "new_message",
          p_recipient_id: pair.familyId,
        },
      );

      expect(sameDayBlockedReservation.error).toBeNull();
      expect(sameDayBlockedReservation.data).toBeNull();

      await pair.admin
        .from("engagement_email_delivery_reservations")
        .update({
          reserved_at: new Date(
            sameLocalDay.getTime() - 24 * 60 * 60 * 1_000,
          ).toISOString(),
          sent_at: new Date(
            sameLocalDay.getTime() - 24 * 60 * 60 * 1_000,
          ).toISOString(),
        })
        .eq("id", replacementReservation.data);

      const nextLocalDayReservation = await pair.admin.rpc(
        "reserve_engagement_email_delivery",
        {
          p_category: "new_message",
          p_recipient_id: pair.familyId,
        },
      );

      expect(nextLocalDayReservation.error).toBeNull();
      expect(typeof nextLocalDayReservation.data).toBe("string");

      const { data: nextCompleted, error: nextCompletionError } =
        await pair.admin.rpc("complete_engagement_email_delivery", {
          p_delivery_id: nextLocalDayReservation.data,
        });

      expect(nextCompletionError).toBeNull();
      expect(nextCompleted).toBe(true);

      const onePerDayBlockedReservation = await pair.admin.rpc(
        "reserve_engagement_email_delivery",
        {
          p_category: "new_message",
          p_recipient_id: pair.familyId,
        },
      );

      expect(onePerDayBlockedReservation.error).toBeNull();
      expect(onePerDayBlockedReservation.data).toBeNull();

      await pair.admin
        .from("profiles")
        .update({ new_message_emails_enabled: false })
        .eq("id", pair.familyId);

      const disabledMessageEmail = await pair.admin.rpc(
        "reserve_engagement_email_delivery",
        {
          p_category: "new_message",
          p_recipient_id: pair.familyId,
        },
      );

      expect(disabledMessageEmail.error).toBeNull();
      expect(disabledMessageEmail.data).toBeNull();

      const { data: auPairPreferences, error: preferencesError } =
        await pair.admin
          .from("profiles")
          .select(
            "email_unsubscribe_token, new_message_emails_enabled, profile_completion_emails_enabled, notification_emails_enabled",
          )
          .eq("id", pair.auPairId)
          .single<{
            email_unsubscribe_token: string;
            new_message_emails_enabled: boolean;
            profile_completion_emails_enabled: boolean;
            notification_emails_enabled: boolean;
          }>();

      expect(preferencesError).toBeNull();
      expect(auPairPreferences.email_unsubscribe_token).toMatch(UUID_PATTERN);

      const anonymousUnsubscribe = await pair.anonymous.rpc(
        "unsubscribe_optional_profile_email",
        {
          p_category: "new_message",
          p_token: auPairPreferences.email_unsubscribe_token,
        },
      );

      expect(anonymousUnsubscribe.error).not.toBeNull();

      const serviceUnsubscribe = await pair.admin.rpc(
        "unsubscribe_optional_profile_email",
        {
          p_category: "new_message",
          p_token: auPairPreferences.email_unsubscribe_token,
        },
      );

      expect(serviceUnsubscribe.error).toBeNull();
      expect(serviceUnsubscribe.data).toBe(true);

      const { data: updatedPreferences, error: updatedPreferencesError } =
        await pair.admin
          .from("profiles")
          .select(
            "new_message_emails_enabled, profile_completion_emails_enabled, notification_emails_enabled",
          )
          .eq("id", pair.auPairId)
          .single<{
            new_message_emails_enabled: boolean;
            profile_completion_emails_enabled: boolean;
            notification_emails_enabled: boolean;
          }>();

      expect(updatedPreferencesError).toBeNull();
      expect(updatedPreferences).toEqual({
        new_message_emails_enabled: false,
        profile_completion_emails_enabled: true,
        notification_emails_enabled: true,
      });

      const retiredFavoriteEmailClaim = await pair.admin.rpc(
        "claim_profile_favorite_notification_delivery",
        {
          p_actor_id: pair.auPairId,
          p_recipient_id: pair.familyId,
        },
      );

      expect(retiredFavoriteEmailClaim.error).not.toBeNull();
    } finally {
      await pair.admin
        .from("engagement_email_delivery_reservations")
        .delete()
        .in("recipient_id", [pair.familyId, pair.auPairId]);
      await removePair(pair);
    }
  });

  test("groups quiet-hours messages for 08:00 in the recipient timezone", async () => {
    const pair = await createPair();
    const conversationId = randomUUID();
    const firstMessageId = randomUUID();
    const secondMessageId = randomUUID();

    try {
      const { error: conversationError } = await pair.admin
        .from("conversations")
        .insert({
          id: conversationId,
          family_id: pair.familyId,
          au_pair_id: pair.auPairId,
          created_by: pair.auPairId,
        });

      expect(conversationError).toBeNull();

      const firstMessageAt = "2026-01-15T21:30:00.000Z";
      const { error: firstMessageError } = await pair.admin
        .from("messages")
        .insert({
          id: firstMessageId,
          conversation_id: conversationId,
          sender_id: pair.auPairId,
          body: "Quiet-hours digest test one",
          created_at: firstMessageAt,
          sent_at: firstMessageAt,
        });

      expect(firstMessageError).toBeNull();

      const { error: initialActivityError } = await pair.admin
        .from("profiles")
        .update({ last_active_at: "2026-01-15T21:00:00.000Z" })
        .eq("id", pair.familyId);

      expect(initialActivityError).toBeNull();

      const firstSchedule = await pair.admin.rpc(
        "schedule_message_notification_delivery",
        {
          p_message_id: firstMessageId,
          p_now: firstMessageAt,
          p_recipient_id: pair.familyId,
        },
      );

      expect(firstSchedule.error).toBeNull();
      expect(firstSchedule.data).toBe("queued_digest");

      const { count: firstQueueCount, error: firstQueueStateError } =
        await pair.admin
          .from("message_digest_email_deliveries")
          .select("recipient_id", { count: "exact", head: true })
          .eq("recipient_id", pair.familyId);

      expect(firstQueueStateError).toBeNull();
      expect(firstQueueCount).toBe(1);

      const { error: returnedActivityError } = await pair.admin
        .from("profiles")
        .update({ last_active_at: "2026-01-15T21:31:00.000Z" })
        .eq("id", pair.familyId);

      expect(returnedActivityError).toBeNull();

      const secondMessageAt = "2026-01-15T21:35:00.000Z";
      const { error: secondMessageError } = await pair.admin
        .from("messages")
        .insert({
          id: secondMessageId,
          conversation_id: conversationId,
          sender_id: pair.auPairId,
          body: "Quiet-hours digest test two",
          created_at: secondMessageAt,
          sent_at: secondMessageAt,
        });

      expect(secondMessageError).toBeNull();

      const secondSchedule = await pair.admin.rpc(
        "schedule_message_notification_delivery",
        {
          p_message_id: secondMessageId,
          p_now: secondMessageAt,
          p_recipient_id: pair.familyId,
        },
      );

      expect(secondSchedule.error).toBeNull();
      expect(secondSchedule.data).toBe("queued_digest");

      const { data: queueState, error: queueStateError } = await pair.admin
        .from("message_digest_email_deliveries")
        .select("due_at, latest_message_at")
        .eq("recipient_id", pair.familyId)
        .single();

      expect(queueStateError).toBeNull();
      expect(queueState.due_at).toBe("2026-01-16T07:00:00+00:00");
      expect(new Date(queueState.latest_message_at).toISOString()).toBe(
        secondMessageAt,
      );

      const eligibleClaim = await pair.admin.rpc(
        "claim_message_digest_email_deliveries",
        {
          p_batch_size: 10,
          p_now: "2026-01-16T07:00:00.000Z",
        },
      );

      expect(eligibleClaim.error).toBeNull();
      expect(eligibleClaim.data).toHaveLength(1);
      expect(eligibleClaim.data?.[0]).toMatchObject({
        recipient_id: pair.familyId,
        unread_message_count: 2,
        unread_conversation_count: 1,
      });
      expect(
        new Date(eligibleClaim.data?.[0]?.latest_message_at).toISOString(),
      ).toBe(secondMessageAt);

      const claimToken = eligibleClaim.data?.[0]?.claim_token;
      expect(claimToken).toMatch(UUID_PATTERN);

      const { data: released, error: releaseError } = await pair.admin.rpc(
        "release_message_digest_email_delivery",
        {
          p_claim_token: claimToken,
          p_recipient_id: pair.familyId,
        },
      );

      expect(releaseError).toBeNull();
      expect(released).toBe(true);

      const { error: finalActivityError } = await pair.admin
        .from("profiles")
        .update({ last_active_at: "2026-01-15T21:36:00.000Z" })
        .eq("id", pair.familyId);

      expect(finalActivityError).toBeNull();

      const suppressedClaim = await pair.admin.rpc(
        "claim_message_digest_email_deliveries",
        {
          p_batch_size: 10,
          p_now: "2026-01-16T07:01:00.000Z",
        },
      );

      expect(suppressedClaim.error).toBeNull();
      expect(suppressedClaim.data).toEqual([]);

      const { data: suppressedState, error: suppressedStateError } =
        await pair.admin
          .from("message_digest_email_deliveries")
          .select("sent_at, suppressed_at")
          .eq("recipient_id", pair.familyId)
          .single();

      expect(suppressedStateError).toBeNull();
      expect(suppressedState.sent_at).toBeNull();
      expect(suppressedState.suppressed_at).not.toBeNull();

      const anonymousClaim = await pair.anonymous.rpc(
        "claim_message_digest_email_deliveries",
        { p_batch_size: 1 },
      );

      expect(anonymousClaim.error).not.toBeNull();
    } finally {
      await removePair(pair);
    }
  });

  test("schedules an Indonesian quiet-hours digest for 08:00 local", async () => {
    const pair = await createPair();
    const conversationId = randomUUID();
    const messageId = randomUUID();
    const messageAt = "2026-08-03T19:00:00.000Z"; // 02:00 in Jakarta.

    try {
      const { error: countryError } = await pair.admin
        .from("profiles")
        .update({
          country: "Indonesia",
          last_active_at: "2026-08-03T18:59:00.000Z",
        })
        .eq("id", pair.familyId);

      expect(countryError).toBeNull();

      const { error: conversationError } = await pair.admin
        .from("conversations")
        .insert({
          id: conversationId,
          family_id: pair.familyId,
          au_pair_id: pair.auPairId,
          created_by: pair.auPairId,
        });

      expect(conversationError).toBeNull();

      const { error: messageError } = await pair.admin.from("messages").insert({
        id: messageId,
        conversation_id: conversationId,
        sender_id: pair.auPairId,
        body: "Jakarta overflow digest test",
        created_at: messageAt,
        sent_at: messageAt,
      });

      expect(messageError).toBeNull();

      const { error: reservationError } = await pair.admin
        .from("engagement_email_delivery_reservations")
        .insert({
          recipient_id: pair.familyId,
          category: "new_message",
          reserved_at: "2026-08-03T08:00:00.000Z",
          sent_at: "2026-08-03T08:00:00.000Z",
        });

      expect(reservationError).toBeNull();

      const schedule = await pair.admin.rpc(
        "schedule_message_notification_delivery",
        {
          p_message_id: messageId,
          p_now: messageAt,
          p_recipient_id: pair.familyId,
        },
      );

      expect(schedule.error).toBeNull();
      expect(schedule.data).toBe("queued_digest");

      const { data: queueState, error: queueStateError } = await pair.admin
        .from("message_digest_email_deliveries")
        .select("digest_date, due_at, time_zone")
        .eq("recipient_id", pair.familyId)
        .single();

      expect(queueStateError).toBeNull();
      expect(queueState).toEqual({
        digest_date: "2026-08-04",
        due_at: "2026-08-04T01:00:00+00:00",
        time_zone: "Asia/Jakarta",
      });
    } finally {
      await Promise.all([
        pair.admin
          .from("message_digest_email_deliveries")
          .delete()
          .eq("recipient_id", pair.familyId),
        pair.admin
          .from("engagement_email_delivery_reservations")
          .delete()
          .eq("recipient_id", pair.familyId),
      ]);
      await removePair(pair);
    }
  });

  test("serializes concurrent security-rate and reminder claims", async () => {
    const admin = createAdminClient();
    const unique = randomUUID().replaceAll("-", "").padEnd(64, "0");

    try {
      const rateResults = await Promise.all(
        Array.from({ length: 20 }, () =>
          admin.rpc("record_security_rate_limit_event", {
            p_action: "report",
            p_ip_hash: `ip${unique}`,
            p_ip_prefix_hash: `prefix${unique}`,
            p_subject_hash: `subject${unique}`,
            p_user_agent_hash: null,
          }),
        ),
      );

      expect(rateResults.every(({ error }) => error === null)).toBe(true);
      expect(
        rateResults.filter(({ data }) => data?.[0]?.allowed === true),
      ).toHaveLength(12);

      const pair = await createPair();

      try {
        const now = new Date();
        const scheduledDeleteAt = new Date(
          now.getTime() + 12 * 60 * 60 * 1_000,
        );
        const { data: deletionRequest, error: requestError } = await admin
          .from("account_deletion_requests")
          .insert({
            profile_id: pair.auPairId,
            email: `reminder-${unique}@example.com`,
            requested_at: now.toISOString(),
            scheduled_delete_at: scheduledDeleteAt.toISOString(),
            status: "pending",
          })
          .select("id")
          .single();

        expect(requestError).toBeNull();
        await admin
          .from("profiles")
          .update({
            deletion_requested_at: now.toISOString(),
            deletion_scheduled_at: scheduledDeleteAt.toISOString(),
          })
          .eq("id", pair.auPairId);

        const reminderClaims = await Promise.all([
          admin.rpc("claim_account_deletion_reminders", {
            p_batch_size: 10,
            p_now: now.toISOString(),
          }),
          admin.rpc("claim_account_deletion_reminders", {
            p_batch_size: 10,
            p_now: now.toISOString(),
          }),
        ]);
        const claimedRows = reminderClaims.flatMap(({ data }) => data ?? []);

        expect(reminderClaims.every(({ error }) => error === null)).toBe(true);
        expect(claimedRows).toHaveLength(1);
        expect(claimedRows[0]?.id).toBe(deletionRequest?.id);

        const { data: completed, error: completeError } = await admin.rpc(
          "complete_account_deletion_reminder",
          {
            p_claim_token: claimedRows[0]?.claim_token,
            p_request_id: deletionRequest?.id,
            p_sent_at: now.toISOString(),
          },
        );

        expect(completeError).toBeNull();
        expect(completed).toBe(true);
      } finally {
        await removePair(pair);
      }
    } finally {
      await admin
        .from("engagement_email_daily_usage")
        .delete()
        .eq("usage_date", new Date().toISOString().slice(0, 10));
      await admin
        .from("security_rate_limit_events")
        .delete()
        .eq("subject_hash", `subject${unique}`);
    }
  });
});
