import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { getSupabaseCredentials } from "./helpers/supabase-local";

const PASSWORD = "TestPassword123!";

type AccountType = "family" | "au_pair";

type StoryViewProfile = {
  client: SupabaseClient;
  email: string;
  id: string;
};

type StoryRow = {
  id: string;
  storage_path: string;
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

async function createEligibleProfile(
  admin: SupabaseClient,
  suffix: string,
  label: string,
  accountType: AccountType,
): Promise<StoryViewProfile> {
  const email = `qa-story-views-${label}-${suffix}@example.com`;
  const { data: authData, error: authError } =
    await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { account_type: accountType },
    });

  if (authError || !authData.user) {
    throw new Error(authError?.message ?? `Could not create ${label}.`);
  }

  const id = authData.user.id;
  const { error: profileError } = await admin.from("profiles").upsert({
    id,
    email,
    account_type: accountType,
    full_name: `QA Story Views ${label} ${suffix}`,
    first_name: "QA",
    last_name: `Story-${label}`,
    city: accountType === "family" ? "Berlin" : "Munich",
    country: "Germany",
    preferred_host_countries: accountType === "au_pair" ? ["Germany"] : [],
    onboarding_completed: true,
    public_slug: `qa-story-views-${label}-${suffix}`,
    content_moderation_status: "approved",
    content_moderation_needs_review: false,
    is_admin: false,
    last_active_at: new Date().toISOString(),
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(id);
    throw new Error(profileError.message);
  }

  const { error: photoError } = await admin.from("profile_photos").insert({
    profile_id: id,
    storage_path: `${id}/story-views-${label}-${suffix}.webp`,
    is_primary: true,
  });

  if (photoError) {
    await admin.auth.admin.deleteUser(id);
    throw new Error(photoError.message);
  }

  const { error: approvalError } = await admin
    .from("profiles")
    .update({
      content_moderation_status: "approved",
      content_moderation_needs_review: false,
    })
    .eq("id", id);

  if (approvalError) {
    await admin.auth.admin.deleteUser(id);
    throw new Error(approvalError.message);
  }

  const client = createPublicClient();
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });

  if (signInError) {
    await admin.auth.admin.deleteUser(id);
    throw new Error(signInError.message);
  }

  return { client, email, id };
}

async function getOwnStoryViewCount(
  client: SupabaseClient,
  storyId: string,
) {
  const { data, error } = await client.rpc(
    "get_own_profile_story_view_count",
    { p_story_id: storyId },
  );

  expect(error).toBeNull();
  return Number(data ?? 0);
}

async function getStoryViewRows(admin: SupabaseClient, storyId: string) {
  const { data, error } = await admin
    .from("profile_story_views")
    .select("story_id, viewer_profile_id, viewed_at")
    .eq("story_id", storyId)
    .order("viewer_profile_id");

  expect(error).toBeNull();
  return data ?? [];
}

