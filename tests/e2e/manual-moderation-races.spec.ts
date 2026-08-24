import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { getSupabaseCredentials } from "./helpers/supabase-local";

const PASSWORD = "TestPassword123!";

function createAdminClient() {
  const { url, serviceRoleKey } = getSupabaseCredentials();

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function createBrowserClient() {
  const { publishableKey, url } = getSupabaseCredentials();

  if (!publishableKey) {
    throw new Error("Could not find local Supabase publishable key.");
  }

  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createUser(admin: SupabaseClient, email: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: PASSWORD,
    user_metadata: { account_type: "au_pair" },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Could not create moderation fixture.");
  }

  return data.user.id;
}

function profileVersion(
  profile: {
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    bio: string | null;
    childcare_experience: string | null;
    children_info: string | null;
    accommodation_info: string | null;
    expectations: string | null;
  },
  photoPaths: string[],
) {
  const orderedPhotoPaths = [...photoPaths].sort((left, right) =>
    Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
  );
  const serialized = [
    profile.full_name,
    profile.first_name,
    profile.last_name,
    profile.bio,
    profile.childcare_experience,
    profile.children_info,
    profile.accommodation_info,
    profile.expectations,
    ...orderedPhotoPaths,
  ]
    .map((value) => {
      const normalized = value ?? "";
      return `${Buffer.byteLength(normalized, "utf8")}:${normalized}`;
    })
    .join("");

  return createHash("sha256").update(serialized, "utf8").digest("hex");
}

async function withDeadline<T>(operation: Promise<T>, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("Concurrent moderation operations deadlocked.")),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

test.describe("manual moderation revision races", () => {
  test("deleting the last photo queues review and makes the profile ineligible", async () => {
    const admin = createAdminClient();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const reviewerEmail = `qa-photo-reviewer-${suffix}@example.com`;
    const ownerEmail = `qa-last-photo-owner-${suffix}@example.com`;
    let reviewerId: string | null = null;
    let ownerId: string | null = null;

    try {
      reviewerId = await createUser(admin, reviewerEmail);
      ownerId = await createUser(admin, ownerEmail);

      const { error: reviewerProfileError } = await admin
        .from("profiles")
        .upsert({
          id: reviewerId,
          email: reviewerEmail,
          account_type: "au_pair",
          full_name: "QA Photo Reviewer",
          onboarding_completed: true,
          preferred_host_countries: ["Germany"],
          content_moderation_status: "approved",
          is_admin: true,
        });
      expect(reviewerProfileError).toBeNull();

      const { error: ownerProfileError } = await admin.from("profiles").upsert({
        id: ownerId,
        email: ownerEmail,
        account_type: "au_pair",
        full_name: "QA Last Photo Owner",
        onboarding_completed: true,
        preferred_host_countries: ["Germany"],
        content_moderation_status: "approved",
        is_admin: false,
      });
      expect(ownerProfileError).toBeNull();

      const { data: photo, error: photoError } = await admin
        .from("profile_photos")
        .insert({
          profile_id: ownerId,
          storage_path: `${ownerId}/last-photo-${suffix}.webp`,
          is_primary: true,
          sort_order: 0,
        })
        .select("id")
        .single();
      expect(photoError).toBeNull();
      expect(photo?.id).toBeTruthy();

      const deletion = await admin.rpc(
        "delete_profile_photo_for_moderation",
        {
          p_photo_id: photo?.id,
          p_reviewer_id: reviewerId,
        },
      );
      expect(deletion.error).toBeNull();
      expect(deletion.data).toMatchObject({
        profile_id: ownerId,
        was_primary: true,
        remaining_photos: 0,
      });

      const [{ count: remainingPhotos }, { data: ownerProfile }] =
        await Promise.all([
          admin
            .from("profile_photos")
            .select("id", { count: "exact", head: true })
            .eq("profile_id", ownerId),
          admin
            .from("profiles")
            .select(
              "content_moderation_status, content_moderation_needs_review, content_moderation_reviewed_at, content_moderation_reviewed_by, content_moderation_reason",
            )
            .eq("id", ownerId)
            .single(),
        ]);

      expect(remainingPhotos).toBe(0);
      expect(ownerProfile).toMatchObject({
        content_moderation_status: "approved",
        content_moderation_needs_review: true,
        content_moderation_reviewed_at: null,
        content_moderation_reviewed_by: null,
        content_moderation_reason:
          "The last profile photo was removed during moderation. A new photo is required.",
      });

      const publicEligibility = await admin.rpc("public_profile_is_eligible", {
        p_profile_id: ownerId,
        p_require_photo: true,
      });
      expect(publicEligibility).toMatchObject({ data: false, error: null });
    } finally {
      for (const id of [ownerId, reviewerId]) {
        if (!id) continue;
        await admin.from("profiles").delete().eq("id", id);
        await admin.auth.admin.deleteUser(id);
      }
    }
  });

  test("stale profile text/photos and replaced intro videos cannot be approved", async () => {
    const admin = createAdminClient();
    const owner = createBrowserClient();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const reviewerEmail = `qa-moderator-${suffix}@example.com`;
    const ownerEmail = `qa-moderation-owner-${suffix}@example.com`;
    let reviewerId: string | null = null;
    let ownerId: string | null = null;

    try {
      reviewerId = await createUser(admin, reviewerEmail);
      ownerId = await createUser(admin, ownerEmail);

      const initialProfile = {
        full_name: "QA Moderation Owner",
        first_name: "QA",
        last_name: "Owner",
        bio: "First profile revision.",
        childcare_experience: "First childcare revision.",
        children_info: null,
        accommodation_info: null,
        expectations: "Safe expectations.",
      };

      const { error: reviewerProfileError } = await admin
        .from("profiles")
        .upsert({
          id: reviewerId,
          email: reviewerEmail,
          account_type: "au_pair",
          full_name: "QA Moderator",
          onboarding_completed: true,
          preferred_host_countries: ["Germany"],
          content_moderation_status: "approved",
          is_admin: true,
        });
      expect(reviewerProfileError).toBeNull();

      const { error: ownerProfileError } = await admin.from("profiles").upsert({
        id: ownerId,
        email: ownerEmail,
        account_type: "au_pair",
        onboarding_completed: true,
        preferred_host_countries: ["Germany"],
        content_moderation_status: "approved",
        content_moderation_needs_review: true,
        is_admin: false,
        ...initialProfile,
      });
      expect(ownerProfileError).toBeNull();

      const firstPhotoPath = `${ownerId}/manual-review-first-${suffix}.webp`;
      const secondPhotoPath = `${ownerId}/manual-review-second-${suffix}.webp`;
      const { error: firstPhotoError } = await admin
        .from("profile_photos")
        .insert({
          profile_id: ownerId,
          storage_path: firstPhotoPath,
          is_primary: true,
          sort_order: 0,
        });
      expect(firstPhotoError).toBeNull();

      const initialVersionResult = await admin.rpc(
        "profile_content_moderation_version",
        { p_profile_id: ownerId },
      );
      expect(initialVersionResult.error).toBeNull();
      expect(initialVersionResult.data).toBe(
        profileVersion(initialProfile, [firstPhotoPath]),
      );

      const { error: signInError } = await owner.auth.signInWithPassword({
        email: ownerEmail,
        password: PASSWORD,
      });
      expect(signInError).toBeNull();

      const { error: textUpdateError } = await owner
        .from("profiles")
        .update({ bio: "Second profile revision." })
        .eq("id", ownerId);
      expect(textUpdateError).toBeNull();

      const staleTextDecision = await admin.rpc(
        "apply_manual_profile_moderation_decision",
        {
          p_expected_version: initialVersionResult.data,
          p_profile_id: ownerId,
          p_reason: "QA stale profile decision must fail.",
          p_reviewer_id: reviewerId,
          p_status: "approved",
        },
      );
      expect(staleTextDecision).toMatchObject({ data: false, error: null });

      const afterTextVersion = await admin.rpc(
        "profile_content_moderation_version",
        { p_profile_id: ownerId },
      );
      expect(afterTextVersion.error).toBeNull();

      const { error: childcareUpdateError } = await owner
        .from("profiles")
        .update({ childcare_experience: "Second childcare revision." })
        .eq("id", ownerId);
      expect(childcareUpdateError).toBeNull();

      const staleChildcareDecision = await admin.rpc(
        "apply_manual_profile_moderation_decision",
        {
          p_expected_version: afterTextVersion.data,
          p_profile_id: ownerId,
          p_reason: "QA stale childcare decision must fail.",
          p_reviewer_id: reviewerId,
          p_status: "approved",
        },
      );
      expect(staleChildcareDecision).toMatchObject({ data: false, error: null });

      const { error: secondPhotoError } = await admin
        .from("profile_photos")
        .insert({
          profile_id: ownerId,
          storage_path: secondPhotoPath,
          is_primary: false,
          sort_order: 1,
        });
      expect(secondPhotoError).toBeNull();

      const stalePhotoDecision = await admin.rpc(
        "apply_manual_profile_moderation_decision",
        {
          p_expected_version: afterTextVersion.data,
          p_profile_id: ownerId,
          p_reason: "QA stale photo decision must fail.",
          p_reviewer_id: reviewerId,
          p_status: "approved",
        },
      );
      expect(stalePhotoDecision).toMatchObject({ data: false, error: null });

      const currentProfileVersion = await admin.rpc(
        "profile_content_moderation_version",
        { p_profile_id: ownerId },
      );
      expect(currentProfileVersion.error).toBeNull();

      const currentProfileDecision = await admin.rpc(
        "apply_manual_profile_moderation_decision",
        {
          p_expected_version: currentProfileVersion.data,
          p_profile_id: ownerId,
          p_reason: "QA current profile revision approved.",
          p_reviewer_id: reviewerId,
          p_status: "approved",
        },
      );
      expect(currentProfileDecision).toMatchObject({ data: true, error: null });

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { error: prepareConcurrentEditError } = await owner
          .from("profiles")
          .update({ bio: `Concurrent base revision ${attempt}.` })
          .eq("id", ownerId);
        expect(prepareConcurrentEditError).toBeNull();

        const concurrentVersion = await admin.rpc(
          "profile_content_moderation_version",
          { p_profile_id: ownerId },
        );
        expect(concurrentVersion.error).toBeNull();

        const [concurrentEdit, concurrentDecision] = await withDeadline(
          Promise.all([
            owner
              .from("profiles")
              .update({ bio: `Concurrent replacement revision ${attempt}.` })
              .eq("id", ownerId),
            admin.rpc("apply_manual_profile_moderation_decision", {
              p_expected_version: concurrentVersion.data,
              p_profile_id: ownerId,
              p_reason: `QA concurrent decision ${attempt}.`,
              p_reviewer_id: reviewerId,
              p_status: "approved",
            }),
          ]),
          5_000,
        );

        expect(concurrentEdit.error).toBeNull();
        expect(concurrentDecision.error).toBeNull();
        expect([true, false]).toContain(concurrentDecision.data);

        const { data: afterConcurrentRace, error: afterConcurrentRaceError } =
          await admin
            .from("profiles")
            .select(
              "bio, content_moderation_status, content_moderation_needs_review, content_moderation_reviewed_at",
            )
            .eq("id", ownerId)
            .single();
        expect(afterConcurrentRaceError).toBeNull();
        expect(afterConcurrentRace).toMatchObject({
          bio: `Concurrent replacement revision ${attempt}.`,
          content_moderation_status: "approved",
          content_moderation_needs_review: true,
          content_moderation_reviewed_at: null,
        });
      }

      const versionAfterConcurrentRaces = await admin.rpc(
        "profile_content_moderation_version",
        { p_profile_id: ownerId },
      );
      expect(versionAfterConcurrentRaces.error).toBeNull();

      const decisionAfterConcurrentRaces = await admin.rpc(
        "apply_manual_profile_moderation_decision",
        {
          p_expected_version: versionAfterConcurrentRaces.data,
          p_profile_id: ownerId,
          p_reason: "QA current revision approved after concurrent edits.",
          p_reviewer_id: reviewerId,
          p_status: "approved",
        },
      );
      expect(decisionAfterConcurrentRaces).toMatchObject({
        data: true,
        error: null,
      });

      const oldVideoPath = `${ownerId}/manual-review-old-${suffix}.mp4`;
      const newVideoPath = `${ownerId}/manual-review-new-${suffix}.mp4`;
      const { data: video, error: videoInsertError } = await admin
        .from("profile_videos")
        .insert({
          profile_id: ownerId,
          storage_path: oldVideoPath,
          mime_type: "video/mp4",
          size_bytes: 32,
          duration_seconds: 2,
          width: 640,
          height: 360,
          content_moderation_status: "pending",
        })
        .select("id")
        .single();
      expect(videoInsertError).toBeNull();
      expect(video?.id).toBeTruthy();

      const { data: replacedVideo, error: replaceVideoError } = await admin
        .from("profile_videos")
        .update({ storage_path: newVideoPath })
        .eq("id", video?.id)
        .select("id, storage_path, content_moderation_status")
        .single();
      expect(replaceVideoError).toBeNull();
      expect(replacedVideo).toMatchObject({
        id: video?.id,
        storage_path: newVideoPath,
        content_moderation_status: "pending",
      });

      const staleVideoDecision = await admin.rpc(
        "apply_manual_profile_video_moderation_decision",
        {
          p_expected_storage_path: oldVideoPath,
          p_reason: "QA stale video decision must fail.",
          p_reviewer_id: reviewerId,
          p_status: "approved",
          p_video_id: video?.id,
        },
      );
      expect(staleVideoDecision).toMatchObject({ data: false, error: null });

      const currentVideoDecision = await admin.rpc(
        "apply_manual_profile_video_moderation_decision",
        {
          p_expected_storage_path: newVideoPath,
          p_reason: "QA current video revision approved.",
          p_reviewer_id: reviewerId,
          p_status: "approved",
          p_video_id: video?.id,
        },
      );
      expect(currentVideoDecision).toMatchObject({ data: true, error: null });

      const { data: decisions } = await admin
        .from("profiles")
        .select("content_moderation_status")
        .eq("id", ownerId)
        .single();
      const { data: videoDecision } = await admin
        .from("profile_videos")
        .select("storage_path, content_moderation_status")
        .eq("id", video?.id)
        .single();
      expect(decisions?.content_moderation_status).toBe("approved");
      expect(videoDecision).toMatchObject({
        storage_path: newVideoPath,
        content_moderation_status: "approved",
      });
    } finally {
      await owner.auth.signOut();

      for (const id of [ownerId, reviewerId]) {
        if (!id) continue;
        await admin.from("profiles").delete().eq("id", id);
        await admin.auth.admin.deleteUser(id);
      }
    }
  });
});
