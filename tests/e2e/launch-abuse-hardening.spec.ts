import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { getSupabaseCredentials } from "./helpers/supabase-local";

const PASSWORD = "TestPassword123!";

type AbuseFixture = {
  admin: SupabaseClient;
  anonymous: SupabaseClient;
  auPair: SupabaseClient;
  auPairId: string;
  family: SupabaseClient;
  familyId: string;
  observer: SupabaseClient;
  observerId: string;
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

async function cleanupFixtureUsers(admin: SupabaseClient, userIds: string[]) {
  if (userIds.length === 0) {
    return;
  }

  await admin
    .from("storage_upload_usage_events")
    .delete()
    .in("uploader_id", userIds);
  await admin
    .from("storage_upload_attempt_counters")
    .delete()
    .in("user_id", userIds);
  await admin
    .from("profile_favorite_toggle_counters")
    .delete()
    .in("user_id", userIds);
  await admin
    .from("profile_safety_action_counters")
    .delete()
    .in("user_id", userIds);
  await admin.from("profile_favorites").delete().in("user_id", userIds);
  await admin.from("profile_blocks").delete().in("blocker_id", userIds);
  await admin
    .from("profile_block_events")
    .delete()
    .in("blocker_id", userIds);
  await admin.from("profile_photos").delete().in("profile_id", userIds);

  await Promise.allSettled(
    userIds.map((userId) => admin.auth.admin.deleteUser(userId)),
  );
  await admin.from("profiles").delete().in("id", userIds);
}

async function createAbuseFixture(): Promise<AbuseFixture> {
  const admin = createAdminClient();
  const anonymous = createPublicClient();
  const family = createPublicClient();
  const auPair = createPublicClient();
  const observer = createPublicClient();
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const definitions = [
    {
      accountType: "family",
      client: family,
      email: `qa-abuse-family-${suffix}@example.com`,
      label: "Family",
    },
    {
      accountType: "au_pair",
      client: auPair,
      email: `qa-abuse-aupair-${suffix}@example.com`,
      label: "AuPair",
    },
    {
      accountType: "family",
      client: observer,
      email: `qa-abuse-observer-${suffix}@example.com`,
      label: "Observer",
    },
  ] as const;
  const createdUsers: Array<{
    accountType: "au_pair" | "family";
    client: SupabaseClient;
    email: string;
    id: string;
    label: string;
  }> = [];

  try {
    for (const definition of definitions) {
      const result = await admin.auth.admin.createUser({
        email: definition.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { account_type: definition.accountType },
      });

      if (result.error || !result.data.user) {
        throw new Error(
          result.error?.message ?? `Could not create ${definition.label}.`,
        );
      }

      createdUsers.push({
        ...definition,
        id: result.data.user.id,
      });
    }

    const { error: profileError } = await admin.from("profiles").upsert(
      createdUsers.map((user) => ({
        id: user.id,
        email: user.email,
        account_type: user.accountType,
        full_name: `QA Abuse ${user.label} ${suffix}`,
        first_name: "QA",
        last_name: `${user.label}-${suffix}`,
        city: user.accountType === "family" ? "Berlin" : "London",
        country:
          user.accountType === "family" ? "Germany" : "United Kingdom",
        preferred_host_countries:
          user.accountType === "au_pair" ? ["Germany"] : [],
        onboarding_completed: true,
        public_slug: `qa-abuse-${user.label.toLowerCase()}-${suffix}`,
        content_moderation_status: "approved",
        last_active_at: new Date().toISOString(),
      })),
    );

    if (profileError) {
      throw new Error(profileError.message);
    }

    const { error: photoError } = await admin.from("profile_photos").insert(
      createdUsers.map((user) => ({
        profile_id: user.id,
        storage_path: `${user.id}/qa-abuse-${user.label.toLowerCase()}-${suffix}.webp`,
        is_primary: true,
      })),
    );

    if (photoError) {
      throw new Error(photoError.message);
    }

    const { error: moderationError } = await admin
      .from("profiles")
      .update({ content_moderation_status: "approved" })
      .in(
        "id",
        createdUsers.map((user) => user.id),
      );

    if (moderationError) {
      throw new Error(moderationError.message);
    }

    for (const user of createdUsers) {
      const signIn = await user.client.auth.signInWithPassword({
        email: user.email,
        password: PASSWORD,
      });

      if (signIn.error) {
        throw new Error(signIn.error.message);
      }
    }

    return {
      admin,
      anonymous,
      auPair,
      auPairId: createdUsers[1].id,
      family,
      familyId: createdUsers[0].id,
      observer,
      observerId: createdUsers[2].id,
      suffix,
    };
  } catch (error) {
    await cleanupFixtureUsers(
      admin,
      createdUsers.map((user) => user.id),
    );
    throw error;
  }
}

async function removeAbuseFixture(fixture: AbuseFixture) {
  await cleanupFixtureUsers(fixture.admin, [
    fixture.familyId,
    fixture.auPairId,
    fixture.observerId,
  ]);
}

test.describe("launch abuse hardening", () => {
  test.describe.configure({ mode: "serial" });

  test("keeps pre-auth media attempts in fixed shards with bounded cleanup", async () => {
    const admin = createAdminClient();
    const epoch = "2000-01-01T00:00:00.000Z";

    try {
      const reset = await admin
        .from("media_request_attempt_counters")
        .update({ request_count: 0, window_started_at: epoch })
        .neq("identity_hash", "qa-never-matches");
      expect(reset.error).toBeNull();

      const { count: initialSlotCount, error: initialSlotCountError } =
        await admin
          .from("media_request_attempt_counters")
          .select("scope", { count: "exact", head: true });
      expect(initialSlotCountError).toBeNull();
      expect(initialSlotCount).toBe(2_624);

      const invalidIdentity = await admin
        .from("media_request_attempt_counters")
        .insert({
          scope: "ip_10m",
          identity_hash: "a".repeat(64),
          window_started_at: new Date().toISOString(),
          request_count: 1,
        });
      expect(invalidIdentity.error).not.toBeNull();

      for (let index = 1; index <= 32; index += 1) {
        const reservation = await admin.rpc("reserve_media_request_attempt", {
          p_ip_hash: index.toString(16).padStart(64, "0"),
          p_ip_prefix_hash: index.toString(16).padStart(64, "f"),
        });
        expect(reservation.error).toBeNull();
        expect(reservation.data?.[0]?.allowed).toBe(true);
      }

      const { data: activeGlobalSlots, error: activeGlobalSlotsError } =
        await admin
          .from("media_request_attempt_counters")
          .select("identity_hash, request_count")
          .eq("scope", "global_10m")
          .gt("request_count", 0);
      expect(activeGlobalSlotsError).toBeNull();
      expect((activeGlobalSlots ?? []).length).toBeGreaterThan(1);
      expect(
        (activeGlobalSlots ?? []).every(
          ({ identity_hash }) =>
            /^s\d{4}$/.test(identity_hash) && identity_hash !== "all",
        ),
      ).toBe(true);

      await admin
        .from("media_request_attempt_counters")
        .update({ request_count: 0, window_started_at: epoch })
        .neq("identity_hash", "qa-never-matches");

      const fixedIpHash = "a".repeat(64);
      const fixedPrefixHash = "b".repeat(64);
      const firstFixedReservation = await admin.rpc(
        "reserve_media_request_attempt",
        {
          p_ip_hash: fixedIpHash,
          p_ip_prefix_hash: fixedPrefixHash,
        },
      );
      expect(firstFixedReservation.error).toBeNull();
      expect(firstFixedReservation.data?.[0]?.allowed).toBe(true);

      const { data: activeGlobalSlot, error: activeGlobalSlotError } =
        await admin
          .from("media_request_attempt_counters")
          .select("identity_hash, window_started_at")
          .eq("scope", "global_10m")
          .gt("request_count", 0)
          .single();
      expect(activeGlobalSlotError).toBeNull();

      const saturateGlobalSlot = await admin
        .from("media_request_attempt_counters")
        .update({ request_count: 1_562 })
        .eq("scope", "global_10m")
        .eq("identity_hash", activeGlobalSlot?.identity_hash);
      expect(saturateGlobalSlot.error).toBeNull();

      const deniedFixedReservation = await admin.rpc(
        "reserve_media_request_attempt",
        {
          p_ip_hash: fixedIpHash,
          p_ip_prefix_hash: fixedPrefixHash,
        },
      );
      expect(deniedFixedReservation.error).toBeNull();
      expect(deniedFixedReservation.data?.[0]?.allowed).toBe(false);
      expect(
        deniedFixedReservation.data?.[0]?.retry_after_seconds,
      ).toBeGreaterThan(0);

      const staleSlot = await admin
        .from("media_request_attempt_counters")
        .update({
          request_count: 9,
          window_started_at: new Date(Date.now() - 2 * 60 * 60 * 1_000)
            .toISOString(),
        })
        .eq("scope", "ip_10m")
        .eq("identity_hash", "s2047");
      expect(staleSlot.error).toBeNull();

      const cleanup = await admin.rpc(
        "cleanup_private_media_delivery_counters",
      );
      expect(cleanup.error).toBeNull();
      expect(cleanup.data).toBeGreaterThanOrEqual(1);

      const { data: cleanedSlot, error: cleanedSlotError } = await admin
        .from("media_request_attempt_counters")
        .select("request_count, window_started_at")
        .eq("scope", "ip_10m")
        .eq("identity_hash", "s2047")
        .single();
      expect(cleanedSlotError).toBeNull();
      expect(cleanedSlot?.request_count).toBe(0);
      expect(new Date(cleanedSlot?.window_started_at ?? 0).getUTCFullYear()).toBe(
        2000,
      );

      const { count: finalSlotCount, error: finalSlotCountError } = await admin
        .from("media_request_attempt_counters")
        .select("scope", { count: "exact", head: true });
      expect(finalSlotCountError).toBeNull();
      expect(finalSlotCount).toBe(2_624);
    } finally {
      await admin
        .from("media_request_attempt_counters")
        .update({ request_count: 0, window_started_at: epoch })
        .neq("identity_hash", "qa-never-matches");
    }
  });

  test("does not expose pair safety state through helper RPCs", async () => {
    const fixture = await createAbuseFixture();

    try {
      const anonymousLookup = await fixture.anonymous.rpc(
        "profile_pair_blocked",
        {
          p_first_profile_id: fixture.familyId,
          p_second_profile_id: fixture.auPairId,
        },
      );
      expect(anonymousLookup.error).not.toBeNull();

      const ownerFavoriteCheck = await fixture.family.rpc(
        "profile_favorite_pair_allowed",
        {
          p_actor_id: fixture.familyId,
          p_target_id: fixture.auPairId,
        },
      );
      const forgedFavoriteCheck = await fixture.observer.rpc(
        "profile_favorite_pair_allowed",
        {
          p_actor_id: fixture.familyId,
          p_target_id: fixture.auPairId,
        },
      );

      expect(ownerFavoriteCheck.error).toBeNull();
      expect(ownerFavoriteCheck.data).toBe(true);
      expect(forgedFavoriteCheck.error).toBeNull();
      expect(forgedFavoriteCheck.data).toBe(false);

      const conversation = await fixture.family.rpc(
        "create_or_get_conversation",
        { p_profile_id: fixture.auPairId },
      );
      expect(conversation.error).toBeNull();
      expect(conversation.data).toBeTruthy();

      const block = await fixture.family.rpc("block_profile", {
        p_blocked_profile_id: fixture.auPairId,
      });
      expect(block.error).toBeNull();
      expect(block.data?.ok).toBe(true);

      const ownerLookup = await fixture.family.rpc("profile_pair_blocked", {
        p_first_profile_id: fixture.familyId,
        p_second_profile_id: fixture.auPairId,
      });
      const forgedLookups = await Promise.all([
        fixture.observer.rpc("profile_pair_blocked", {
          p_first_profile_id: fixture.familyId,
          p_second_profile_id: fixture.auPairId,
        }),
        fixture.observer.rpc("profile_pair_blocked", {
          p_first_profile_id: fixture.auPairId,
          p_second_profile_id: fixture.familyId,
        }),
      ]);

      expect(ownerLookup.error).toBeNull();
      expect(ownerLookup.data).toBe(true);
      expect(forgedLookups.every(({ error }) => error === null)).toBe(true);
      expect(forgedLookups.every(({ data }) => data === false)).toBe(true);
    } finally {
      await removeAbuseFixture(fixture);
    }
  });

  test("makes storage reservations idempotent and bounds unique attempts", async () => {
    const fixture = await createAbuseFixture();
    const objectName = `${fixture.familyId}/idempotent-${fixture.suffix}.webp`;
    const allowedObjectName =
      `${fixture.familyId}/bounded-allowed-${fixture.suffix}.webp`;
    const deniedObjectName =
      `${fixture.familyId}/bounded-denied-${fixture.suffix}.webp`;

    try {
      const firstReservation = await fixture.family.rpc(
        "reserve_storage_upload_quota",
        {
          p_bucket_id: "profile-photos",
          p_object_name: objectName,
          p_size_bytes: 1_024,
        },
      );
      expect(firstReservation.error).toBeNull();
      expect(firstReservation.data).toBe(true);

      const internalReservation = await fixture.family.rpc(
        "reserve_storage_upload_quota_internal",
        {
          p_bucket_id: "profile-photos",
          p_object_name: `${fixture.familyId}/forbidden-internal.webp`,
          p_size_bytes: 1_024,
        },
      );
      expect(internalReservation.error).not.toBeNull();

      const initialLedgerResult = await fixture.admin
        .from("storage_upload_usage_events")
        .select("created_at, size_bytes")
        .eq("bucket_id", "profile-photos")
        .eq("object_name", objectName)
        .single();
      const initialCounterResult = await fixture.admin
        .from("storage_upload_attempt_counters")
        .select("attempt_count")
        .eq("user_id", fixture.familyId)
        .single();

      expect(initialLedgerResult.error).toBeNull();
      expect(initialCounterResult.error).toBeNull();
      expect(initialLedgerResult.data).toMatchObject({ size_bytes: 1_024 });
      expect(initialCounterResult.data?.attempt_count).toBe(1);

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const repeatedReservation = await fixture.family.rpc(
          "reserve_storage_upload_quota",
          {
            p_bucket_id: "profile-photos",
            p_object_name: objectName,
            p_size_bytes: 1_024,
          },
        );

        expect(repeatedReservation.error).toBeNull();
        expect(repeatedReservation.data).toBe(true);
      }

      const repeatedLedgerResult = await fixture.admin
        .from("storage_upload_usage_events")
        .select("created_at, size_bytes")
        .eq("bucket_id", "profile-photos")
        .eq("object_name", objectName)
        .single();
      const repeatedCounterResult = await fixture.admin
        .from("storage_upload_attempt_counters")
        .select("attempt_count")
        .eq("user_id", fixture.familyId)
        .single();

      expect(repeatedLedgerResult.error).toBeNull();
      expect(repeatedLedgerResult.data).toEqual(initialLedgerResult.data);
      expect(repeatedCounterResult.error).toBeNull();
      expect(repeatedCounterResult.data).toEqual(initialCounterResult.data);

      const primedCounter = await fixture.admin
        .from("storage_upload_attempt_counters")
        .upsert({
          user_id: fixture.familyId,
          window_started_at: new Date().toISOString(),
          attempt_count: 59,
        });
      expect(primedCounter.error).toBeNull();

      const allowedReservation = await fixture.family.rpc(
        "reserve_storage_upload_quota",
        {
          p_bucket_id: "profile-photos",
          p_object_name: allowedObjectName,
          p_size_bytes: 1_024,
        },
      );
      const deniedReservation = await fixture.family.rpc(
        "reserve_storage_upload_quota",
        {
          p_bucket_id: "profile-photos",
          p_object_name: deniedObjectName,
          p_size_bytes: 1_024,
        },
      );

      expect(allowedReservation.error).toBeNull();
      expect(allowedReservation.data).toBe(true);
      expect(deniedReservation.error).toBeNull();
      expect(deniedReservation.data).toBe(false);

      const saturatedCounter = await fixture.admin
        .from("storage_upload_attempt_counters")
        .select("attempt_count")
        .eq("user_id", fixture.familyId)
        .single();
      const deniedLedger = await fixture.admin
        .from("storage_upload_usage_events")
        .select("object_name")
        .eq("bucket_id", "profile-photos")
        .eq("object_name", deniedObjectName)
        .maybeSingle();

      expect(saturatedCounter.error).toBeNull();
      expect(saturatedCounter.data?.attempt_count).toBe(60);
      expect(deniedLedger.error).toBeNull();
      expect(deniedLedger.data).toBeNull();
    } finally {
      await removeAbuseFixture(fixture);
    }
  });

  test("keeps favorite transitions RPC-only and bounded", async () => {
    const fixture = await createAbuseFixture();

    try {
      const directInsert = await fixture.family.from("profile_favorites").insert({
        user_id: fixture.familyId,
        profile_id: fixture.auPairId,
      });
      expect(directInsert.error).not.toBeNull();

      const initialFavorite = await fixture.family.rpc(
        "toggle_profile_favorite",
        { p_profile_id: fixture.auPairId },
      );
      expect(initialFavorite.error).toBeNull();
      expect(initialFavorite.data).toBe(true);

      const directDelete = await fixture.family
        .from("profile_favorites")
        .delete()
        .eq("user_id", fixture.familyId)
        .eq("profile_id", fixture.auPairId);
      expect(directDelete.error).not.toBeNull();

      const favoriteAfterDirectDelete = await fixture.admin
        .from("profile_favorites")
        .select("id")
        .eq("user_id", fixture.familyId)
        .eq("profile_id", fixture.auPairId)
        .single();
      expect(favoriteAfterDirectDelete.error).toBeNull();

      const primedFavoriteCounter = await fixture.admin
        .from("profile_favorite_toggle_counters")
        .upsert({
          user_id: fixture.familyId,
          window_started_at: new Date().toISOString(),
          change_count: 39,
        });
      expect(primedFavoriteCounter.error).toBeNull();

      const finalAllowedToggle = await fixture.family.rpc(
        "toggle_profile_favorite",
        { p_profile_id: fixture.auPairId },
      );
      const deniedToggle = await fixture.family.rpc("toggle_profile_favorite", {
        p_profile_id: fixture.auPairId,
      });

      expect(finalAllowedToggle.error).toBeNull();
      expect(finalAllowedToggle.data).toBe(false);
      expect(deniedToggle.error).not.toBeNull();

      const favoriteCounter = await fixture.admin
        .from("profile_favorite_toggle_counters")
        .select("change_count")
        .eq("user_id", fixture.familyId)
        .single();
      const favoriteAfterLimit = await fixture.admin
        .from("profile_favorites")
        .select("id")
        .eq("user_id", fixture.familyId)
        .eq("profile_id", fixture.auPairId)
        .maybeSingle();

      expect(favoriteCounter.error).toBeNull();
      expect(favoriteCounter.data?.change_count).toBe(40);
      expect(favoriteAfterLimit.error).toBeNull();
      expect(favoriteAfterLimit.data).toBeNull();
    } finally {
      await removeAbuseFixture(fixture);
    }
  });

  test("records only real block and unblock transitions", async () => {
    const fixture = await createAbuseFixture();

    try {
      const conversation = await fixture.family.rpc(
        "create_or_get_conversation",
        { p_profile_id: fixture.auPairId },
      );
      expect(conversation.error).toBeNull();

      const firstBlock = await fixture.family.rpc("block_profile", {
        p_blocked_profile_id: fixture.auPairId,
      });
      expect(firstBlock.error).toBeNull();
      expect(firstBlock.data?.ok).toBe(true);
      expect(firstBlock.data?.changed).toBe(true);

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const repeatedBlock = await fixture.family.rpc("block_profile", {
          p_blocked_profile_id: fixture.auPairId,
        });
        expect(repeatedBlock.error).toBeNull();
        expect(repeatedBlock.data?.ok).toBe(true);
        expect(repeatedBlock.data?.changed).toBe(false);
      }

      const blockedEvents = await fixture.admin
        .from("profile_block_events")
        .select("id, action")
        .eq("blocker_id", fixture.familyId)
        .eq("blocked_profile_id", fixture.auPairId);
      const blockedCounter = await fixture.admin
        .from("profile_safety_action_counters")
        .select("change_count")
        .eq("user_id", fixture.familyId)
        .single();

      expect(blockedEvents.error).toBeNull();
      expect(blockedEvents.data).toHaveLength(1);
      expect(blockedEvents.data?.[0]?.action).toBe("blocked");
      expect(blockedCounter.error).toBeNull();
      expect(blockedCounter.data?.change_count).toBe(1);

      const firstUnblock = await fixture.family.rpc("unblock_profile", {
        p_blocked_profile_id: fixture.auPairId,
      });
      expect(firstUnblock.error).toBeNull();
      expect(firstUnblock.data?.ok).toBe(true);
      expect(firstUnblock.data?.changed).toBe(true);

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const repeatedUnblock = await fixture.family.rpc("unblock_profile", {
          p_blocked_profile_id: fixture.auPairId,
        });
        expect(repeatedUnblock.error).toBeNull();
        expect(repeatedUnblock.data?.ok).toBe(true);
        expect(repeatedUnblock.data?.changed).toBe(false);
      }

      const allEvents = await fixture.admin
        .from("profile_block_events")
        .select("id, action")
        .eq("blocker_id", fixture.familyId)
        .eq("blocked_profile_id", fixture.auPairId)
        .order("created_at", { ascending: true });
      const finalSafetyCounter = await fixture.admin
        .from("profile_safety_action_counters")
        .select("change_count")
        .eq("user_id", fixture.familyId)
        .single();

      expect(allEvents.error).toBeNull();
      expect(allEvents.data?.map(({ action }) => action)).toEqual([
        "blocked",
        "unblocked",
      ]);
      expect(finalSafetyCounter.error).toBeNull();
      expect(finalSafetyCounter.data?.change_count).toBe(2);
    } finally {
      await removeAbuseFixture(fixture);
    }
  });

});
