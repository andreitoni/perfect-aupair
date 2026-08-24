import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import {
  safeAdminReturnTo,
  withAdminReturnTo,
} from "../../lib/admin/navigation";
import { getSupabaseCredentials } from "./helpers/supabase-local";

const PASSWORD = "TestPassword123!";

type AdminUpdateResult = {
  applied: boolean;
  changed_fields?: string[];
  current_version?: string;
  profile_id: string;
  reason: "stale" | "unchanged" | "updated";
  version?: string;
};

type AdminPhotoResult = {
  applied: boolean;
  photo_id: string;
  profile_id: string;
  reason: "unchanged" | "updated";
  unchanged: boolean;
};

type Fixture = {
  admin: SupabaseClient;
  authenticated: SupabaseClient;
  initialVersion: string;
  moderatorEmail: string;
  moderatorId: string;
  primaryPhotoId: string;
  publicClient: SupabaseClient;
  secondaryPhotoId: string;
  targetEmail: string;
  targetId: string;
};

function createAdminClient() {
  const { serviceRoleKey, url } = getSupabaseCredentials();

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function createPublicClient() {
  const { publishableKey, url } = getSupabaseCredentials();

  if (!publishableKey) {
    throw new Error("Could not find local Supabase publishable key.");
  }

  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createAuthUser(
  admin: SupabaseClient,
  email: string,
  accountType: "au_pair" | "family",
) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: PASSWORD,
    user_metadata: { account_type: accountType },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Could not create admin-edit fixture.");
  }

  return data.user.id;
}

async function removeFixture(fixture: Partial<Fixture>) {
  if (!fixture.admin) return;

  if (fixture.moderatorId) {
    const { error } = await fixture.admin
      .from("admin_audit_log")
      .delete()
      .eq("admin_profile_id", fixture.moderatorId);

    if (error) throw new Error(error.message);
  }

  for (const userId of [fixture.targetId, fixture.moderatorId]) {
    if (userId) {
      const { error } = await fixture.admin.auth.admin.deleteUser(userId);

      if (error) throw new Error(error.message);
    }
  }
}

