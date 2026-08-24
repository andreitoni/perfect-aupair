import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import {
  getLocalRateLimitHashSecret,
  getSupabaseCredentials,
} from "./helpers/supabase-local";

const PASSWORD = "TestPassword123!";
const EXPECTED_COUNTER_ROWS = 7_872;

type AccountType = "au_pair" | "family";

type FixtureProfile = {
  accountType: AccountType;
  childrenInfo: string | null;
  country: string;
  createdAt: string;
  email: string;
  id: string;
  missingAvailability: boolean;
  slug: string;
};

type CatalogItem = {
  account_type?: AccountType;
  activity_status?: string | null;
  availability_start_from?: string | null;
  children_info?: string | null;
  country?: string | null;
  created_at?: string | null;
  duration_min_months?: number | null;
  id: string;
};

type CatalogPayload = {
  countries: string[];
  current_page: number;
  items: CatalogItem[];
  page_size: number;
  total: number;
  total_is_capped: boolean;
  total_pages: number;
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

let rateLimitHashSecret: string | undefined;

function catalogHash(value: string) {
  rateLimitHashSecret ??= getLocalRateLimitHashSecret();
  return createHmac("sha256", rateLimitHashSecret)
    .update(value)
    .digest("hex");
}

async function avoidRateLimitWindowRollover() {
  const seconds = new Date().getUTCSeconds();

  if (seconds >= 50) {
    await new Promise((resolve) =>
      setTimeout(resolve, (61 - seconds) * 1_000),
    );
  }
}

async function saturateCatalogBudget({
  admin,
  ip,
  limit,
  scope,
}: {
  admin: SupabaseClient;
  ip: string;
  limit: number;
  scope: "count" | "landing" | "search";
}) {
  await avoidRateLimitWindowRollover();

  const prefix = `${ip.split(".").slice(0, 3).join(".")}.0/24`;
  const reservations: Awaited<
    ReturnType<typeof admin.rpc<"reserve_public_catalog_request">>
  >[] = [];

  for (let offset = 0; offset < limit + 1; offset += 4) {
    const batchSize = Math.min(4, limit + 1 - offset);
    reservations.push(
      ...(await Promise.all(
        Array.from({ length: batchSize }, () =>
          admin.rpc("reserve_public_catalog_request", {
            p_ip_hash: catalogHash(`ip:${ip}`),
            p_ip_prefix_hash: catalogHash(`ip-prefix:${prefix}`),
            p_scope: scope,
          }),
        ),
      )),
    );
  }

  for (const reservation of reservations) {
    expect(reservation.error).toBeNull();
  }

  const allowed = reservations.filter(
    (reservation) => reservation.data?.[0]?.allowed === true,
  );
  const denied = reservations.filter(
    (reservation) => reservation.data?.[0]?.allowed === false,
  );

  expect(allowed.length).toBeLessThanOrEqual(limit);
  expect(denied.length).toBeGreaterThanOrEqual(1);

  return {
    ipHash: catalogHash(`ip:${ip}`),
    prefixHash: catalogHash(`ip-prefix:${prefix}`),
  };
}

async function denyCatalogStorm({
  admin,
  ipHash,
  prefixHash,
  scope,
}: {
  admin: SupabaseClient;
  ipHash: string;
  prefixHash: string;
  scope: "count" | "landing" | "search";
}) {
  for (let offset = 0; offset < 100; offset += 4) {
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        admin.rpc("reserve_public_catalog_request", {
          p_ip_hash: ipHash,
          p_ip_prefix_hash: prefixHash,
          p_scope: scope,
        }),
      ),
    );

    for (const result of results) {
      expect(result.error).toBeNull();
      expect(result.data?.[0]?.allowed).toBe(false);
    }
  }
}

