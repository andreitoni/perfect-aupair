import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { getSupabaseCredentials } from "./helpers/supabase-local";

const PASSWORD = "TestPassword123!";
const PROFILE_PHOTO_BUCKET = "profile-photos";

type EligibleFamily = {
  email: string;
  id: string;
  photoPath: string;
};

function createAdminClient() {
  const { url, serviceRoleKey } = getSupabaseCredentials();

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createEligibleFamily(
  admin: SupabaseClient,
  suffix: string,
): Promise<EligibleFamily> {
  const email = `qa-unread-nav-${suffix}@example.com`;
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { account_type: "family" },
    });

  if (createError || !created.user) {
    throw new Error(createError?.message ?? "Could not create unread-nav user.");
  }

  const id = created.user.id;
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      account_type: "family",
      onboarding_completed: true,
      full_name: "QA Unread Navigation Family",
      country: "Germany",
      city: "Berlin",
      content_moderation_status: "approved",
      content_moderation_reviewed_at: new Date().toISOString(),
      content_moderation_reason: "QA unread navigation fixture approved.",
    })
    .eq("id", id);

  if (profileError) {
    await admin.auth.admin.deleteUser(id);
    throw new Error(profileError.message);
  }

  const photoPath = `${id}/unread-nav-${suffix}.png`;
  const photo = readFileSync(
    join(process.cwd(), "tests/fixtures/profile-photo.png"),
  );
  const { error: uploadError } = await admin.storage
    .from(PROFILE_PHOTO_BUCKET)
    .upload(photoPath, photo, { contentType: "image/png", upsert: false });

  if (uploadError) {
    await admin.auth.admin.deleteUser(id);
    throw new Error(uploadError.message);
  }

  const { error: photoError } = await admin.from("profile_photos").insert({
    profile_id: id,
    storage_path: photoPath,
    is_primary: true,
    sort_order: 0,
  });

  if (photoError) {
    await admin.storage.from(PROFILE_PHOTO_BUCKET).remove([photoPath]);
    await admin.auth.admin.deleteUser(id);
    throw new Error(photoError.message);
  }

  return { email, id, photoPath };
}

async function removeEligibleFamily(
  admin: SupabaseClient,
  family: EligibleFamily | null,
) {
  if (!family) return;

  await admin.storage
    .from(PROFILE_PHOTO_BUCKET)
    .remove([family.photoPath]);
  await admin.from("profile_photos").delete().eq("profile_id", family.id);
  await admin.from("profiles").delete().eq("id", family.id);
  await admin.auth.admin.deleteUser(family.id);
}

test("keeps the unread-count RPC behind a verified Auth user", () => {
  const source = readFileSync(
    join(process.cwd(), "components/messages/MessagesNavLink.tsx"),
    "utf8",
  );
  const authCheckIndex = source.indexOf("await supabase.auth.getUser()");
  const unreadRpcIndex = source.indexOf(
    'await supabase.rpc("get_unread_sender_count")',
  );

  expect(authCheckIndex).toBeGreaterThan(-1);
  expect(unreadRpcIndex).toBeGreaterThan(authCheckIndex);
  expect(
    source.match(/\.rpc\("get_unread_sender_count"\)/g) ?? [],
  ).toHaveLength(1);
  expect(source).toContain('error.code === "42501"');
  expect(source).toContain("markUnreadRpcForbidden();");
  expect(source).toContain("markUnreadUnauthenticated();");
  expect(source).toContain("const UNREAD_POLL_INTERVAL_MS = 300_000;");
  expect(source).toContain("const UNREAD_NAVIGATION_GRACE_MS = 15_000;");
});

test("allows the unread-count RPC only for an authenticated Supabase session", async () => {
  const { url, publishableKey } = getSupabaseCredentials();

  if (!publishableKey) {
    throw new Error("Local Supabase publishable key is unavailable.");
  }

  const admin = createAdminClient();
  const anonymous = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const authenticated = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `qa-unread-rpc-${suffix}@example.com`;
  let userId: string | null = null;

  try {
    const anonymousResult = await anonymous.rpc("get_unread_sender_count");
    expect(anonymousResult.error).not.toBeNull();
    expect(anonymousResult.error?.message).toMatch(/permission denied/i);

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });

    if (createError || !created.user) {
      throw new Error(createError?.message ?? "Could not create RPC test user.");
    }

    userId = created.user.id;
    const { error: signInError } = await authenticated.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });

    expect(signInError).toBeNull();

    const authenticatedResult = await authenticated.rpc(
      "get_unread_sender_count",
    );
    expect(authenticatedResult.error).toBeNull();
    expect(authenticatedResult.data).toBe(0);
  } finally {
    await authenticated.auth.signOut();
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
});

test("shares one unread poll across desktop/mobile nav and client navigation", async ({
  page,
}) => {
  test.slow();

  const admin = createAdminClient();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let family: EligibleFamily | null = null;

  try {
    family = await createEligibleFamily(admin, suffix);
    await page.goto("/");

    const loginResponse = await page.request.post("/auth/login", {
      data: { email: family.email, password: PASSWORD },
    });
    expect(loginResponse.ok()).toBe(true);

    let unreadRpcCalls = 0;
    page.on("request", (request) => {
      if (
        new URL(request.url()).pathname ===
        "/rest/v1/rpc/get_unread_sender_count"
      ) {
        unreadRpcCalls += 1;
      }
    });

    await page.goto("/search-aupair");
    await expect(page.locator('header a[href="/messages"]')).toBeVisible();
    await expect.poll(() => unreadRpcCalls).toBe(1);

    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("focus"));
    });
    await page.waitForTimeout(500);
    expect(unreadRpcCalls).toBe(1);

    await page.locator('header a[href="/saved"]').click();
    await expect(page).toHaveURL(/\/saved$/);
    await page.waitForTimeout(1_000);
    expect(unreadRpcCalls).toBe(1);
  } finally {
    await removeEligibleFamily(admin, family);
  }
});

test("does not retry a permission-denied unread RPC on focus or read events", async ({
  page,
}) => {
  test.slow();

  const admin = createAdminClient();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let family: EligibleFamily | null = null;
  let unreadRpcCalls = 0;

  try {
    family = await createEligibleFamily(admin, suffix);
    await page.route(
      "**/rest/v1/rpc/get_unread_sender_count",
      async (route) => {
        unreadRpcCalls += 1;
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            code: "42501",
            message: "permission denied for function get_unread_sender_count",
          }),
        });
      },
    );

    await page.goto("/");
    const loginResponse = await page.request.post("/auth/login", {
      data: { email: family.email, password: PASSWORD },
    });
    expect(loginResponse.ok()).toBe(true);

    await page.goto("/search-aupair");
    await expect.poll(() => unreadRpcCalls).toBe(1);

    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(
        new CustomEvent("pa:messages-read-state-changed", {
          detail: { conversationId: crypto.randomUUID() },
        }),
      );
    });
    await page.waitForTimeout(500);
    expect(unreadRpcCalls).toBe(1);
  } finally {
    await removeEligibleFamily(admin, family);
  }
});
