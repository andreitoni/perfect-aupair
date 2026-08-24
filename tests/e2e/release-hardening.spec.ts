import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { getSupabaseCredentials } from "./helpers/supabase-local";

const PASSWORD = "TestPassword123!";
const SITE_URL = "https://perfectaupair.example";

const publicCanonicalRoutes = [
  "",
  "/about",
  "/search-aupair",
  "/search-family",
  "/privacy",
  "/terms",
  "/cookie-policy",
  "/contact",
  "/data-deletion",
  "/safety",
  "/guides",
  "/guides/au-pair-contract",
  "/guides/au-pair-interview",
  "/guides/united-states",
  "/guides/germany",
  "/guides/united-kingdom",
  "/guides/sweden",
  "/guides/denmark",
];

const privateMetadataFiles = [
  "app/account/layout.tsx",
  "app/account-deletion-pending/page.tsx",
  "app/account-suspended/page.tsx",
  "app/admin/layout.tsx",
  "app/messages/layout.tsx",
  "app/notifications/layout.tsx",
  "app/onboarding/layout.tsx",
  "app/profile/photos/page.tsx",
  "app/report/page.tsx",
  "app/saved/page.tsx",
  "app/stories/layout.tsx",
];

function createAdminClient() {
  const { url, serviceRoleKey } = getSupabaseCredentials();

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function source(filePath: string) {
  return readFileSync(join(process.cwd(), filePath), "utf8");
}

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"));
  return match?.[1] ?? null;
}

function canonicalFromHtml(html: string) {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  const canonical = tags.find(
    (tag) => attribute(tag, "rel")?.toLowerCase() === "canonical",
  );

  return canonical ? attribute(canonical, "href") : null;
}

function robotsFromHtml(html: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const robots = tags.find(
    (tag) => attribute(tag, "name")?.toLowerCase() === "robots",
  );

  return robots ? attribute(robots, "content")?.toLowerCase() ?? null : null;
}

async function htmlFor(request: APIRequestContext, path: string) {
  const response = await request.get(path);
  expect(response.ok(), `${path} should return HTML`).toBeTruthy();
  return response.text();
}

async function createAuthUser(
  admin: SupabaseClient,
  email: string,
  emailConfirmed: boolean,
) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: emailConfirmed,
    user_metadata: { account_type: "au_pair" },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Could not create password reset fixture.");
  }

  return data.user.id;
}