async function snapshotCatalogCounters(
  admin: SupabaseClient,
  scope: "count" | "landing" | "search",
) {
  const { data, error } = await admin
    .from("public_catalog_request_counters")
    .select("counter_kind, slot_no, request_count, window_started_at")
    .eq("request_scope", scope)
    .order("counter_kind")
    .order("slot_no");

  expect(error).toBeNull();
  return data ?? [];
}

function source(filePath: string) {
  return readFileSync(join(process.cwd(), filePath), "utf8");
}

async function createCatalogFixtures(admin: SupabaseClient) {
  const suffix = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const countryA = `Catalog-A-${suffix}`;
  const countryB = `Catalog-B-${suffix}`;
  const definitions: Array<{
    accountType: AccountType;
    childrenInfo: string | null;
    country: string;
    missingAvailability: boolean;
  }> = [
    ...Array.from({ length: 14 }, (_, index) => ({
      accountType: "family" as const,
      childrenInfo: index % 2 === 0 ? "2 children" : "1 child",
      country: index < 7 ? countryA : countryB,
      missingAvailability: index === 13,
    })),
    ...Array.from({ length: 11 }, () => ({
      accountType: "au_pair" as const,
      childrenInfo: null,
      country: `Catalog-AP-${suffix}`,
      missingAvailability: false,
    })),
  ];
  const profiles: FixtureProfile[] = [];

  for (const [index, definition] of definitions.entries()) {
    const email = `qa-catalog-${index}-${suffix}@example.com`;
    const authResult = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { account_type: definition.accountType },
    });

    if (authResult.error || !authResult.data.user) {
      throw new Error(
        authResult.error?.message ?? "Could not create catalog fixture.",
      );
    }

    profiles.push({
      ...definition,
      createdAt: new Date(
        Date.now() - Math.floor(index / 2) * 1_000,
      ).toISOString(),
      email,
      id: authResult.data.user.id,
      slug: `qa-catalog-${definition.accountType}-${index}-${suffix}`,
    });
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    profiles.map((profile, index) => ({
      id: profile.id,
      email: profile.email,
      account_type: profile.accountType,
      onboarding_completed: true,
      public_slug: profile.slug,
      full_name:
        profile.accountType === "family"
          ? `QA Catalog Family ${index} ${suffix}`
          : `QA Catalog Au Pair ${index} ${suffix}`,
      first_name: profile.accountType === "au_pair" ? `Catalog${index}` : null,
      last_name: profile.accountType === "au_pair" ? "Fixture" : null,
      preferred_host_countries:
        profile.accountType === "au_pair" ? ["Germany"] : [],
      country: profile.country,
      city: "Berlin",
      created_at: profile.createdAt,
      last_active_at:
        index % 3 === 0
          ? new Date().toISOString()
          : new Date(Date.now() - 12 * 60 * 60 * 1_000).toISOString(),
      availability_start: profile.missingAvailability
        ? null
        : "Sep 2026 - Dec 2026",
      availability_start_from: profile.missingAvailability
        ? null
        : "2026-09-01",
      availability_start_to: profile.missingAvailability
        ? null
        : "2026-12-01",
      duration: profile.missingAvailability ? null : "6-12 months",
      duration_min_months: profile.missingAvailability ? null : 6,
      duration_max_months: profile.missingAvailability ? null : 12,
      children_info: profile.childrenInfo,
      au_pair_allowance_amount:
        profile.accountType === "family" ? 20_000 : null,
      au_pair_allowance_currency: "EUR",
      smoking_status:
        profile.accountType === "au_pair" ? "non_smoker" : null,
      gender: profile.accountType === "au_pair" ? "female" : null,
      birth_date: profile.accountType === "au_pair" ? "2000-01-01" : null,
      date_of_birth:
        profile.accountType === "au_pair" ? "2000-01-01" : null,
      content_moderation_status: "approved",
      content_moderation_reviewed_at: new Date().toISOString(),
      content_moderation_reason: "QA bounded catalog fixture.",
      is_admin: false,
    })),
  );

  if (profileError) throw new Error(profileError.message);

  const { error: photoError } = await admin.from("profile_photos").insert(
    profiles.map((profile) => ({
      profile_id: profile.id,
      storage_path: `${profile.id}/qa-public-catalog.webp`,
      is_primary: true,
      sort_order: 0,
    })),
  );

  if (photoError) throw new Error(photoError.message);

  const familyProfiles = profiles.filter(
    (profile) => profile.accountType === "family",
  );
  const auPairProfiles = profiles.filter(
    (profile) => profile.accountType === "au_pair",
  );
  const superstar = familyProfiles[12];
  const discoveryProfile = familyProfiles[11];

  if (!superstar || !discoveryProfile || auPairProfiles.length === 0) {
    throw new Error("Could not prepare recommended-ranking fixtures.");
  }

  const richProfileUpdates = [
    {
      id: superstar.id,
      created_at: new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1_000,
      ).toISOString(),
      last_active_at: new Date(
        Date.now() - 10 * 24 * 60 * 60 * 1_000,
      ).toISOString(),
    },
    {
      id: discoveryProfile.id,
      created_at: new Date(
        Date.now() - 25 * 24 * 60 * 60 * 1_000,
      ).toISOString(),
      last_active_at: new Date(
        Date.now() - 10 * 24 * 60 * 60 * 1_000,
      ).toISOString(),
    },
  ];

  for (const profileUpdate of richProfileUpdates) {
    const { error } = await admin
      .from("profiles")
      .update({
        accommodation_info:
          "A private, furnished room with everything needed for a comfortable stay.",
        bio: "A detailed and welcoming host family profile. ".repeat(10),
        created_at: profileUpdate.created_at,
        expectations:
          "We value thoughtful communication, reliability, kindness, and mutual respect.",
        fluent_languages: ["English", "German"],
        last_active_at: profileUpdate.last_active_at,
        mother_tongue: "German",
        verification_status: "verified",
      })
      .eq("id", profileUpdate.id);

    if (error) throw new Error(error.message);
  }

  const { error: extraPhotoError } = await admin.from("profile_photos").insert(
    [superstar, discoveryProfile].flatMap((profile) =>
      Array.from({ length: 3 }, (_, index) => ({
        profile_id: profile.id,
        storage_path: `${profile.id}/qa-ranking-${index + 2}.webp`,
        is_primary: false,
        sort_order: index + 1,
      })),
    ),
  );

  if (extraPhotoError) throw new Error(extraPhotoError.message);

  const { error: approvalError } = await admin
    .from("profiles")
    .update({
      content_moderation_status: "approved",
      content_moderation_reviewed_at: new Date().toISOString(),
      content_moderation_reason: "QA bounded catalog fixture approved.",
    })
    .in(
      "id",
      profiles.map((profile) => profile.id),
    );

  if (approvalError) throw new Error(approvalError.message);

  const interactionTimestamp = new Date().toISOString();
  const { error: viewError } = await admin.from("profile_views").insert(
    auPairProfiles.map((profile) => ({
      viewer_id: profile.id,
      profile_id: superstar.id,
      first_viewed_at: interactionTimestamp,
      last_viewed_at: interactionTimestamp,
      view_count: 1,
    })),
  );
  if (viewError) throw new Error(viewError.message);

  const { error: favoriteError } = await admin.from("profile_favorites").insert(
    auPairProfiles.map((profile) => ({
      user_id: profile.id,
      profile_id: superstar.id,
      created_at: interactionTimestamp,
    })),
  );
  if (favoriteError) throw new Error(favoriteError.message);

  const { error: conversationError } = await admin.from("conversations").insert(
    auPairProfiles.map((profile) => ({
      family_id: superstar.id,
      au_pair_id: profile.id,
      created_at: interactionTimestamp,
    })),
  );
  if (conversationError) throw new Error(conversationError.message);

  return {
    countryA,
    countryB,
    discoveryProfileId: discoveryProfile.id,
    profiles,
    superstarId: superstar.id,
  };
}