test.describe("admin profile editing RPCs", () => {
  test.describe.configure({ mode: "serial" });

  const fixture: Partial<Fixture> = {};

  test.beforeAll(async () => {
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const admin = createAdminClient();
    const moderatorEmail = `qa-admin-profile-editor-${suffix}@example.com`;
    const targetEmail = `qa-admin-profile-target-${suffix}@example.com`;
    fixture.admin = admin;
    fixture.publicClient = createPublicClient();
    fixture.authenticated = createPublicClient();
    fixture.moderatorEmail = moderatorEmail;
    fixture.targetEmail = targetEmail;

    try {
      fixture.moderatorId = await createAuthUser(
        admin,
        moderatorEmail,
        "family",
      );
      fixture.targetId = await createAuthUser(admin, targetEmail, "family");

      const [{ error: moderatorError }, { error: targetError }] =
        await Promise.all([
          admin
            .from("profiles")
            .update({
              account_type: "family",
              city: "Berlin",
              country: "Germany",
              first_name: "Quality",
              full_name: "Quality Admin",
              is_admin: true,
              last_name: "Admin",
              onboarding_completed: false,
            })
            .eq("id", fixture.moderatorId),
          admin
            .from("profiles")
            .update({
              account_type: "family",
              au_pair_allowance_amount: 500,
              au_pair_allowance_currency: "EUR",
              bio: "Original fixture biography",
              children_info: "2 children",
              city: "Berlin",
              country: "Germany",
              first_name: "Quality",
              full_name: "Quality Family",
              is_admin: false,
              last_name: "Family",
              onboarding_completed: true,
            })
            .eq("id", fixture.targetId),
        ]);

      expect(moderatorError).toBeNull();
      expect(targetError).toBeNull();

      const { data: primaryPhoto, error: primaryPhotoError } = await admin
        .from("profile_photos")
        .insert({
          is_primary: true,
          profile_id: fixture.targetId,
          sort_order: 0,
          storage_path: `${fixture.targetId}/admin-edit-primary.webp`,
        })
        .select("id")
        .single<{ id: string }>();
      expect(primaryPhotoError).toBeNull();
      expect(primaryPhoto?.id).toBeTruthy();
      fixture.primaryPhotoId = primaryPhoto?.id;

      const { data: secondaryPhoto, error: secondaryPhotoError } = await admin
        .from("profile_photos")
        .insert({
          is_primary: false,
          profile_id: fixture.targetId,
          sort_order: 1,
          storage_path: `${fixture.targetId}/admin-edit-secondary.webp`,
        })
        .select("id")
        .single<{ id: string }>();
      expect(secondaryPhotoError).toBeNull();
      expect(secondaryPhoto?.id).toBeTruthy();
      fixture.secondaryPhotoId = secondaryPhoto?.id;

      const { data: initialSnapshot, error: versionError } = await admin.rpc(
        "admin_profile_edit_snapshot",
        { p_profile_id: fixture.targetId },
      );
      expect(versionError).toBeNull();
      expect(initialSnapshot).toMatchObject({
        profile: {
          account_type: "family",
          bio: "Original fixture biography",
          id: fixture.targetId,
        },
      });
      const initialVersion = (initialSnapshot as { version?: string })?.version;
      expect(initialVersion).toMatch(/^[0-9a-f]{64}$/);
      fixture.initialVersion = initialVersion;
    } catch (error) {
      await removeFixture(fixture);
      throw error;
    }
  });

  test.afterAll(async () => {
    await removeFixture(fixture);
  });

  test("navigation helpers retain only an exact internal admin location", () => {
    const memberLocation =
      "/admin?view=members&type=family&q=Ana#member-123";

    expect(safeAdminReturnTo(memberLocation)).toBe(memberLocation);
    expect(safeAdminReturnTo([memberLocation, "/admin"])).toBe(
      memberLocation,
    );
    expect(safeAdminReturnTo("https://google.com/search?q=admin")).toBe(
      "/admin",
    );
    expect(safeAdminReturnTo("//google.com/admin")).toBe("/admin");
    expect(safeAdminReturnTo("/administrator")).toBe("/admin");
    expect(safeAdminReturnTo("/admin/%5Cgoogle.com")).toBe("/admin");

    const destination = withAdminReturnTo(
      "/admin/profiles/00000000-0000-0000-0000-000000000001?section=profile",
      memberLocation,
    );
    const parsed = new URL(destination, "https://perfectaupair.test");

    expect(parsed.pathname).toBe(
      "/admin/profiles/00000000-0000-0000-0000-000000000001",
    );
    expect(parsed.searchParams.get("section")).toBe("profile");
    expect(parsed.searchParams.get("returnTo")).toBe(memberLocation);
  });

  test("anonymous and authenticated users cannot execute privileged RPCs", async () => {
    const current = fixture as Fixture;
    const protectedUploadPath = `${current.targetId}/00000000-0000-4000-8000-000000000001.png`;
    const rpcCalls = (client: SupabaseClient) => [
      client.rpc("admin_profile_edit_version", {
        p_profile_id: current.targetId,
      }),
      client.rpc("admin_profile_edit_snapshot", {
        p_profile_id: current.targetId,
      }),
      client.rpc("admin_update_profile_details", {
        p_admin_profile_id: current.moderatorId,
        p_expected_version: current.initialVersion,
        p_profile_id: current.targetId,
        p_updates: { country: "Denmark" },
      }),
      client.rpc("admin_set_primary_profile_photo", {
        p_admin_profile_id: current.moderatorId,
        p_photo_id: current.secondaryPhotoId,
      }),
      client.rpc("admin_reserve_profile_photo_upload", {
        p_admin_profile_id: current.moderatorId,
        p_object_name: protectedUploadPath,
        p_profile_id: current.targetId,
        p_size_bytes: 128,
      }),
      client.rpc("admin_attach_profile_photo", {
        p_admin_profile_id: current.moderatorId,
        p_object_name: protectedUploadPath,
        p_profile_id: current.targetId,
      }),
    ];

    for (const operation of rpcCalls(current.publicClient)) {
      const { data, error } = await operation;
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    }

    const { error: signInError } = await current.authenticated.auth.signInWithPassword(
      {
        email: current.targetEmail,
        password: PASSWORD,
      },
    );
    expect(signInError).toBeNull();

    for (const operation of rpcCalls(current.authenticated)) {
      const { data, error } = await operation;
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    }

    const { data: untouched, error: untouchedError } = await current.admin
      .from("profiles")
      .select("country")
      .eq("id", current.targetId)
      .single<{ country: string | null }>();
    expect(untouchedError).toBeNull();
    expect(untouched?.country).toBe("Germany");
  });

  test("service-role update is revision locked and writes one atomic audit record", async () => {
    const current = fixture as Fixture;
    const update = await current.admin.rpc("admin_update_profile_details", {
      p_admin_profile_id: current.moderatorId,
      p_expected_version: current.initialVersion,
      p_profile_id: current.targetId,
      p_updates: {
        bio: "Corrected by the profile support team.",
        city: "Stockholm",
        country: "Sweden",
        date_of_birth: "1992-04-18",
        phone_country_code: "+46",
        phone_number: "701234567",
      },
    });

    expect(update.error).toBeNull();
    const updateData = update.data as AdminUpdateResult;
    expect(updateData).toMatchObject({
      applied: true,
      profile_id: current.targetId,
      reason: "updated",
    });
    expect(updateData.version).toMatch(/^[0-9a-f]{64}$/);
    expect(updateData.changed_fields).toEqual(
      expect.arrayContaining([
        "bio",
        "city",
        "country",
        "date_of_birth",
        "phone_country_code",
        "phone_number",
      ]),
    );

    const [{ data: updatedProfile, error: profileError }, auditAfterUpdate] =
      await Promise.all([
        current.admin
          .from("profiles")
          .select(
            "bio, birth_date, city, country, date_of_birth, phone_country_code, phone_number",
          )
          .eq("id", current.targetId)
          .single(),
        current.admin
          .from("admin_audit_log")
          .select(
            "action, metadata, target_profile_id, target_resource_id, target_resource_type",
          )
          .eq("admin_profile_id", current.moderatorId)
          .eq("target_profile_id", current.targetId)
          .eq("action", "admin_update_profile_details"),
      ]);

    expect(profileError).toBeNull();
    expect(updatedProfile).toMatchObject({
      bio: "Corrected by the profile support team.",
      birth_date: "1992-04-18",
      city: "Stockholm",
      country: "Sweden",
      date_of_birth: "1992-04-18",
      phone_country_code: "+46",
      phone_number: "701234567",
    });
    expect(auditAfterUpdate.error).toBeNull();
    expect(auditAfterUpdate.data).toHaveLength(1);
    expect(auditAfterUpdate.data?.[0]).toMatchObject({
      action: "admin_update_profile_details",
      target_profile_id: current.targetId,
      target_resource_id: current.targetId,
      target_resource_type: "profile",
    });
    expect(auditAfterUpdate.data?.[0]?.metadata).toMatchObject({
      changedFields: expect.arrayContaining(["bio", "country"]),
      versions: {
        after: updateData.version,
        before: current.initialVersion,
      },
    });

    const stale = await current.admin.rpc("admin_update_profile_details", {
      p_admin_profile_id: current.moderatorId,
      p_expected_version: current.initialVersion,
      p_profile_id: current.targetId,
      p_updates: { country: "United Kingdom" },
    });
    expect(stale.error).toBeNull();
    expect(stale.data as AdminUpdateResult).toMatchObject({
      applied: false,
      current_version: updateData.version,
      profile_id: current.targetId,
      reason: "stale",
    });

    const invalid = await current.admin.rpc("admin_update_profile_details", {
      p_admin_profile_id: current.moderatorId,
      p_expected_version: updateData.version,
      p_profile_id: current.targetId,
      p_updates: {
        country: "Denmark",
        is_admin: true,
      },
    });
    expect(invalid.data).toBeNull();
    expect(invalid.error).not.toBeNull();

    const [{ data: unchangedProfile }, { count: updateAuditCount }] =
      await Promise.all([
        current.admin
          .from("profiles")
          .select("country")
          .eq("id", current.targetId)
          .single(),
        current.admin
          .from("admin_audit_log")
          .select("id", { count: "exact", head: true })
          .eq("admin_profile_id", current.moderatorId)
          .eq("target_profile_id", current.targetId)
          .eq("action", "admin_update_profile_details"),
      ]);
    expect(unchangedProfile?.country).toBe("Sweden");
    expect(updateAuditCount).toBe(1);

    const { data: moderatorVersion, error: moderatorVersionError } =
      await current.admin.rpc("admin_profile_edit_version", {
        p_profile_id: current.moderatorId,
      });
    expect(moderatorVersionError).toBeNull();

    const adminTargetUpdate = await current.admin.rpc(
      "admin_update_profile_details",
      {
        p_admin_profile_id: current.moderatorId,
        p_expected_version: moderatorVersion,
        p_profile_id: current.moderatorId,
        p_updates: { bio: "Admins must remain protected." },
      },
    );
    expect(adminTargetUpdate.data).toBeNull();
    expect(adminTargetUpdate.error).not.toBeNull();

    const { count: rejectedAdminAuditCount } = await current.admin
      .from("admin_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("admin_profile_id", current.moderatorId)
      .eq("target_profile_id", current.moderatorId)
      .eq("action", "admin_update_profile_details");
    expect(rejectedAdminAuditCount).toBe(0);

    const { data: currentVersion, error: currentVersionError } =
      await current.admin.rpc("admin_profile_edit_version", {
        p_profile_id: current.targetId,
      });
    expect(currentVersionError).toBeNull();

    const forgedAdminUpdate = await current.admin.rpc(
      "admin_update_profile_details",
      {
        p_admin_profile_id: current.targetId,
        p_expected_version: currentVersion,
        p_profile_id: current.targetId,
        p_updates: { city: "Copenhagen" },
      },
    );
    expect(forgedAdminUpdate.data).toBeNull();
    expect(forgedAdminUpdate.error).not.toBeNull();

    const forgedAdminPhoto = await current.admin.rpc(
      "admin_set_primary_profile_photo",
      {
        p_admin_profile_id: current.targetId,
        p_photo_id: current.primaryPhotoId,
      },
    );
    expect(forgedAdminPhoto.data).toBeNull();
    expect(forgedAdminPhoto.error).not.toBeNull();

    const { data: moderatorPhoto, error: moderatorPhotoError } =
      await current.admin
        .from("profile_photos")
        .insert({
          is_primary: true,
          profile_id: current.moderatorId,
          sort_order: 0,
          storage_path: `${current.moderatorId}/protected-admin-photo.webp`,
        })
        .select("id")
        .single<{ id: string }>();
    expect(moderatorPhotoError).toBeNull();

    const adminTargetPhoto = await current.admin.rpc(
      "admin_set_primary_profile_photo",
      {
        p_admin_profile_id: current.moderatorId,
        p_photo_id: moderatorPhoto?.id,
      },
    );
    expect(adminTargetPhoto.data).toBeNull();
    expect(adminTargetPhoto.error).not.toBeNull();
  });

  test("concurrent profile edits serialize one update and one stale response", async () => {
    const current = fixture as Fixture;
    const [{ data: version, error: versionError }, beforeAudit] =
      await Promise.all([
        current.admin.rpc("admin_profile_edit_version", {
          p_profile_id: current.targetId,
        }),
        current.admin
          .from("admin_audit_log")
          .select("id", { count: "exact", head: true })
          .eq("admin_profile_id", current.moderatorId)
          .eq("target_profile_id", current.targetId)
          .eq("action", "admin_update_profile_details"),
      ]);
    expect(versionError).toBeNull();
    expect(beforeAudit.error).toBeNull();

    const attempts = await Promise.all([
      current.admin.rpc("admin_update_profile_details", {
        p_admin_profile_id: current.moderatorId,
        p_expected_version: version,
        p_profile_id: current.targetId,
        p_updates: { city: "Copenhagen" },
      }),
      current.admin.rpc("admin_update_profile_details", {
        p_admin_profile_id: current.moderatorId,
        p_expected_version: version,
        p_profile_id: current.targetId,
        p_updates: { city: "Oslo" },
      }),
    ]);

    expect(attempts.map((attempt) => attempt.error)).toEqual([null, null]);
    const outcomes = attempts
      .map((attempt) => (attempt.data as AdminUpdateResult).reason)
      .sort();
    expect(outcomes).toEqual(["stale", "updated"]);

    const afterAudit = await current.admin
      .from("admin_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("admin_profile_id", current.moderatorId)
      .eq("target_profile_id", current.targetId)
      .eq("action", "admin_update_profile_details");
    expect(afterAudit.error).toBeNull();
    expect(afterAudit.count).toBe((beforeAudit.count ?? 0) + 1);
  });

  test("admin can promote an existing second photo with one audit record", async () => {
    const current = fixture as Fixture;
    const result = await current.admin.rpc("admin_set_primary_profile_photo", {
      p_admin_profile_id: current.moderatorId,
      p_photo_id: current.secondaryPhotoId,
    });

    expect(result.error).toBeNull();
    expect(result.data as AdminPhotoResult).toMatchObject({
      applied: true,
      photo_id: current.secondaryPhotoId,
      profile_id: current.targetId,
      reason: "updated",
      unchanged: false,
    });

    const [{ data: photos, error: photosError }, auditResult] =
      await Promise.all([
        current.admin
          .from("profile_photos")
          .select("id, is_primary")
          .eq("profile_id", current.targetId)
          .order("sort_order", { ascending: true }),
        current.admin
          .from("admin_audit_log")
          .select(
            "action, metadata, target_profile_id, target_resource_id, target_resource_type",
          )
          .eq("admin_profile_id", current.moderatorId)
          .eq("target_profile_id", current.targetId)
          .eq("action", "admin_set_primary_profile_photo"),
      ]);

    expect(photosError).toBeNull();
    expect(photos).toEqual([
      { id: current.primaryPhotoId, is_primary: false },
      { id: current.secondaryPhotoId, is_primary: true },
    ]);
    expect(auditResult.error).toBeNull();
    expect(auditResult.data).toHaveLength(1);
    expect(auditResult.data?.[0]).toMatchObject({
      action: "admin_set_primary_profile_photo",
      metadata: {
        changedFields: ["primary_profile_photo"],
      },
      target_profile_id: current.targetId,
      target_resource_id: current.secondaryPhotoId,
      target_resource_type: "profile_photo",
    });

    const unchanged = await current.admin.rpc(
      "admin_set_primary_profile_photo",
      {
        p_admin_profile_id: current.moderatorId,
        p_photo_id: current.secondaryPhotoId,
      },
    );
    expect(unchanged.error).toBeNull();
    expect(unchanged.data as AdminPhotoResult).toMatchObject({
      applied: true,
      reason: "unchanged",
      unchanged: true,
    });

    const { count: photoAuditCount } = await current.admin
      .from("admin_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("admin_profile_id", current.moderatorId)
      .eq("target_profile_id", current.targetId)
      .eq("action", "admin_set_primary_profile_photo");
    expect(photoAuditCount).toBe(1);
  });

  test("admin upload uses the member quota ledger and attaches one audited main photo", async () => {
    const current = fixture as Fixture;
    const storagePath = `${current.targetId}/${randomUUID()}.png`;
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );

    try {
      const { error: incompleteError } = await current.admin
        .from("profiles")
        .update({ onboarding_completed: false })
        .eq("id", current.targetId);
      expect(incompleteError).toBeNull();

      const { error: fillPhotoSlotsError } = await current.admin
        .from("profile_photos")
        .insert(
          [2, 3, 4].map((sortOrder) => ({
            is_primary: false,
            profile_id: current.targetId,
            sort_order: sortOrder,
            storage_path: `${current.targetId}/admin-edit-slot-${sortOrder}.webp`,
          })),
        );
      expect(fillPhotoSlotsError).toBeNull();

      const reservation = await current.admin.rpc(
        "admin_reserve_profile_photo_upload",
        {
          p_admin_profile_id: current.moderatorId,
          p_object_name: storagePath,
          p_profile_id: current.targetId,
          p_size_bytes: pngBytes.byteLength,
        },
      );
      expect(reservation.error).toBeNull();
      expect(reservation.data).toBe(true);

      const { error: uploadError } = await current.admin.storage
        .from("profile-photos")
        .upload(storagePath, pngBytes, {
          contentType: "image/png",
          upsert: false,
        });
      expect(uploadError).toBeNull();

      const attachment = await current.admin.rpc(
        "admin_attach_profile_photo",
        {
          p_admin_profile_id: current.moderatorId,
          p_object_name: storagePath,
          p_profile_id: current.targetId,
        },
      );
      expect(attachment.error).toBeNull();
      expect(attachment.data).toMatchObject({
        applied: true,
        profile_id: current.targetId,
        replaced_photo_id: current.secondaryPhotoId,
        storage_path: storagePath,
      });

      const repeatedAttachment = await current.admin.rpc(
        "admin_attach_profile_photo",
        {
          p_admin_profile_id: current.moderatorId,
          p_object_name: storagePath,
          p_profile_id: current.targetId,
        },
      );
      expect(repeatedAttachment.error).toBeNull();
      expect(repeatedAttachment.data).toMatchObject({
        applied: true,
        photo_id: (attachment.data as { photo_id: string }).photo_id,
        unchanged: true,
      });

      const [
        { data: ledger, error: ledgerError },
        photoResult,
        auditResult,
        photoCountResult,
        replacedPhotoResult,
      ] =
        await Promise.all([
          current.admin
            .from("storage_upload_usage_events")
            .select(
              "admin_profile_photo_expected_version, admin_profile_photo_replacement_id, admin_profile_photo_reserved_by, committed_at, deleted_at, size_bytes, uploader_id",
            )
            .eq("bucket_id", "profile-photos")
            .eq("object_name", storagePath)
            .single(),
          current.admin
            .from("profile_photos")
            .select("id, is_primary")
            .eq("storage_path", storagePath)
            .single(),
          current.admin
            .from("admin_audit_log")
            .select("action, target_profile_id, target_resource_type")
            .eq("admin_profile_id", current.moderatorId)
            .eq("target_profile_id", current.targetId)
            .eq("action", "admin_upload_profile_photo")
            .single(),
          current.admin
            .from("profile_photos")
            .select("id", { count: "exact", head: true })
            .eq("profile_id", current.targetId),
          current.admin
            .from("profile_photos")
            .select("id")
            .eq("id", current.secondaryPhotoId)
            .maybeSingle(),
        ]);

      expect(ledgerError).toBeNull();
      expect(ledger).toMatchObject({
        deleted_at: null,
        size_bytes: pngBytes.byteLength,
        uploader_id: current.targetId,
      });
      expect(ledger?.admin_profile_photo_expected_version).toMatch(
        /^[0-9a-f]{64}$/,
      );
      expect(ledger?.admin_profile_photo_replacement_id).toBe(
        current.secondaryPhotoId,
      );
      expect(ledger?.admin_profile_photo_reserved_by).toBe(current.moderatorId);
      expect(ledger?.committed_at).toBeTruthy();
      expect(photoResult.error).toBeNull();
      expect(photoResult.data?.is_primary).toBe(true);
      expect(auditResult.error).toBeNull();
      expect(auditResult.data).toMatchObject({
        action: "admin_upload_profile_photo",
        target_profile_id: current.targetId,
        target_resource_type: "profile_photo",
      });
      expect(photoCountResult.error).toBeNull();
      expect(photoCountResult.count).toBe(5);
      expect(replacedPhotoResult.error).toBeNull();
      expect(replacedPhotoResult.data).toBeNull();

      const { count: uploadAuditCount, error: uploadAuditCountError } =
        await current.admin
          .from("admin_audit_log")
          .select("id", { count: "exact", head: true })
          .eq("admin_profile_id", current.moderatorId)
          .eq("target_profile_id", current.targetId)
          .eq("action", "admin_upload_profile_photo");
      expect(uploadAuditCountError).toBeNull();
      expect(uploadAuditCount).toBe(1);
    } finally {
      const { error: profileRestoreError } = await current.admin
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", current.targetId);
      if (profileRestoreError) throw new Error(profileRestoreError.message);

      const { error: referenceDeleteError } = await current.admin
        .from("profile_photos")
        .delete()
        .eq("storage_path", storagePath);
      if (referenceDeleteError) throw new Error(referenceDeleteError.message);

      const { error: storageDeleteError } = await current.admin.storage
        .from("profile-photos")
        .remove([storagePath]);
      if (storageDeleteError) throw new Error(storageDeleteError.message);
    }
  });
});