test.describe("release hardening regressions", () => {
  test.describe.configure({ mode: "serial" });

  test("password reset responses do not disclose account state", async ({
    request,
  }) => {
    const admin = createAdminClient();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const confirmedEmail = `qa-reset-confirmed-${suffix}@example.com`;
    const unconfirmedEmail = `qa-reset-unconfirmed-${suffix}@example.com`;
    const missingEmail = `qa-reset-missing-${suffix}@example.com`;
    const testIp = `2001:db8:${Math.random().toString(16).slice(2, 6)}:${Math.random()
      .toString(16)
      .slice(2, 6)}::1`;
    const userIds: string[] = [];

    try {
      const confirmedUserId = await createAuthUser(admin, confirmedEmail, true);
      const unconfirmedUserId = await createAuthUser(
        admin,
        unconfirmedEmail,
        false,
      );
      userIds.push(confirmedUserId, unconfirmedUserId);

      const [confirmedUser, unconfirmedUser] = await Promise.all([
        admin.auth.admin.getUserById(confirmedUserId),
        admin.auth.admin.getUserById(unconfirmedUserId),
      ]);

      expect(confirmedUser.error).toBeNull();
      expect(confirmedUser.data.user?.email_confirmed_at).toBeTruthy();
      expect(unconfirmedUser.error).toBeNull();
      expect(unconfirmedUser.data.user?.email_confirmed_at).toBeFalsy();

      const responses = [];

      for (const email of [missingEmail, unconfirmedEmail, confirmedEmail]) {
        const response = await request.post("/auth/request-password-reset", {
          data: { email },
          headers: { "x-forwarded-for": testIp },
        });
        responses.push({
          body: await response.json(),
          status: response.status(),
        });
      }

      expect(responses).toEqual([
        { body: { ok: true }, status: 200 },
        { body: { ok: true }, status: 200 },
        { body: { ok: true }, status: 200 },
      ]);

      const routeSource = source("app/auth/request-password-reset/route.ts");
      expect(routeSource).toContain("resetPasswordForEmail");
      expect(routeSource).not.toMatch(/\blistUsers\b/);
    } finally {
      await Promise.all(
        userIds.map((userId) => admin.auth.admin.deleteUser(userId)),
      );
    }
  });

  test("canonical and robots metadata stay scoped to the correct routes", async ({
    request,
  }) => {
    test.setTimeout(90_000);

    expect(source("app/layout.tsx")).not.toMatch(/\bcanonical\s*:/);
    expect(source("app/page.tsx")).toMatch(/\bcanonical\s*:\s*SITE_URL/);

    const canonicalResults = await Promise.all(
      publicCanonicalRoutes.map(async (path) => ({
        canonical: canonicalFromHtml(await htmlFor(request, path || "/")),
        path,
      })),
    );

    for (const { canonical, path } of canonicalResults) {
      expect(canonical, `${path || "/"} canonical`).toBe(
        `${SITE_URL}${path}`,
      );
    }

    for (const path of ["/login", "/forgot-password", "/reset-password", "/check-email"]) {
      const robots = robotsFromHtml(await htmlFor(request, path));
      expect(robots, `${path} robots`).toContain("noindex");
      expect(robots, `${path} robots`).toContain("nofollow");
    }

    for (const filePath of privateMetadataFiles) {
      expect(source(filePath), `${filePath} robots metadata`).toMatch(
        /robots\s*:\s*\{\s*index\s*:\s*false\s*,\s*follow\s*:\s*false\s*,?\s*\}/s,
      );
    }
  });

  test("sitemap omits individual profiles and publishes stable lastmod values", async ({
    request,
  }) => {
    const credentials = getSupabaseCredentials();

    if (!credentials.publishableKey) {
      throw new Error("Could not find local Supabase publishable key.");
    }

    const admin = createAdminClient();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = `qa-sitemap-${suffix}@example.com`;
    let profileId: string | null = null;

    try {
      profileId = await createAuthUser(admin, email, true);
      const { error: profileError } = await admin.from("profiles").upsert({
        id: profileId,
        email,
        account_type: "au_pair",
        onboarding_completed: true,
        first_name: "Sitemap",
        last_name: "Fixture",
        full_name: `Sitemap Fixture ${suffix}`,
        country: "Germany",
        city: "Berlin",
        nationality: "Romanian",
        preferred_host_countries: ["Germany"],
        mother_tongue: "Romanian",
        fluent_languages: ["English"],
        basic_languages: ["German"],
        availability_start: "Sep 2026 - Dec 2026",
        availability_start_from: "2026-09-01",
        availability_start_to: "2026-12-01",
        duration: "6-12 months",
        duration_min_months: 6,
        duration_max_months: 12,
        smoking_status: "non_smoker",
        gender: "female",
        birth_date: "2000-01-01",
        date_of_birth: "2000-01-01",
        bio: "Public sitemap fixture profile.",
        childcare_experience: "QA childcare experience.",
        has_drivers_license: true,
        has_childcare_experience: true,
        has_infant_experience: false,
        has_first_aid: true,
        content_moderation_status: "approved",
        content_moderation_reviewed_at: new Date().toISOString(),
        content_moderation_reason: "QA sitemap fixture.",
        is_admin: false,
      });

      if (profileError) {
        throw new Error(profileError.message);
      }

      const { error: photoError } = await admin.from("profile_photos").insert({
        profile_id: profileId,
        storage_path: `${profileId}/sitemap-fixture.jpg`,
        is_primary: true,
        sort_order: 0,
      });

      if (photoError) {
        throw new Error(photoError.message);
      }

      const { error: approvalError } = await admin
        .from("profiles")
        .update({
          content_moderation_status: "approved",
          content_moderation_reviewed_at: new Date().toISOString(),
          content_moderation_reason: "QA sitemap fixture approved.",
        })
        .eq("id", profileId);

      if (approvalError) {
        throw new Error(approvalError.message);
      }

      const { data: profile, error: profileSelectError } = await admin
        .from("profiles")
        .select(
          "account_type, content_moderation_status, created_at, deletion_requested_at, is_admin, onboarding_completed, public_slug, suspended_at",
        )
        .eq("id", profileId)
        .single();

      if (profileSelectError || !profile?.created_at || !profile.public_slug) {
        throw new Error(
          profileSelectError?.message ?? "Sitemap fixture metadata is missing.",
        );
      }

      const publicClient = createClient(
        credentials.url,
        credentials.publishableKey,
        {
          auth: { autoRefreshToken: false, persistSession: false },
        },
      );
      for (const rpcName of [
        "get_au_pair_search_cards",
        "get_family_search_cards",
      ] as const) {
        const { data, error } = await publicClient.rpc(rpcName);

        expect(data).toBeNull();
        expect(error?.message).toMatch(/permission denied/i);
      }

      const { error: signInError } = await publicClient.auth.signInWithPassword({
        email,
        password: PASSWORD,
      });

      expect(signInError).toBeNull();

      for (const rpcName of [
        "get_au_pair_search_cards",
        "get_family_search_cards",
      ] as const) {
        const { data, error } = await publicClient.rpc(rpcName);

        expect(data).toBeNull();
        expect(error?.message).toMatch(/permission denied/i);
      }

      const legacyServerProfiles = await admin.rpc(
        "get_au_pair_search_cards",
      );
      expect(legacyServerProfiles.data).toBeNull();
      expect(legacyServerProfiles.error?.message).toMatch(/permission denied/i);

      const { data: serverProfiles, error: serverProfilesError } = await admin.rpc(
        "get_bounded_public_profile_sitemap_entries",
        { p_limit: 5_000 },
      );

      if (serverProfilesError) throw new Error(serverProfilesError.message);

      expect(
        serverProfiles?.some(
          (candidate: { id?: string }) => candidate.id === profileId,
        ),
        `Fixture should be public: profile=${JSON.stringify(profile)} publicCount=${
          serverProfiles?.length ?? 0
        }`,
      ).toBeTruthy();

      const sitemapSource = readFileSync(
        join(process.cwd(), "app/sitemap.ts"),
        "utf8",
      );
      const sitemapResponse = await request.get("/sitemap.xml");
      const sitemapXml = await sitemapResponse.text();

      expect(sitemapResponse.ok()).toBeTruthy();
      expect(sitemapSource).not.toContain("loadPublicProfileSitemapEntries");
      expect(sitemapSource).not.toContain("loadPublicProfileCards");
      expect(sitemapSource).toContain("lastModified");
      expect(sitemapSource).not.toMatch(/lastModified:\s*new Date\(\)/);
      expect(sitemapSource).not.toContain("/profile/");
      expect(sitemapXml).toContain(`<loc>${SITE_URL}/search-aupair</loc>`);
      expect(sitemapXml).toContain(`<loc>${SITE_URL}/search-family</loc>`);
      expect(sitemapXml).toContain("<lastmod>2026-08-13T00:00:00.000Z</lastmod>");
      expect(sitemapXml).not.toContain(`${SITE_URL}/profile/`);
    } finally {
      if (profileId) {
        await admin.auth.admin.deleteUser(profileId);
      }
    }
  });
});