async function cleanupCatalogFixtures(
  admin: SupabaseClient,
  profiles: FixtureProfile[],
) {
  await Promise.allSettled(
    profiles.map((profile) => admin.auth.admin.deleteUser(profile.id)),
  );
}

async function loadCatalog(
  admin: SupabaseClient,
  parameters: {
    accountType: AccountType;
    filters?: Record<string, string>;
    guestPageLimit?: number | null;
    includeCountries?: boolean;
    page?: number;
    pageSize?: number;
    sort?: "recommended" | "newest" | "oldest" | "recently_active";
    viewerId?: string | null;
  },
) {
  const { data, error } = await admin.rpc("get_bounded_public_profile_cards", {
    p_account_type: parameters.accountType,
    p_filters: parameters.filters ?? {},
    p_viewer_id: parameters.viewerId ?? null,
    p_sort: parameters.sort ?? "recommended",
    p_page: parameters.page ?? 1,
    p_page_size: parameters.pageSize ?? 5,
    p_guest_page_limit: parameters.guestPageLimit ?? null,
    p_include_countries: parameters.includeCountries ?? true,
  });

  if (error) throw new Error(error.message);
  return data as CatalogPayload;
}

async function expectServiceOnlyCatalogRpcsDenied(
  client: SupabaseClient,
  spoofedViewerId: string,
) {
  const calls = [
    {
      name: "reserve_public_catalog_request",
      parameters: {
        p_ip_hash: "a".repeat(64),
        p_ip_prefix_hash: "b".repeat(64),
        p_scope: "count",
      },
    },
    {
      name: "get_bounded_public_profile_cards",
      parameters: {
        p_account_type: "family",
        p_filters: {},
        p_viewer_id: spoofedViewerId,
        p_sort: "newest",
        p_page: 1,
        p_page_size: 5,
        p_guest_page_limit: null,
        p_include_countries: true,
      },
    },
    {
      name: "get_bounded_public_story_cards",
      parameters: {
        p_account_type: "family",
        p_viewer_id: spoofedViewerId,
      },
    },
    {
      name: "get_featured_public_profile_cards",
      parameters: { p_limit: 5 },
    },
    {
      name: "get_bounded_public_profile_sitemap_entries",
      parameters: { p_limit: 3 },
    },
  ] as const;

  for (const call of calls) {
    const result = await client.rpc(call.name, call.parameters);

    expect(result.data, `${call.name} must not return browser data`).toBeNull();
    expect(result.error?.message, `${call.name} must stay service-only`).toMatch(
      /permission denied|service role required/i,
    );
  }

  const exposureRead = await client
    .from("profile_catalog_exposures")
    .select("profile_id")
    .limit(1);
  expect(exposureRead.data).toBeNull();
  expect(exposureRead.error?.message).toMatch(/permission denied/i);
}