test.describe("unique profile story views", () => {
  test.describe.configure({ mode: "serial" });

  test("counts each eligible opposite-account viewer once and keeps counts owner-only", async ({
    page,
  }) => {
    test.slow();

    const admin = createAdminClient();
    const anonymous = createPublicClient();
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const profiles: StoryViewProfile[] = [];
    let owner: StoryViewProfile | null = null;
    let sameTypeViewer: StoryViewProfile | null = null;
    let firstViewer: StoryViewProfile | null = null;
    let secondViewer: StoryViewProfile | null = null;
    let stories: StoryRow[] = [];

    try {
      owner = await createEligibleProfile(
        admin,
        suffix,
        "owner-family",
        "family",
      );
      profiles.push(owner);
      sameTypeViewer = await createEligibleProfile(
        admin,
        suffix,
        "same-type-family",
        "family",
      );
      profiles.push(sameTypeViewer);
      firstViewer = await createEligibleProfile(
        admin,
        suffix,
        "viewer-one-au-pair",
        "au_pair",
      );
      profiles.push(firstViewer);
      secondViewer = await createEligibleProfile(
        admin,
        suffix,
        "viewer-two-au-pair",
        "au_pair",
      );
      profiles.push(secondViewer);

      const now = Date.now();
      const { data: insertedStories, error: storyError } = await admin
        .from("profile_stories")
        .insert([
          {
            profile_id: owner.id,
            storage_path: `${owner.id}/story-views-a-${suffix}.webp`,
            created_at: new Date(now - 3_000).toISOString(),
            expires_at: new Date(now + 60 * 60_000).toISOString(),
            content_moderation_status: "approved",
          },
          {
            profile_id: owner.id,
            storage_path: `${owner.id}/story-views-b-${suffix}.webp`,
            created_at: new Date(now - 2_000).toISOString(),
            expires_at: new Date(now + 60 * 60_000).toISOString(),
            content_moderation_status: "approved",
          },
          {
            profile_id: owner.id,
            storage_path: `${owner.id}/story-views-expired-${suffix}.webp`,
            created_at: new Date(now - 2 * 60 * 60_000).toISOString(),
            expires_at: new Date(now - 60 * 60_000).toISOString(),
            content_moderation_status: "approved",
          },
        ])
        .select("id, storage_path")
        .order("storage_path");

      expect(storyError).toBeNull();
      expect(insertedStories).toHaveLength(3);
      stories = (insertedStories ?? []) as StoryRow[];

      const activeStoryA = stories.find((story) =>
        story.storage_path.includes("story-views-a-"),
      );
      const activeStoryB = stories.find((story) =>
        story.storage_path.includes("story-views-b-"),
      );
      const expiredStory = stories.find((story) =>
        story.storage_path.includes("story-views-expired-"),
      );

      expect(activeStoryA?.id).toBeTruthy();
      expect(activeStoryB?.id).toBeTruthy();
      expect(expiredStory?.id).toBeTruthy();

      const repeatedViewResults = await Promise.all(
        Array.from({ length: 12 }, () =>
          firstViewer.client.rpc("record_profile_story_view", {
            p_story_id: activeStoryA?.id,
          }),
        ),
      );

      expect(repeatedViewResults.every(({ error }) => error === null)).toBe(true);
      expect(await getStoryViewRows(admin, activeStoryA!.id)).toEqual([
        expect.objectContaining({
          story_id: activeStoryA!.id,
          viewer_profile_id: firstViewer.id,
        }),
      ]);

      const { error: secondViewError } = await secondViewer.client.rpc(
        "record_profile_story_view",
        { p_story_id: activeStoryA!.id },
      );
      expect(secondViewError).toBeNull();
      expect(await getStoryViewRows(admin, activeStoryA!.id)).toHaveLength(2);
      expect(await getOwnStoryViewCount(owner.client, activeStoryA!.id)).toBe(2);

      const invalidViewResults = await Promise.all([
        owner.client.rpc("record_profile_story_view", {
          p_story_id: activeStoryA!.id,
        }),
        sameTypeViewer.client.rpc("record_profile_story_view", {
          p_story_id: activeStoryA!.id,
        }),
        firstViewer.client.rpc("record_profile_story_view", {
          p_story_id: expiredStory!.id,
        }),
      ]);
      expect(invalidViewResults.every(({ error }) => error === null)).toBe(true);
      expect(await getStoryViewRows(admin, activeStoryA!.id)).toHaveLength(2);
      expect(await getStoryViewRows(admin, expiredStory!.id)).toEqual([]);

      const { error: firstStoryBViewError } = await firstViewer.client.rpc(
        "record_profile_story_view",
        { p_story_id: activeStoryB!.id },
      );
      expect(firstStoryBViewError).toBeNull();

      const { data: restoredSeenStoryIds, error: restoredSeenStoryIdsError } =
        await firstViewer.client.rpc("get_viewed_profile_story_ids", {
          p_story_ids: [
            activeStoryA!.id,
            activeStoryB!.id,
            expiredStory!.id,
          ],
        });
      expect(restoredSeenStoryIdsError).toBeNull();
      expect(new Set(restoredSeenStoryIds ?? [])).toEqual(
        new Set([activeStoryA!.id, activeStoryB!.id]),
      );

      const { error: blockError } = await admin.from("profile_blocks").insert({
        blocker_id: secondViewer.id,
        blocked_profile_id: owner.id,
      });
      expect(blockError).toBeNull();

      const { error: blockedViewError } = await secondViewer.client.rpc(
        "record_profile_story_view",
        { p_story_id: activeStoryB!.id },
      );
      expect(blockedViewError).toBeNull();
      expect(await getOwnStoryViewCount(owner.client, activeStoryB!.id)).toBe(1);
      expect(await getOwnStoryViewCount(owner.client, activeStoryA!.id)).toBe(2);
      expect(await getStoryViewRows(admin, activeStoryB!.id)).toEqual([
        expect.objectContaining({
          story_id: activeStoryB!.id,
          viewer_profile_id: firstViewer.id,
        }),
      ]);

      await page.goto("/login");
      await page.getByLabel(/email/i).fill(firstViewer.email);
      await page.getByLabel(/password/i).fill(PASSWORD);
      await page.locator("form").getByRole("button", { name: "Log in" }).click();
      await page.waitForURL(/\/search-family/, { timeout: 15_000 });
      await page.evaluate(() => window.localStorage.clear());
      await page.reload();

      const restoredStoryLink = page
        .locator(`a[href^="/stories/${activeStoryB!.id}"]`)
        .first();
      await expect(restoredStoryLink).toBeAttached();
      await expect(restoredStoryLink.locator("div").nth(1)).toHaveClass(
        /ring-\[#c8cdd3\]/,
      );

      await page.context().clearCookies();
      await page.goto("/login");
      await page.getByLabel(/email/i).fill(owner.email);
      await page.getByLabel(/password/i).fill(PASSWORD);
      await page.locator("form").getByRole("button", { name: "Log in" }).click();
      await page.waitForURL(/\/search-aupair/, { timeout: 15_000 });
      await page.goto(`/stories/${activeStoryA!.id}`);
      await expect(
        page.getByRole("img", { name: "Unique views: 2" }),
      ).toBeVisible();

      expect(
        await getOwnStoryViewCount(firstViewer.client, activeStoryA!.id),
      ).toBe(0);
      expect(
        await getOwnStoryViewCount(sameTypeViewer.client, activeStoryA!.id),
      ).toBe(0);

      const anonymousCount = await anonymous.rpc(
        "get_own_profile_story_view_count",
        { p_story_id: activeStoryA!.id },
      );
      expect(anonymousCount.data).toBeNull();
      expect(anonymousCount.error).not.toBeNull();

      const anonymousRecord = await anonymous.rpc("record_profile_story_view", {
        p_story_id: activeStoryA!.id,
      });
      expect(anonymousRecord.data).toBeNull();
      expect(anonymousRecord.error).not.toBeNull();

      const anonymousSeenState = await anonymous.rpc(
        "get_viewed_profile_story_ids",
        { p_story_ids: [activeStoryA!.id] },
      );
      expect(anonymousSeenState.data).toBeNull();
      expect(anonymousSeenState.error).not.toBeNull();

      for (const client of [anonymous, owner.client, firstViewer.client]) {
        const directRead = await client
          .from("profile_story_views")
          .select("story_id, viewer_profile_id")
          .eq("story_id", activeStoryA!.id);

        expect(directRead.data).toBeNull();
        expect(directRead.error).not.toBeNull();
      }

      const directInsert = await firstViewer.client
        .from("profile_story_views")
        .insert({
          story_id: activeStoryB!.id,
          viewer_profile_id: secondViewer.id,
        });
      expect(directInsert.data).toBeNull();
      expect(directInsert.error).not.toBeNull();

      const { error: deleteStoryError } = await admin
        .from("profile_stories")
        .delete()
        .eq("id", activeStoryB!.id);
      expect(deleteStoryError).toBeNull();
      expect(await getStoryViewRows(admin, activeStoryB!.id)).toEqual([]);
      expect(await getOwnStoryViewCount(owner.client, activeStoryB!.id)).toBe(0);
    } finally {
      const profileIds = profiles.map((profile) => profile.id);

      if (profileIds.length > 0) {
        await admin
          .from("profile_blocks")
          .delete()
          .or(
            `blocker_id.in.(${profileIds.join(",")}),blocked_profile_id.in.(${profileIds.join(",")})`,
          );
        await admin
          .from("profile_story_views")
          .delete()
          .in("viewer_profile_id", profileIds);
        await admin
          .from("profile_stories")
          .delete()
          .in("profile_id", profileIds);
        await admin.from("profile_photos").delete().in("profile_id", profileIds);
        await admin.from("profiles").delete().in("id", profileIds);
        await Promise.allSettled(
          profileIds.map((profileId) => admin.auth.admin.deleteUser(profileId)),
        );
      }
    }
  });
});