test.describe("bounded public catalog", () => {
  test.describe.configure({ mode: "serial" });

  test("filters and paginates a multi-page dataset without enumeration", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const admin = createAdminClient();
    const publicClient = createPublicClient();
    const authenticatedClient = createPublicClient();
    let fixtures: Awaited<ReturnType<typeof createCatalogFixtures>> | null = null;

    try {
      fixtures = await createCatalogFixtures(admin);
      const families = fixtures.profiles.filter(
        (profile) => profile.accountType === "family",
      );
      const fixtureFilters = {
        allowanceCurrency: "EUR",
        allowanceMin: "19999",
      };
      const viewer = fixtures.profiles.find(
        (profile) => profile.accountType === "au_pair",
      );

      if (!viewer) throw new Error("Catalog viewer fixture is missing.");

      const recentlyActiveProfile = families[2];
      if (!recentlyActiveProfile) {
        throw new Error("Recently active catalog fixture is missing.");
      }

      const { error: recentlyActiveError } = await admin
        .from("profiles")
        .update({
          last_active_at: new Date(Date.now() - 10 * 60 * 1_000).toISOString(),
        })
        .eq("id", recentlyActiveProfile.id);
      if (recentlyActiveError) throw new Error(recentlyActiveError.message);

      const spoofedViewer = families[1];
      const signIn = await authenticatedClient.auth.signInWithPassword({
        email: viewer.email,
        password: PASSWORD,
      });

      expect(signIn.error).toBeNull();
      expect(signIn.data.user?.id).toBe(viewer.id);
      expect(spoofedViewer.id).not.toBe(viewer.id);

      const { error: blockError } = await admin.from("profile_blocks").insert({
        blocker_id: viewer.id,
        blocked_profile_id: families[0].id,
      });
      if (blockError) throw new Error(blockError.message);

      for (const legacyRpc of [
        "get_au_pair_search_cards",
        "get_family_search_cards",
        "get_active_story_cards",
      ] as const) {
        const publicResult = await publicClient.rpc(
          legacyRpc,
          legacyRpc === "get_active_story_cards"
            ? { p_account_type: "family" }
            : undefined,
        );
        const serviceResult = await admin.rpc(
          legacyRpc,
          legacyRpc === "get_active_story_cards"
            ? { p_account_type: "family" }
            : undefined,
        );

        expect(publicResult.data).toBeNull();
        expect(publicResult.error?.message).toMatch(/permission denied/i);
        expect(serviceResult.data).toBeNull();
        expect(serviceResult.error?.message).toMatch(/permission denied/i);
      }

      await expectServiceOnlyCatalogRpcsDenied(
        publicClient,
        spoofedViewer.id,
      );
      await expectServiceOnlyCatalogRpcsDenied(
        authenticatedClient,
        spoofedViewer.id,
      );

      const firstPage = await loadCatalog(admin, {
        accountType: "family",
        filters: fixtureFilters,
        page: 1,
        pageSize: 5,
        viewerId: viewer.id,
      });
      const secondPage = await loadCatalog(admin, {
        accountType: "family",
        filters: fixtureFilters,
        page: 2,
        pageSize: 5,
        viewerId: viewer.id,
      });
      const repeatedFirstPage = await loadCatalog(admin, {
        accountType: "family",
        filters: fixtureFilters,
        page: 1,
        pageSize: 5,
        viewerId: viewer.id,
      });
      const firstIds = firstPage.items.map((profile) => profile.id);
      const secondIds = secondPage.items.map((profile) => profile.id);

      expect(firstPage.total).toBe(13);
      expect(firstPage.items).toHaveLength(5);
      expect(secondPage.items).toHaveLength(5);
      expect(repeatedFirstPage.items.map((profile) => profile.id)).toEqual(
        firstIds,
      );
      expect(firstIds[0]).toBe(fixtures.superstarId);
      expect(firstIds).toContain(fixtures.discoveryProfileId);
      const { data: superstarExposure, error: exposureError } = await admin
        .from("profile_catalog_exposures")
        .select("profile_id")
        .eq("profile_id", fixtures.superstarId)
        .maybeSingle();
      expect(exposureError).toBeNull();
      expect(superstarExposure).toBeNull();
      expect(new Set([...firstIds, ...secondIds]).size).toBe(10);
      expect(firstIds).not.toContain(families[0].id);
      expect(firstPage.items.every((item) => item.account_type === "family")).toBe(
        true,
      );

      await page.goto("/");
      await expect(page.locator("article")).toHaveCount(12);
      await expect(
        page.getByRole("link", { name: "Page 2", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Page 3", exact: true }),
      ).toBeVisible();

      await page.getByRole("link", { name: "Page 2", exact: true }).click();
      await expect(page).toHaveURL(/\?page=2$/);
      await expect(page.locator("article")).toHaveCount(12);
      await expect(
        page.getByRole("link", { name: "Current page, page 2", exact: true }),
      ).toBeVisible();

      const guestThirdPage = await loadCatalog(admin, {
        accountType: "family",
        filters: fixtureFilters,
        guestPageLimit: 2,
        page: 3,
        pageSize: 5,
      });
      expect(guestThirdPage.total).toBe(14);
      expect(guestThirdPage.current_page).toBe(3);
      expect(guestThirdPage.items).toEqual([]);

      const filteredFacet = await loadCatalog(admin, {
        accountType: "family",
        filters: { country: fixtures.countryA },
        pageSize: 12,
        viewerId: viewer.id,
      });
      expect(filteredFacet.items.every((item) => item.country === fixtures?.countryA)).toBe(
        true,
      );
      expect(filteredFacet.countries).toEqual(
        expect.arrayContaining([fixtures.countryA, fixtures.countryB]),
      );

      const activeProfiles = await loadCatalog(admin, {
        accountType: "family",
        filters: { ...fixtureFilters, activity: "active" },
        pageSize: 24,
        viewerId: viewer.id,
      });
      expect(activeProfiles.items.map((item) => item.id)).not.toContain(
        recentlyActiveProfile.id,
      );

      const recentlyActiveProfiles = await loadCatalog(admin, {
        accountType: "family",
        filters: { ...fixtureFilters, activity: "recently_active" },
        pageSize: 24,
        viewerId: viewer.id,
      });
      expect(
        recentlyActiveProfiles.items.find(
          (item) => item.id === recentlyActiveProfile.id,
        )?.activity_status,
      ).toBe("recently_active");

      const missingRangeSemantics = await loadCatalog(admin, {
        accountType: "family",
        filters: {
          country: fixtures.countryB,
          durationMin: "24",
          startFrom: "2035-01",
        },
        pageSize: 12,
        viewerId: viewer.id,
      });
      expect(missingRangeSemantics.items).toHaveLength(1);
      expect(missingRangeSemantics.items[0].availability_start_from).toBeNull();
      expect(missingRangeSemantics.items[0].duration_min_months).toBeNull();

      const oldest = await loadCatalog(admin, {
        accountType: "family",
        filters: fixtureFilters,
        pageSize: 12,
        sort: "oldest",
        viewerId: viewer.id,
      });
      const oldestTimes = oldest.items.map((profile) =>
        new Date(profile.created_at ?? 0).getTime(),
      );
      expect(oldestTimes).toEqual([...oldestTimes].sort((a, b) => a - b));

      const newest = await loadCatalog(admin, {
        accountType: "family",
        filters: fixtureFilters,
        pageSize: 12,
        sort: "newest",
        viewerId: viewer.id,
      });
      const newestTimes = newest.items.map((profile) =>
        new Date(profile.created_at ?? 0).getTime(),
      );
      expect(newestTimes).toEqual([...newestTimes].sort((a, b) => b - a));

      const featuredResult = await admin.rpc(
        "get_featured_public_profile_cards",
        { p_limit: 5 },
      );
      expect(featuredResult.error).toBeNull();
      const featuredPayload = featuredResult.data as { items?: CatalogItem[] };
      const featuredItems = featuredPayload.items ?? [];
      expect(featuredItems).toHaveLength(5);
      expect(
        featuredItems.filter((item) => item.account_type === "au_pair"),
      ).toHaveLength(3);
      expect(
        featuredItems.filter((item) => item.account_type === "family"),
      ).toHaveLength(2);

      const sitemapResult = await admin.rpc(
        "get_bounded_public_profile_sitemap_entries",
        { p_limit: 3 },
      );
      expect(sitemapResult.error).toBeNull();
      expect(sitemapResult.data).toHaveLength(3);
      for (const entry of sitemapResult.data ?? []) {
        expect(Object.keys(entry)).toEqual(["id", "public_slug"]);
      }

      for (const filePath of [
        "app/page.tsx",
        "app/search-aupair/page.tsx",
        "app/search-family/page.tsx",
      ]) {
        expect(source(filePath)).not.toContain("get_active_story_cards");
        expect(source(filePath)).not.toContain("loadPublicProfileCards");
      }
    } finally {
      if (fixtures) await cleanupCatalogFixtures(admin, fixtures.profiles);
    }
  });

  test("fixed-slot budgets fail closed for count, search, and landing", async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const admin = createAdminClient();
    const publicClient = createPublicClient();
    const before = await admin
      .from("public_catalog_request_counters")
      .select("request_scope", { count: "exact", head: true });

    expect(before.error).toBeNull();
    expect(before.count).toBe(EXPECTED_COUNTER_ROWS);

    const deniedReservation = await publicClient.rpc(
      "reserve_public_catalog_request",
      {
        p_ip_hash: "a".repeat(64),
        p_ip_prefix_hash: "b".repeat(64),
        p_scope: "count",
      },
    );
    expect(deniedReservation.data).toBeNull();
    expect(deniedReservation.error?.message).toMatch(/permission denied/i);

    const randomOctet = () => 20 + Math.floor(Math.random() * 180);
    const countIp = `198.51.${randomOctet()}.27`;
    const countIdentity = await saturateCatalogBudget({
      admin,
      ip: countIp,
      limit: 32,
      scope: "count",
    });
    const countSnapshotBeforeStorm = await snapshotCatalogCounters(admin, "count");
    await denyCatalogStorm({ admin, ...countIdentity, scope: "count" });
    const countSnapshotAfterStorm = await snapshotCatalogCounters(admin, "count");
    expect(countSnapshotAfterStorm).toEqual(countSnapshotBeforeStorm);

    const limitedCountResponse = await request.get(
      "/api/profile-search/count?target=au_pair",
      { headers: { "x-forwarded-for": countIp } },
    );
    expect(limitedCountResponse.status()).toBe(429);
    expect(limitedCountResponse.headers()["retry-after"]).toMatch(/^\d+$/);

    const searchIp = `198.18.${randomOctet()}.27`;
    await saturateCatalogBudget({
      admin,
      ip: searchIp,
      limit: 16,
      scope: "search",
    });

    await page.setExtraHTTPHeaders({ "x-forwarded-for": searchIp });
    const limitedSearchResponse = await page.goto("/search-family");
    expect(limitedSearchResponse?.status()).toBe(200);
    await expect(
      page.getByText("Something went wrong. Please try again.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("No matching families", { exact: true }),
    ).toHaveCount(0);

    const landingIp = `198.19.${randomOctet()}.27`;
    await saturateCatalogBudget({
      admin,
      ip: landingIp,
      limit: 8,
      scope: "landing",
    });

    await page.setExtraHTTPHeaders({ "x-forwarded-for": landingIp });
    const limitedLandingResponse = await page.goto("/");
    expect(limitedLandingResponse?.status()).toBe(200);
    await expect(
      page.getByText("Something went wrong. Please try again.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("No public profiles yet", { exact: true }),
    ).toHaveCount(0);

    const cardinalityReservations = [];
    for (let offset = 0; offset < 100; offset += 4) {
      cardinalityReservations.push(
        ...(await Promise.all(
          Array.from({ length: 4 }, (_, batchIndex) => {
            const attempt = offset + batchIndex;

            return admin.rpc("reserve_public_catalog_request", {
              p_ip_hash: randomUUID().replaceAll("-", "").padEnd(64, "a"),
              p_ip_prefix_hash: randomUUID()
                .replaceAll("-", "")
                .padEnd(64, "b"),
              p_scope: attempt % 2 === 0 ? "search" : "landing",
            });
          }),
        )),
      );
    }
    for (const reservation of cardinalityReservations) {
      expect(reservation.error).toBeNull();
    }

    const after = await admin
      .from("public_catalog_request_counters")
      .select("request_scope", { count: "exact", head: true });
    expect(after.error).toBeNull();
    expect(after.count).toBe(EXPECTED_COUNTER_ROWS);
  });
});
