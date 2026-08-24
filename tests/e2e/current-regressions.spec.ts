import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { cleanupRetainedMessagePhotos } from "../../lib/messages/cleanup-retained-message-photos";
import { isMessageProfileAvailable } from "../../lib/messages/profile-availability";
import {
  formatFamilyDisplayName,
  formatFamilyStoryDisplayName,
} from "../../lib/i18n/formatters";
import {
  LANGUAGE_PREFERENCE_VERSION,
  LANGUAGE_PREFERENCE_VERSION_KEY,
} from "../../lib/i18n/config";
import {
  COOKIE_CONSENT_COOKIE_NAME,
} from "../../lib/analytics/consent";
import { normalizeSpeedInsightEvent } from "../../components/analytics/PrivacyAwareSpeedInsights";
import { isLikelyDesktopRequest } from "../../lib/browser/request-viewport";
import { getSupabaseCredentials } from "./helpers/supabase-local";

const PASSWORD = "TestPassword123!";
const PHOTO_BUCKET = "profile-photos";
const PROFILE_VIDEO_BUCKET = "profile-videos";
const MESSAGE_PHOTO_BUCKET = "message-photos";
const MESSAGE_VIDEO_BUCKET = "message-videos";
const MESSAGE_AUDIO_BUCKET = "message-audio";
const AU_PAIR_BIRTH_DATE = "2000-01-01";

function createFamilyNameTestTranslator(locale: "en" | "de"):
  Parameters<typeof formatFamilyDisplayName>[1] {
  return (key, values) => {
    const name = String(values?.name ?? "");

    if (locale === "de") {
      return `Familie ${name}`;
    }

    return key === "format.family.storyGeneratedName"
      ? `${name} family`
      : `The ${name} family`;
  };
}

test("generated family names omit the article only in story areas", () => {
  const en = createFamilyNameTestTranslator("en");
  const de = createFamilyNameTestTranslator("de");

  expect(formatFamilyStoryDisplayName("The Mayer family", en)).toBe(
    "Mayer family",
  );
  expect(formatFamilyDisplayName("The Mayer family", en)).toBe(
    "The Mayer family",
  );
  expect(formatFamilyStoryDisplayName("Mayer & Co.", en)).toBe(
    "Mayer & Co.",
  );
  expect(formatFamilyStoryDisplayName("The Mayer family", de)).toBe(
    "Familie Mayer",
  );
});

test("Speed Insights groups login modes without leaking private routes", () => {
  const loginEvent = {
    type: "vital" as const,
    url: "https://perfectaupair.example/login?mode=register",
    route: "/[mode]",
  };

  expect(
    normalizeSpeedInsightEvent(
      loginEvent,
      "/login",
      "https://perfectaupair.example",
    ),
  ).toEqual({
    ...loginEvent,
    url: "https://perfectaupair.example/login",
    route: "/login",
  });
  expect(
    normalizeSpeedInsightEvent(
      {
        type: "vital",
        url: "https://perfectaupair.example/messages?conversation=private-id",
        route: "/messages",
      },
      "/messages",
      "https://perfectaupair.example",
    ),
  ).toEqual({
    type: "vital",
    url: "https://perfectaupair.example/messages",
    route: "/messages",
  });
  expect(
    normalizeSpeedInsightEvent(
      {
        type: "vital",
        url: "https://perfectaupair.example/profile/private-slug?source=saved",
      },
      "/profile/private-slug",
      "https://perfectaupair.example",
    ),
  ).toEqual({
    type: "vital",
    url: "https://perfectaupair.example/profile/[id]",
    route: "/profile/[id]",
  });
  expect(
    normalizeSpeedInsightEvent(
      {
        type: "vital",
        url: "https://perfectaupair.example/profile/photos?step=required",
      },
      "/profile/photos",
      "https://perfectaupair.example",
    ),
  ).toEqual({
    type: "vital",
    url: "https://perfectaupair.example/profile/photos",
    route: "/profile/photos",
  });
  expect(
    normalizeSpeedInsightEvent(
      loginEvent,
      "/admin",
      "https://perfectaupair.example",
    ),
  ).toBeNull();
});

test("desktop requests keep server-rendered controls without adding them to mobile HTML", () => {
  expect(
    isLikelyDesktopRequest(
      new Headers({
        "sec-ch-ua-mobile": "?0",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      }),
    ),
  ).toBe(true);
  expect(
    isLikelyDesktopRequest(
      new Headers({
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) Mobile/15E148 Safari/604.1",
      }),
    ),
  ).toBe(false);
});

test("search filters are server-rendered for desktop but deferred on mobile", async ({
  browser,
}) => {
  const desktopContext = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  });
  const mobileContext = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) Mobile/15E148 Safari/604.1",
  });

  try {
    const [desktopResponse, mobileResponse] = await Promise.all([
      desktopContext.request.get("/search-aupair"),
      mobileContext.request.get("/search-aupair"),
    ]);
    const [desktopHtml, mobileHtml] = await Promise.all([
      desktopResponse.text(),
      mobileResponse.text(),
    ]);

    expect(desktopResponse.ok()).toBe(true);
    expect(mobileResponse.ok()).toBe(true);
    expect(desktopHtml).toContain("pa-filter-panel");
    expect(mobileHtml).not.toContain("pa-filter-panel");
  } finally {
    await Promise.all([desktopContext.close(), mobileContext.close()]);
  }
});

type AccountType = "au_pair" | "family";

type TestProfile = {
  email: string;
  id: string;
  publicSlug: string;
};

type QaMessageVisualViewport = {
  height: number;
  offsetTop: number;
  scale?: number;
  events?: Array<"resize" | "scroll">;
};

async function installQaMessageVisualViewport(page: Page) {
  await page.addInitScript(() => {
    if (window.location.pathname !== "/messages") {
      return;
    }

    class MockMessageVisualViewport extends EventTarget {
      height = window.innerHeight;
      offsetLeft = 0;
      offsetTop = 0;
      pageLeft = 0;
      pageTop = 0;
      scale = 1;
      width = window.innerWidth;
    }

    const visualViewport = new MockMessageVisualViewport();

    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: visualViewport,
    });
    Object.defineProperty(window, "__setQaMessageVisualViewport", {
      configurable: true,
      value: ({
        height,
        offsetTop,
        scale,
        events = ["resize"],
      }: QaMessageVisualViewport) => {
        visualViewport.height = height;
        visualViewport.offsetTop = offsetTop;
        visualViewport.scale = scale ?? visualViewport.scale;

        for (const eventName of events) {
          visualViewport.dispatchEvent(new Event(eventName));
        }
      },
    });
  });
}

async function setQaMessageVisualViewport(
  page: Page,
  viewport: QaMessageVisualViewport,
) {
  await page.evaluate((nextViewport) => {
    const setVisualViewport = (
      window as typeof window & {
        __setQaMessageVisualViewport?: (
          next: QaMessageVisualViewport,
        ) => void;
      }
    ).__setQaMessageVisualViewport;

    if (!setVisualViewport) {
      throw new Error("QA visual viewport controller is unavailable.");
    }

    setVisualViewport(nextViewport);
  }, viewport);
}

async function expectNoNextErrorPage(page: Page) {
  await expect(page.locator("body")).not.toContainText("Runtime Error");
  await expect(page.locator("body")).not.toContainText("Build Error");
  await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
  await expect(page.locator("body")).not.toContainText("Application error");
}

async function waitForSearchRoute(page: Page, timeout = 30_000) {
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout })
    .toBe("/search-aupair");
}

function expectedAgeFromBirthDate(value: string) {
  const birthDate = new Date(`${value}T00:00:00.000Z`);
  const today = new Date();
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birthDate.getUTCMonth();
  const dayDiff = today.getUTCDate() - birthDate.getUTCDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age;
}

function createAdminClient() {
  const { url, serviceRoleKey } = getSupabaseCredentials();

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createBrowserSupabaseClient() {
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

async function createAuthUser(
  admin: SupabaseClient,
  email: string,
  accountType: AccountType,
) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      account_type: accountType,
    },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? `Could not create ${accountType} user.`);
  }

  return data.user.id;
}

async function createProfile(
  admin: SupabaseClient,
  suffix: string,
  accountType: AccountType,
  options: {
    deleted?: boolean;
    isAdmin?: boolean;
    name?: string;
    suspended?: boolean;
    withPhoto?: boolean;
    withVideo?: boolean;
  } = {},
): Promise<TestProfile> {
  const label = options.name ?? `QA ${accountType} ${suffix}`;
  const email = `qa-${accountType}-${suffix}-${Math.random()
    .toString(16)
    .slice(2)}@example.com`;
  const id = await createAuthUser(admin, email, accountType);

  const shared = {
    id,
    email,
    account_type: accountType,
    onboarding_completed: true,
    first_name: accountType === "family" ? null : "Ana",
    last_name: accountType === "family" ? null : "Ionescu",
    full_name: label,
    country: accountType === "family" ? "United States" : "Germany",
    city: accountType === "family" ? "Austin" : "Berlin",
    street_address: "Private Street 42",
    phone_country_code: "+49",
    phone_number: "15123456789",
    birth_date: accountType === "family" ? null : AU_PAIR_BIRTH_DATE,
    date_of_birth: accountType === "family" ? null : AU_PAIR_BIRTH_DATE,
    deletion_requested_at: options.deleted ? "2026-07-04T00:00:00.000Z" : null,
    deletion_scheduled_at: options.deleted ? "2026-07-11T00:00:00.000Z" : null,
    content_moderation_status: "approved",
    content_moderation_reviewed_at: "2026-07-04T00:00:00.000Z",
    content_moderation_reason: "QA fixture approved for public regression tests.",
    is_admin: options.isAdmin ?? false,
  };
  const profile =
    accountType === "family"
      ? {
          ...shared,
          religion: "Christianity",
          children_info: "2 children",
          availability_start: "Sep 2026 - Dec 2026",
          availability_start_from: "2026-09-01",
          availability_start_to: "2026-12-01",
          duration: "6-12 months",
          duration_min_months: 6,
          duration_max_months: 12,
          au_pair_allowance_amount: 500,
          au_pair_allowance_currency: "USD",
          accommodation_info: "Private room for the au pair.",
          expectations: "Help with childcare after school.",
          bio: `Public QA family profile ${suffix}.`,
        }
      : {
          ...shared,
          gender: "female",
          nationality: "Romanian",
          preferred_host_countries: ["Germany", "United States"],
          religion: "Christianity",
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
          already_in_germany: true,
          has_drivers_license: true,
          has_childcare_experience: true,
          has_infant_experience: false,
          has_first_aid: true,
          bio: `Public QA au pair profile ${suffix}.`,
        };

  const { error: profileError } = await admin.from("profiles").upsert(profile);

  if (profileError) {
    throw new Error(profileError.message);
  }

  const { data: savedProfile, error: selectError } = await admin
    .from("profiles")
    .select("public_slug")
    .eq("id", id)
    .single();

  if (selectError || !savedProfile?.public_slug) {
    throw new Error(selectError?.message ?? "Profile slug was not generated.");
  }

  if (options.withPhoto) {
    await addProfilePhoto(admin, id, suffix);
  }

  if (options.withVideo) {
    await addProfileVideo(admin, id, suffix);
  }

  await approveProfileFixture(admin, id);

  return {
    email,
    id,
    publicSlug: savedProfile.public_slug,
  };
}

async function addProfilePhoto(
  admin: SupabaseClient,
  profileId: string,
  suffix: string,
) {
  const storagePath = `${profileId}/qa-${suffix}.png`;
  const fixture = readFileSync(join(process.cwd(), "tests/fixtures/profile-photo.png"));

  await admin.storage.from(PHOTO_BUCKET).remove([storagePath]);
  const { error: uploadError } = await admin.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, fixture, {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { error: photoError } = await admin.from("profile_photos").insert({
    profile_id: profileId,
    storage_path: storagePath,
    is_primary: true,
    sort_order: 0,
  });

  if (photoError) {
    throw new Error(photoError.message);
  }
}

async function addProfileVideo(
  admin: SupabaseClient,
  profileId: string,
  suffix: string,
) {
  const storagePath = `${profileId}/qa-${suffix}.mp4`;
  const videoBytes = Buffer.from("qa profile video fixture");

  await admin.storage.from(PROFILE_VIDEO_BUCKET).remove([storagePath]);
  const { error: uploadError } = await admin.storage
    .from(PROFILE_VIDEO_BUCKET)
    .upload(storagePath, videoBytes, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { error: videoError } = await admin.from("profile_videos").insert({
    profile_id: profileId,
    storage_path: storagePath,
    mime_type: "video/mp4",
    size_bytes: videoBytes.byteLength,
    duration_seconds: 3,
    width: 640,
    height: 360,
    poster_data_url: `data:image/jpeg;base64,${"A".repeat(128)}`,
  });

  if (videoError) {
    throw new Error(videoError.message);
  }
}

async function approveProfileFixture(admin: SupabaseClient, profileId: string) {
  const { error } = await admin
    .from("profiles")
    .update({
      content_moderation_status: "approved",
      content_moderation_reviewed_at: "2026-07-04T00:00:00.000Z",
      content_moderation_reason: "QA fixture approved after media setup.",
    })
    .eq("id", profileId);

  if (error) {
    throw new Error(error.message);
  }
}

async function cleanupProfiles(
  admin: SupabaseClient,
  profiles: Array<TestProfile | null | undefined>,
) {
  for (const profile of profiles) {
    if (!profile?.id) {
      continue;
    }

    const [{ data: photos }, { data: videos }] = await Promise.all([
      admin
        .from("profile_photos")
        .select("storage_path")
        .eq("profile_id", profile.id),
      admin
        .from("profile_videos")
        .select("storage_path")
        .eq("profile_id", profile.id),
    ]);
    const photoPaths = photos?.map((photo) => photo.storage_path) ?? [];
    const videoPaths = videos?.map((video) => video.storage_path) ?? [];

    if (photoPaths.length) {
      await admin.storage.from(PHOTO_BUCKET).remove(photoPaths);
    }

    if (videoPaths.length) {
      await admin.storage.from(PROFILE_VIDEO_BUCKET).remove(videoPaths);
    }

    await admin.from("profile_photos").delete().eq("profile_id", profile.id);
    await admin.from("profile_videos").delete().eq("profile_id", profile.id);
    await admin.from("profiles").delete().eq("id", profile.id);
    await admin.auth.admin.deleteUser(profile.id);
  }
}

test.describe("current route and browser regressions", () => {
  test("an open conversation has only one automatic refresh owner", () => {
    const messagesPage = readFileSync(
      join(process.cwd(), "app/messages/page.tsx"),
      "utf8",
    );

    expect(messagesPage).toContain("refreshAfterMark={false}");
    expect(messagesPage).toContain(
      "{!selectedConversation ? (\n        <MessagesInboxAutoRefresh",
    );

    const conversationCards = readFileSync(
      join(process.cwd(), "components/messages/ConversationCardsList.tsx"),
      "utf8",
    );
    expect(conversationCards).toContain(
      "isSelected || isLatestMessageLocallyRead",
    );
    expect(conversationCards).toContain(
      '"pa:messages-read-state-changed",',
    );

    const messageList = readFileSync(
      join(process.cwd(), "components/messages/MessageList.tsx"),
      "utf8",
    );
    expect(messageList).toContain(
      "lastOtherTypingAt >= new Date(message.created_at).getTime()",
    );

    const adminDateFormat = readFileSync(
      join(process.cwd(), "lib/admin/date-format.ts"),
      "utf8",
    );
    expect(adminDateFormat).toContain('"Europe/Berlin"');
    expect(adminDateFormat).toContain("timeZone: ADMIN_TIME_ZONE");
  });

  test("mobile read conversation clears its unread badge when returning to the inbox", async ({
    page,
  }) => {
    test.slow();

    const admin = createAdminClient();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let family: TestProfile | null = null;
    let auPair: TestProfile | null = null;

    try {
      [family, auPair] = await Promise.all([
        createProfile(admin, suffix, "family", {
          name: `QA Read State Family ${suffix}`,
          withPhoto: true,
        }),
        createProfile(admin, suffix, "au_pair", {
          name: `QA Read State Au Pair ${suffix}`,
          withPhoto: true,
        }),
      ]);

      const { data: conversation, error: conversationError } = await admin
        .from("conversations")
        .insert({ family_id: family.id, au_pair_id: auPair.id })
        .select("id")
        .single();

      if (conversationError || !conversation) {
        throw new Error(
          conversationError?.message ?? "Could not create QA conversation.",
        );
      }

      const { error: messageError } = await admin.from("messages").insert({
        conversation_id: conversation.id,
        sender_id: auPair.id,
        body: `QA unread message ${suffix}`,
      });

      if (messageError) {
        throw new Error(messageError.message);
      }

      await page.setViewportSize({ width: 390, height: 844 });
      const loginResponse = await page.request.post("/auth/login", {
        data: { email: family.email, password: PASSWORD },
      });
      expect(loginResponse.ok()).toBe(true);

      await page.goto("/messages");
      const conversationCard = page.locator(
        `a[href="/messages?conversation=${conversation.id}"]`,
      );
      await expect(conversationCard).toBeVisible();
      await expect(
        conversationCard.locator('[aria-label="1 unread messages"]'),
      ).toBeVisible();

      await conversationCard.click();
      await page.waitForURL(`/messages?conversation=${conversation.id}`);
      await expect(page.getByTestId("selected-conversation-panel")).toBeVisible();

      await expect
        .poll(async () => {
          const { data } = await admin
            .from("conversation_reads")
            .select("last_read_at")
            .eq("user_id", family.id)
            .eq("conversation_id", conversation.id)
            .maybeSingle<{ last_read_at: string | null }>();

          return Boolean(data?.last_read_at);
        })
        .toBe(true);

      await page.getByRole("link", { name: "Go back" }).click();
      await page.waitForURL("/messages");
      await expect(conversationCard).toBeVisible();
      await expect(
        conversationCard.locator('[aria-label$="unread messages"]'),
      ).toHaveCount(0);
    } finally {
      await cleanupProfiles(admin, [family, auPair]);
    }
  });

  test("missing availability from an older inbox RPC keeps active profiles visible", () => {
    expect(isMessageProfileAvailable(undefined)).toBe(true);
    expect(isMessageProfileAvailable(null)).toBe(true);
    expect(isMessageProfileAvailable(true)).toBe(true);
    expect(isMessageProfileAvailable(false)).toBe(false);
  });

  for (const { route, title } of [
    {
      route: "/",
      title: "Perfect AuPair | Find Au Pairs and Host Families",
    },
    { route: "/search-aupair", title: "Find an Au Pair | Perfect AuPair" },
    { route: "/search-family", title: "Find a Host Family | Perfect AuPair" },
    { route: "/login", title: "Login | Perfect AuPair" },
    { route: "/login?mode=register", title: "Register | Perfect AuPair" },
  ]) {
    test(`${route} uses the expected browser title`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveTitle(title);
      await expectNoNextErrorPage(page);
    });
  }

  for (const route of [
    "/",
    "/login",
    "/forgot-password",
    "/reset-password",
    "/check-email",
    "/maintenance",
    "/onboarding/ineligible",
    "/about",
    "/privacy",
    "/terms",
    "/cookie-policy",
    "/safety",
    "/guides",
    "/guides/germany",
    "/guides/united-kingdom",
    "/guides/united-states",
    "/guides/sweden",
    "/guides/denmark",
    "/guides/au-pair-contract",
    "/guides/au-pair-interview",
    "/contact",
    "/data-deletion",
  ]) {
    test(`${route} loads without framework errors or horizontal overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route);
      await expect(page.locator("body")).toBeVisible();
      await expectNoNextErrorPage(page);

      const metrics = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));

      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    });
  }

  for (const route of [
    "/account",
    "/account/delete",
    "/account/settings",
    "/messages",
    "/messages/new",
    "/saved",
    "/profile/photos",
    "/notifications/saved",
    "/notifications/views",
    "/report",
    "/stories/new",
  ]) {
    test(`${route} remains guarded for guests`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("body")).toBeVisible();
      await expectNoNextErrorPage(page);
      expect(new URL(page.url()).pathname).toMatch(/^\/(login|auth\/home)/);
    });
  }

  test("public responses keep security headers and maintenance routes reject guests", async ({
    request,
  }) => {
    const response = await request.get("/");

    expect(response.headers()["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");

    for (const route of [
      "/api/maintenance/cleanup-expired-stories",
      "/api/maintenance/cleanup-retained-message-photos",
      "/api/maintenance/delete-scheduled-accounts",
      "/api/maintenance/roll-profile-availability",
      "/api/maintenance/send-profile-completion-reminders",
    ]) {
      const maintenanceResponse = await request.get(route);

      expect(maintenanceResponse.status()).toBe(401);
    }
  });

  test("registration surfaces do not reintroduce postal code fields", async ({
    page,
  }) => {
    await page.goto("/login?mode=register");
    await page
      .getByRole("button", { name: "Register for free as Family" })
      .click();
    await page.locator('input[name="accepted_terms"]').check();
    await page.getByRole("button", { name: "Register with Email" }).click();
    await expect(page.getByRole("heading", { name: "Family profile" })).toBeVisible();

    await expect(page.locator('input[name*="postal" i]')).toHaveCount(0);
    await expect(page.locator('input[name*="zip" i]')).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Postal code");
    await expect(page.locator("body")).not.toContainText("ZIP");
  });

  test("authenticated primary pages use descriptive browser titles", async ({
    page,
  }) => {
    test.slow();

    const admin = createAdminClient();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let family: TestProfile | null = null;

    try {
      family = await createProfile(admin, suffix, "family", {
        name: `QA Title Family ${suffix}`,
        withPhoto: true,
      });

      await page.goto("/login");
      await page.getByLabel(/email/i).fill(family.email);
      await page.getByLabel(/password/i).fill(PASSWORD);
      await page.locator("form").getByRole("button", { name: "Log in" }).click();
      await waitForSearchRoute(page, 30_000);

      for (const { route, title } of [
        { route: "/messages", title: "Messages | Perfect AuPair" },
        { route: "/account/settings", title: "Settings | Perfect AuPair" },
        { route: "/account", title: "My Profile | Perfect AuPair" },
        { route: "/profile/photos", title: "My Profile | Perfect AuPair" },
        { route: "/saved", title: "Saved Profiles | Perfect AuPair" },
      ]) {
        await page.goto(route);
        await expect(page).toHaveTitle(title);
        await expectNoNextErrorPage(page);
      }
    } finally {
      await cleanupProfiles(admin, [family]);
    }
  });

  test("au pairs and families control social media consent from settings and notification actions", async ({
    browser,
    page,
  }) => {
    test.slow();

    const admin = createAdminClient();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let auPair: TestProfile | null = null;
    let family: TestProfile | null = null;
    let familyContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;

    try {
      [auPair, family] = await Promise.all([
        createProfile(admin, `${suffix}-social-au-pair`, "au_pair", {
          name: `QA Social Au Pair ${suffix}`,
          withPhoto: true,
        }),
        createProfile(admin, `${suffix}-social-family`, "family", {
          name: `QA Social Family ${suffix}`,
          withPhoto: true,
        }),
      ]);

      const { data: initialRequest, error: initialRequestError } =
        await admin
          .from("system_notifications")
          .select("id, dedupe_key")
          .eq("recipient_id", auPair.id)
          .eq("type", "social_media_consent_request")
          .single();

      expect(initialRequestError).toBeNull();
      expect(initialRequest).toMatchObject({
        dedupe_key: `social_media_consent_request:${auPair.id}`,
      });

      const { data: familyRequest, error: familyRequestError } =
        await admin
          .from("system_notifications")
          .select("id, dedupe_key")
          .eq("recipient_id", family.id)
          .eq("type", "social_media_consent_request")
          .single();

      expect(familyRequestError).toBeNull();
      expect(familyRequest).toMatchObject({
        dedupe_key: `social_media_consent_request:${family.id}`,
      });

      await page.goto("/login");
      const acceptCookieChoices = page.getByRole("button", {
        name: "Accept all",
      });
      if (await acceptCookieChoices.isVisible()) {
        await acceptCookieChoices.click();
      }
      await page.getByLabel(/email/i).fill(auPair.email);
      await page.getByLabel(/password/i).fill(PASSWORD);
      await page.locator("form").getByRole("button", { name: "Log in" }).click();
      await expect
        .poll(() => new URL(page.url()).pathname, { timeout: 30_000 })
        .toBe("/search-family");

      await page.goto("/account/settings");
      const consentCheckbox = page.getByRole("checkbox", {
        name: /Perfect AuPair may use my profile photo, name and profile description/i,
      });
      await expect(consentCheckbox).toBeVisible();
      await expect(consentCheckbox).not.toBeChecked();
      await consentCheckbox.check();
      await page.getByRole("button", { name: "Save permission" }).click();
      await expect(page).toHaveURL(/social_media=saved/);

      const { data: acceptedProfile, error: acceptedProfileError } = await admin
        .from("profiles")
        .select("social_media_consent_status, social_media_consent_updated_at")
        .eq("id", auPair.id)
        .single();

      expect(acceptedProfileError).toBeNull();
      expect(acceptedProfile).toMatchObject({
        social_media_consent_status: "accepted",
      });
      expect(acceptedProfile?.social_media_consent_updated_at).toBeTruthy();

      await page.getByRole("button", { name: "Notifications" }).first().click();
      await expect(
        page.getByText("May we feature your profile?", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Decline" }).click();
      await expect(
        page.getByText("May we feature your profile?", { exact: true }),
      ).toHaveCount(0);

      const [declinedProfileResult, readNotificationResult] = await Promise.all([
        admin
          .from("profiles")
          .select("social_media_consent_status, social_media_consent_updated_at")
          .eq("id", auPair.id)
          .single(),
        admin
          .from("system_notifications")
          .select("read_at")
          .eq("id", initialRequest!.id)
          .single(),
      ]);

      expect(declinedProfileResult.error).toBeNull();
      expect(declinedProfileResult.data).toMatchObject({
        social_media_consent_status: "declined",
      });
      expect(declinedProfileResult.data?.social_media_consent_updated_at).toBeTruthy();
      expect(readNotificationResult.error).toBeNull();
      expect(readNotificationResult.data?.read_at).toBeTruthy();

      familyContext = await browser.newContext();
      const familyPage = await familyContext.newPage();
      await familyPage.goto("/login");
      const acceptFamilyCookieChoices = familyPage.getByRole("button", {
        name: "Accept all",
      });
      if (await acceptFamilyCookieChoices.isVisible()) {
        await acceptFamilyCookieChoices.click();
      }
      await familyPage.getByLabel(/email/i).fill(family.email);
      await familyPage.getByLabel(/password/i).fill(PASSWORD);
      await familyPage
        .locator("form")
        .getByRole("button", { name: "Log in" })
        .click();
      await waitForSearchRoute(familyPage, 30_000);
      await familyPage.goto("/account/settings");
      const familyConsentCheckbox = familyPage.getByRole("checkbox", {
        name: /Perfect AuPair may use my profile photo, name and profile description/i,
      });
      await expect(familyConsentCheckbox).toBeVisible();
      await expect(familyConsentCheckbox).not.toBeChecked();
      await familyConsentCheckbox.check();
      await familyPage
        .getByRole("button", { name: "Save permission" })
        .click();
      await expect(familyPage).toHaveURL(/social_media=saved/);

      const { data: acceptedFamily, error: acceptedFamilyError } = await admin
        .from("profiles")
        .select("social_media_consent_status, social_media_consent_updated_at")
        .eq("id", family.id)
        .single();

      expect(acceptedFamilyError).toBeNull();
      expect(acceptedFamily).toMatchObject({
        social_media_consent_status: "accepted",
      });
      expect(acceptedFamily?.social_media_consent_updated_at).toBeTruthy();

      await familyPage
        .getByRole("button", { name: "Notifications" })
        .first()
        .click();
      await expect(
        familyPage.getByText("May we feature your profile?", { exact: true }),
      ).toBeVisible();
      await familyPage.getByRole("button", { name: "Decline" }).click();
      await expect(
        familyPage.getByText("May we feature your profile?", { exact: true }),
      ).toHaveCount(0);

      const [declinedFamilyResult, readFamilyNotificationResult] =
        await Promise.all([
          admin
            .from("profiles")
            .select(
              "social_media_consent_status, social_media_consent_updated_at",
            )
            .eq("id", family.id)
            .single(),
          admin
            .from("system_notifications")
            .select("read_at")
            .eq("id", familyRequest!.id)
            .single(),
        ]);

      expect(declinedFamilyResult.error).toBeNull();
      expect(declinedFamilyResult.data).toMatchObject({
        social_media_consent_status: "declined",
      });
      expect(
        declinedFamilyResult.data?.social_media_consent_updated_at,
      ).toBeTruthy();
      expect(readFamilyNotificationResult.error).toBeNull();
      expect(readFamilyNotificationResult.data?.read_at).toBeTruthy();
    } finally {
      await familyContext?.close();
      await cleanupProfiles(admin, [auPair, family]);
    }
  });

  test("messages renders the account photo in the authenticated header", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const profileSuffix = `${suffix}-header-avatar`;
    let family: TestProfile | null = null;

    try {
      family = await createProfile(admin, profileSuffix, "family", {
        name: `QA Header Avatar Family ${suffix}`,
        withPhoto: true,
      });

      await page.context().addCookies([
        {
          name: COOKIE_CONSENT_COOKIE_NAME,
          value: "necessary",
          url: "http://localhost:3000",
        },
      ]);

      await page.goto("/login");
      await page.getByLabel(/email/i).fill(family.email);
      await page.getByLabel(/password/i).fill(PASSWORD);
      await page.locator("form").getByRole("button", { name: "Log in" }).click();
      await waitForSearchRoute(page);

      const serverMessagesResponse = await page.request.get("/messages");
      expect(serverMessagesResponse.ok()).toBe(true);
      expect(await serverMessagesResponse.text()).toContain(
        'data-authenticated-header-fallback="true"',
      );

      await page.goto("/messages");

      const accountButton = page.locator(
        'header button[aria-haspopup="menu"]',
      );
      await expect(accountButton).toHaveCount(1);

      const triggerAvatar = accountButton.locator(":scope > span").first();
      const avatarImage = triggerAvatar.locator("img");

      await expect(avatarImage).toHaveCount(1);
      const avatarSrc = await avatarImage.getAttribute("src");
      expect(avatarSrc).toContain(`${family.id}/qa-${profileSuffix}.png`);
      expect(new URL(avatarSrc ?? "", page.url()).searchParams.get("width")).toBe(
        "96",
      );
      await expect(triggerAvatar.locator("svg")).toHaveCount(0);
    } finally {
      await cleanupProfiles(admin, [family]);
    }
  });

  test("mobile search opens after navigating from messages to the feed", async ({
    page,
  }) => {
    test.slow();

    const admin = createAdminClient();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let family: TestProfile | null = null;

    try {
      family = await createProfile(admin, suffix, "family", {
        name: `QA Mobile Search Family ${suffix}`,
        withPhoto: true,
      });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/login");
      await page.getByLabel(/email/i).fill(family.email);
      await page.getByLabel(/password/i).fill(PASSWORD);
      await page.locator("form").getByRole("button", { name: "Log in" }).click();
      await page.waitForURL(/\/search-aupair/, { timeout: 30_000 });

      await page.goto("/messages");
      await page
        .locator(
          'nav.pa-mobile-app-nav a[aria-label="Search profiles"]',
        )
        .click();
      await page.waitForURL(/\/search-aupair/, {
        timeout: 60_000,
        waitUntil: "commit",
      });

      const activeMobileSearch = page.locator(
        'input[role="combobox"][aria-label="Search profiles"][aria-expanded="true"]:visible',
      );
      await expect(activeMobileSearch).toBeVisible();
      await expect(activeMobileSearch).toBeFocused();
    } finally {
      await cleanupProfiles(admin, [family]);
    }
  });

  test("mobile messages does not eagerly prefetch persistent navigation routes", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let family: TestProfile | null = null;

    try {
      family = await createProfile(admin, suffix, "family", {
        name: `QA Mobile Prefetch Family ${suffix}`,
        withPhoto: true,
      });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/login");
      await page.getByLabel(/email/i).fill(family.email);
      await page.getByLabel(/password/i).fill(PASSWORD);
      await page.locator("form").getByRole("button", { name: "Log in" }).click();
      await waitForSearchRoute(page);

      let messagesNavigationStarted = false;
      const eagerMobileNavPrefetches: string[] = [];

      page.on("request", (request) => {
        const requestUrl = new URL(request.url());

        if (
          request.isNavigationRequest() &&
          requestUrl.pathname === "/messages"
        ) {
          messagesNavigationStarted = true;
          return;
        }

        if (
          messagesNavigationStarted &&
          requestUrl.searchParams.has("_rsc") &&
          ["/search-aupair", "/account"].includes(requestUrl.pathname)
        ) {
          eagerMobileNavPrefetches.push(requestUrl.pathname);
        }
      });

      await page.goto("/messages", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1_000);
      expect(eagerMobileNavPrefetches).toEqual([]);
    } finally {
      await cleanupProfiles(admin, [family]);
    }
  });

  test("an empty new conversation is first while open and disappears after exit", async ({
    page,
  }) => {
    test.slow();

    const admin = createAdminClient();
    const client = createBrowserSupabaseClient();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let family: TestProfile | null = null;
    let olderAuPair: TestProfile | null = null;
    let newerAuPair: TestProfile | null = null;
    let emptyAuPair: TestProfile | null = null;

    try {
      [family, olderAuPair, newerAuPair, emptyAuPair] = await Promise.all([
        createProfile(admin, `${suffix}-family`, "family", {
          withPhoto: true,
        }),
        createProfile(admin, `${suffix}-older`, "au_pair", {
          withPhoto: true,
        }),
        createProfile(admin, `${suffix}-newer`, "au_pair", {
          withPhoto: true,
        }),
        createProfile(admin, `${suffix}-empty`, "au_pair", {
          withPhoto: true,
        }),
      ]);

      const now = Date.now();
      const olderConversationCreatedAt = new Date(
        now - 8 * 60 * 60 * 1_000,
      ).toISOString();
      const olderMessageAt = new Date(
        now - 4 * 60 * 60 * 1_000,
      ).toISOString();
      const newerConversationCreatedAt = new Date(
        now - 2 * 60 * 60 * 1_000,
      ).toISOString();
      const newerMessageAt = new Date(now - 30 * 60 * 1_000).toISOString();
      const { data: conversationRows, error: conversationError } = await admin
        .from("conversations")
        .insert([
          {
            family_id: family.id,
            au_pair_id: olderAuPair.id,
            created_at: olderConversationCreatedAt,
            updated_at: olderConversationCreatedAt,
          },
          {
            family_id: family.id,
            au_pair_id: newerAuPair.id,
            created_at: newerConversationCreatedAt,
            updated_at: newerConversationCreatedAt,
          },
        ])
        .select("id, au_pair_id, updated_at");

      if (conversationError || !conversationRows) {
        throw new Error(
          conversationError?.message ?? "Could not create inbox conversations.",
        );
      }

      const olderConversation = conversationRows.find(
        (conversation) => conversation.au_pair_id === olderAuPair?.id,
      );
      const newerConversation = conversationRows.find(
        (conversation) => conversation.au_pair_id === newerAuPair?.id,
      );

      if (!olderConversation || !newerConversation) {
        throw new Error("Could not identify inbox conversations.");
      }

      const { error: messageSeedError } = await admin.from("messages").insert([
        {
          conversation_id: olderConversation.id,
          sender_id: olderAuPair.id,
          body: "Older inbox message",
          created_at: olderMessageAt,
          sent_at: olderMessageAt,
        },
        {
          conversation_id: newerConversation.id,
          sender_id: newerAuPair.id,
          body: "Newer inbox message",
          created_at: newerMessageAt,
          sent_at: newerMessageAt,
        },
      ]);

      if (messageSeedError) {
        throw new Error(messageSeedError.message);
      }

      const { error: signInError } = await client.auth.signInWithPassword({
        email: family.email,
        password: PASSWORD,
      });

      if (signInError) {
        throw new Error(signInError.message);
      }

      const [
        { data: initialCards, error: initialCardsError },
        { data: initialFingerprint, error: initialFingerprintError },
      ] = await Promise.all([
        client.rpc("get_message_inbox_cards"),
        client.rpc("get_message_inbox_fingerprint"),
      ]);

      if (initialCardsError || initialFingerprintError) {
        throw new Error(
          initialCardsError?.message ?? initialFingerprintError?.message,
        );
      }

      expect(initialCards?.map((card) => card.conversation_id)).toEqual([
        newerConversation.id,
        olderConversation.id,
      ]);
      expect(
        initialCards?.every(
          (card) => card.other_profile_available === true,
        ),
      ).toBe(true);
      expect(
        initialFingerprint
          ?.map((row) => row.conversation_id)
          .sort(),
      ).toEqual([newerConversation.id, olderConversation.id].sort());
      expect(
        initialFingerprint?.every(
          (row) => row.other_profile_available === true,
        ),
      ).toBe(true);

      const originalOlderUpdatedAt = olderConversation.updated_at;
      const { data: reopenedConversationId, error: reopenError } =
        await client.rpc("create_or_get_conversation", {
          p_profile_id: olderAuPair.id,
        });

      if (reopenError) {
        throw new Error(reopenError.message);
      }

      expect(reopenedConversationId).toBe(olderConversation.id);

      const [
        { data: cardsAfterOpen, error: cardsAfterOpenError },
        { data: olderConversationAfterOpen, error: updatedAtError },
      ] = await Promise.all([
        client.rpc("get_message_inbox_cards"),
        admin
          .from("conversations")
          .select("updated_at")
          .eq("id", olderConversation.id)
          .single(),
      ]);

      if (cardsAfterOpenError || updatedAtError) {
        throw new Error(
          cardsAfterOpenError?.message ??
            updatedAtError?.message ??
            "Could not verify inbox order after opening a chat.",
        );
      }

      expect(cardsAfterOpen?.map((card) => card.conversation_id)).toEqual([
        newerConversation.id,
        olderConversation.id,
      ]);
      const olderActivityAt = cardsAfterOpen?.find(
        (card) => card.conversation_id === olderConversation.id,
      )?.activity_at;

      expect(new Date(olderActivityAt ?? 0).getTime()).toBe(
        new Date(olderMessageAt).getTime(),
      );
      expect(olderConversationAfterOpen.updated_at).toBe(
        originalOlderUpdatedAt,
      );

      const { data: emptyConversationId, error: emptyConversationError } =
        await client.rpc("create_or_get_conversation", {
          p_profile_id: emptyAuPair.id,
        });

      if (emptyConversationError || !emptyConversationId) {
        throw new Error(
          emptyConversationError?.message ??
            "Could not create an empty conversation.",
        );
      }

      const { data: cardsWithEmptyChat, error: cardsWithEmptyChatError } =
        await client.rpc("get_message_inbox_cards");

      if (cardsWithEmptyChatError) {
        throw new Error(cardsWithEmptyChatError.message);
      }

      expect(cardsWithEmptyChat?.map((card) => card.conversation_id)).toEqual([
        newerConversation.id,
        olderConversation.id,
        emptyConversationId,
      ]);
      expect(
        cardsWithEmptyChat?.find(
          (card) => card.conversation_id === emptyConversationId,
        )?.last_message_created_at,
      ).toBeNull();

      const firstMessageBody = `First inbox message ${suffix}`;
      const expectedInboxOrder = [newerConversation.id, olderConversation.id];
      const getVisibleConversationOrder = async () => {
        const hrefs = await page
          .locator('a[href^="/messages?conversation="]:visible')
          .evaluateAll((links) =>
            links.map((link) => link.getAttribute("href") ?? ""),
          );

        return hrefs
          .map((href) =>
            new URL(href, "http://localhost").searchParams.get("conversation"),
          )
          .filter((conversationId): conversationId is string =>
            Boolean(conversationId),
          );
      };

      await page.goto("/login");
      await page.getByLabel(/email/i).fill(family.email);
      await page.getByLabel(/password/i).fill(PASSWORD);
      await page.locator("form").getByRole("button", { name: "Log in" }).click();
      await page.waitForURL(/\/search-aupair/, { timeout: 30_000 });
      await page.goto("/messages");
      await expect.poll(getVisibleConversationOrder).toEqual(expectedInboxOrder);

      const olderConversationCard = page.locator(
        `a[href="/messages?conversation=${olderConversation.id}"]:visible`,
      );
      await expect(olderConversationCard).toContainText(
        `QA au_pair ${suffix}-older`,
      );
      await expect(
        olderConversationCard.getByText("User unavailable", { exact: true }),
      ).toHaveCount(0);
      const olderTimeBeforeOpen = await olderConversationCard
        .locator("time[data-conversation-time]")
        .getAttribute("datetime");

      await page.goto(`/profile/${olderAuPair.publicSlug}`);
      await page
        .locator(`a[href="/messages?profile=${olderAuPair.id}"]`)
        .click();
      await page.waitForURL((url) => {
        return (
          url.pathname === "/messages" &&
          url.searchParams.get("conversation") === olderConversation?.id
        );
      });

      await expect.poll(getVisibleConversationOrder).toEqual(expectedInboxOrder);
      await expect(
        page
          .locator(
            `a[href="/messages?conversation=${olderConversation.id}"]:visible`,
          )
          .locator("time[data-conversation-time]"),
      ).toHaveAttribute("datetime", olderTimeBeforeOpen ?? "");

      await page.goto(`/profile/${emptyAuPair.publicSlug}`);
      await page
        .locator(`a[href="/messages?profile=${emptyAuPair.id}"]`)
        .click();
      await page.waitForURL((url) => {
        return (
          url.pathname === "/messages" &&
          url.searchParams.get("conversation") === emptyConversationId
        );
      });

      const expectedOpenEmptyConversationOrder = [
        emptyConversationId,
        newerConversation.id,
        olderConversation.id,
      ];
      await expect.poll(getVisibleConversationOrder).toEqual(
        expectedOpenEmptyConversationOrder,
      );

      const emptyConversationCard = page.locator(
        `a[href="/messages?conversation=${emptyConversationId}"]:visible`,
      );
      await expect(
        emptyConversationCard.locator("time[data-conversation-time]"),
      ).toHaveCount(0);

      await page.goto("/messages");
      await expect.poll(getVisibleConversationOrder).toEqual(expectedInboxOrder);
      await expect(
        page.locator(
          `a[href="/messages?conversation=${emptyConversationId}"]:visible`,
        ),
      ).toHaveCount(0);

      await page.goto(`/messages?conversation=${emptyConversationId}`);
      await expect.poll(getVisibleConversationOrder).toEqual(
        expectedOpenEmptyConversationOrder,
      );

      const messageComposer = page.locator(
        'form[data-message-composer] textarea[name="body"]',
      );
      await messageComposer.fill(firstMessageBody);
      await page.getByRole("button", { name: "Send", exact: true }).click();

      await expect.poll(getVisibleConversationOrder).toEqual([
        emptyConversationId,
        newerConversation.id,
        olderConversation.id,
      ]);
      await expect(emptyConversationCard).toContainText(firstMessageBody);
      await expect(
        emptyConversationCard.locator("time[data-conversation-time]"),
      ).toHaveCount(1);

      await expect
        .poll(async () => {
          const { data, error } = await client.rpc("get_message_inbox_cards");

          if (error) {
            throw new Error(error.message);
          }

          return [
            data?.[0]?.conversation_id ?? null,
            data?.[0]?.last_message_body ?? null,
          ];
        })
        .toEqual([emptyConversationId, firstMessageBody]);
    } finally {
      await client.auth.signOut();
      await cleanupProfiles(admin, [
        family,
        olderAuPair,
        newerAuPair,
        emptyAuPair,
      ]);
    }
  });

  test("mobile messages preserve drafts and composer focus and show read receipts", async ({
    page,
  }) => {
    test.slow();

    const admin = createAdminClient();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const longMessage = "H".repeat(1_000);
    let family: TestProfile | null = null;
    let auPair: TestProfile | null = null;
    let conversationId = "";

    try {
      [family, auPair] = await Promise.all([
        createProfile(admin, suffix, "family", {
          name: `QA Long Message Family ${suffix}`,
          withPhoto: true,
        }),
        createProfile(admin, suffix, "au_pair", {
          name: `QA Long Message Au Pair ${suffix}`,
          withPhoto: true,
        }),
      ]);

      const { data: conversation, error: conversationError } = await admin
        .from("conversations")
        .insert({
          family_id: family.id,
          au_pair_id: auPair.id,
        })
        .select("id")
        .single();

      if (conversationError || !conversation) {
        throw new Error(
          conversationError?.message ?? "Could not create QA conversation.",
        );
      }

      conversationId = conversation.id;
      const createdAt = Date.now() - 60_000;
      const messageRows = Array.from({ length: 24 }, (_, index) => ({
        conversation_id: conversationId,
        sender_id: index % 2 === 0 ? family.id : auPair.id,
        body: `QA scroll message ${index + 1}`,
        created_at: new Date(createdAt + index * 1_000).toISOString(),
      }));
      messageRows.push({
        conversation_id: conversationId,
        sender_id: family.id,
        body: longMessage,
        created_at: new Date(
          createdAt + messageRows.length * 1_000,
        ).toISOString(),
      });

      const { error: messagesError } = await admin
        .from("messages")
        .insert(messageRows);

      if (messagesError) {
        throw new Error(messagesError.message);
      }

      await page.setViewportSize({ width: 390, height: 844 });
      await installQaMessageVisualViewport(page);
      await page.goto("/login");
      await page.getByLabel(/email/i).fill(family.email);
      await page.getByLabel(/password/i).fill(PASSWORD);
      await page.locator("form").getByRole("button", { name: "Log in" }).click();
      await page.waitForURL(/\/search-aupair/, { timeout: 30_000 });

      await page.goto("/messages");
      const conversationCard = page.locator(
        `a[href="/messages?conversation=${conversationId}"]`,
      );
      await expect(conversationCard).toBeVisible();

      const cardMetrics = await conversationCard.evaluate((element) => {
        const rect = element.getBoundingClientRect();

        return {
          left: rect.left,
          right: rect.right,
          viewportWidth: window.innerWidth,
          width: rect.width,
        };
      });

      expect(cardMetrics.left).toBeGreaterThanOrEqual(-1);
      expect(cardMetrics.right).toBeLessThanOrEqual(
        cardMetrics.viewportWidth + 1,
      );
      expect(cardMetrics.width).toBeLessThanOrEqual(cardMetrics.viewportWidth);

      await page.goto(`/messages?conversation=${conversationId}`);
      const messageScrollContainer = page.locator(
        "[data-message-scroll-container]",
      );
      const messageComposer = page.locator(
        'form[data-message-composer] textarea[name="body"]',
      );
      await expect(messageScrollContainer).toBeVisible();
      await expect(messageComposer).not.toBeFocused();
      await expect(
        messageScrollContainer.getByText(longMessage, { exact: true }),
      ).toBeVisible();

      const conversationMetrics = await messageScrollContainer.evaluate(
        (element) => {
          const rect = element.getBoundingClientRect();

          return {
            clientHeight: element.clientHeight,
            clientWidth: element.clientWidth,
            left: rect.left,
            right: rect.right,
            scrollHeight: element.scrollHeight,
            scrollWidth: element.scrollWidth,
            viewportWidth: window.innerWidth,
          };
        },
      );

      expect(conversationMetrics.left).toBeGreaterThanOrEqual(-1);
      expect(conversationMetrics.right).toBeLessThanOrEqual(
        conversationMetrics.viewportWidth + 1,
      );
      expect(conversationMetrics.scrollWidth).toBeLessThanOrEqual(
        conversationMetrics.clientWidth + 1,
      );
      expect(conversationMetrics.scrollHeight).toBeGreaterThan(
        conversationMetrics.clientHeight,
      );

      const messageReadReceipt = page.locator(
        "[data-message-read-receipt]",
      );
      await expect(messageReadReceipt).toHaveCount(1);
      await expect(messageReadReceipt).toHaveAttribute("data-read", "false");

      const { error: readReceiptError } = await admin
        .from("conversation_reads")
        .upsert({
          user_id: auPair.id,
          conversation_id: conversationId,
          last_read_at: new Date().toISOString(),
        });

      if (readReceiptError) {
        throw new Error(readReceiptError.message);
      }

      await page.reload();
      await expect(messageReadReceipt).toHaveAttribute("data-read", "true");

      const draftMessage = `QA saved draft ${suffix}`;
      await messageComposer.fill(draftMessage);
      await page.reload();
      await expect(messageComposer).toHaveValue(draftMessage);

      await page.goto("/search-aupair");
      await page.goto(`/messages?conversation=${conversationId}`);
      await expect(messageComposer).toHaveValue(draftMessage);

      await messageComposer.fill("");
      await page.reload();
      await expect(messageComposer).toHaveValue("");

      const pendingDraftStorageKey = `pa_message_pending_drafts:v1:${family.id}:${conversationId}`;
      const committedPendingMessageId = crypto.randomUUID();
      const committedPendingMessage = `QA committed pending ${suffix}`;
      const { error: committedPendingError } = await admin
        .from("messages")
        .insert({
          id: committedPendingMessageId,
          conversation_id: conversationId,
          sender_id: family.id,
          body: committedPendingMessage,
        });

      if (committedPendingError) {
        throw new Error(committedPendingError.message);
      }

      await page.addInitScript(
        ({ key, marker, messageId, text }) => {
          if (window.sessionStorage.getItem(marker)) return;

          window.localStorage.setItem(
            key,
            JSON.stringify([
              { messageId, text, createdAt: Date.now() - 30_000 },
            ]),
          );
          window.sessionStorage.setItem(marker, "set");
        },
        {
          key: pendingDraftStorageKey,
          marker: `qa-committed-pending:${committedPendingMessageId}`,
          messageId: committedPendingMessageId,
          text: committedPendingMessage,
        },
      );
      await page.reload();
      await expect(messageComposer).toHaveValue("");
      await expect
        .poll(() =>
          page.evaluate(
            (storageKey) => window.localStorage.getItem(storageKey),
            pendingDraftStorageKey,
          ),
        )
        .toBeNull();

      const failedPendingMessage = `QA failed pending ${suffix}`;
      await page.addInitScript(
        ({ key, marker, text }) => {
          if (window.sessionStorage.getItem(marker)) return;

          window.localStorage.setItem(
            key,
            JSON.stringify([
              {
                messageId: crypto.randomUUID(),
                text,
                createdAt: Date.now() - 30_000,
              },
            ]),
          );
          window.sessionStorage.setItem(marker, "set");
        },
        {
          key: pendingDraftStorageKey,
          marker: `qa-failed-pending:${suffix}`,
          text: failedPendingMessage,
        },
      );
      await page.reload();
      await expect(messageComposer).toHaveValue(failedPendingMessage);
      await messageComposer.fill("");
      await page.reload();
      await expect(messageComposer).toHaveValue("");

      let reservationAttempts = 0;
      await page.route(
        "**/rest/v1/rpc/reserve_message_send_slot",
        async (route) => {
          reservationAttempts += 1;

          if (reservationAttempts === 1) {
            await route.abort("failed");
            return;
          }

          await route.continue();
        },
      );

      const retriedMessage = `QA retried message ${suffix}`;
      await messageComposer.fill(retriedMessage);
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect
        .poll(async () => {
          const { count, error } = await admin
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conversationId)
            .eq("body", retriedMessage);

          if (error) {
            throw new Error(error.message);
          }

          return count ?? 0;
        })
        .toBe(1);
      expect(reservationAttempts).toBe(2);
      await expect
        .poll(() =>
          page.evaluate(
            (storageKey) => window.localStorage.getItem(storageKey),
            pendingDraftStorageKey,
          ),
        )
        .toBeNull();
      await expect(page.locator("body")).not.toContainText(
        /AbortError|Failed to fetch|Load failed/i,
      );
      await page.unroute("**/rest/v1/rpc/reserve_message_send_slot");

      const focusMessage = `QA composer focus ${suffix}`;
      await messageComposer.fill(focusMessage);
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(messageComposer).toBeFocused();
      await expect(messageComposer).toHaveValue("");
      await expect(messageScrollContainer.getByText(focusMessage)).toBeVisible();

      await setQaMessageVisualViewport(page, { height: 500, offsetTop: 44 });
      await expect
        .poll(() =>
          page.evaluate(() =>
            document.documentElement.style.getPropertyValue(
              "--pa-message-viewport-height",
            ),
          ),
        )
        .toBe("500px");

      const attachMediaButton = page.getByRole("button", {
        name: "Attach media",
        exact: true,
      });
      const photosAndVideosButton = page.getByRole("button", {
        name: "Photos & videos",
        exact: true,
      });

      await attachMediaButton.click();
      await expect(messageComposer).toBeFocused();
      await expect(photosAndVideosButton).toBeVisible();
      expect(
        await page.evaluate(() =>
          document.documentElement.style.getPropertyValue(
            "--pa-message-viewport-height",
          ),
        ),
      ).toBe("500px");

      await Promise.all([
        page.waitForEvent("filechooser"),
        photosAndVideosButton.click(),
      ]);
      await expect(photosAndVideosButton).not.toBeVisible();
      await expect(
        page.locator('[data-attachment-preview-state="awaiting-file"]'),
      ).toHaveCount(0);
      await expect(page.locator('[data-photo-preview-card="true"]')).toHaveCount(
        0,
      );
      await expect(messageComposer).toBeFocused();
      expect(
        await page.evaluate(() =>
          document.documentElement.style.getPropertyValue(
            "--pa-message-viewport-height",
          ),
        ),
      ).toBe("500px");

      await attachMediaButton.click();
      await expect(photosAndVideosButton).toBeVisible();
      await attachMediaButton.click();
      await expect(photosAndVideosButton).not.toBeVisible();
      await expect(messageComposer).toBeFocused();

      await messageScrollContainer.dispatchEvent("pointerdown", {
        bubbles: true,
        pointerType: "touch",
      });
      await expect(messageComposer).toBeFocused();
      expect(
        await page.evaluate(() =>
          document.documentElement.style.getPropertyValue(
            "--pa-message-viewport-height",
          ),
        ),
      ).toBe("500px");

      await messageScrollContainer.evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.evaluate(() => {
        window.visualViewport?.dispatchEvent(new Event("scroll"));
      });
      await page.waitForTimeout(350);

      const scrollTopAfterViewportScroll = await messageScrollContainer.evaluate(
        (element) => element.scrollTop,
      );
      expect(scrollTopAfterViewportScroll).toBeLessThanOrEqual(1);

      const readingScrollTop = await messageScrollContainer.evaluate(
        (element) => {
          element.scrollTop =
            element.scrollHeight - element.clientHeight - 40;
          return element.scrollTop;
        },
      );

      await setQaMessageVisualViewport(page, { height: 500, offsetTop: 44 });
      await expect
        .poll(() =>
          page.evaluate(() =>
            document.documentElement.style.getPropertyValue(
              "--pa-message-viewport-height",
            ),
          ),
        )
        .toBe("500px");

      const readingScrollTopAfterKeyboard =
        await messageScrollContainer.evaluate((element) => element.scrollTop);

      await expect(messageComposer).toBeFocused();
      expect(readingScrollTopAfterKeyboard).toBeCloseTo(readingScrollTop, 0);
    } finally {
      if (conversationId) {
        await admin
          .from("messages")
          .delete()
          .eq("conversation_id", conversationId);
        await admin.from("conversations").delete().eq("id", conversationId);
      }

      await cleanupProfiles(admin, [family, auPair]);
    }
  });

  test("mobile empty conversation resists viewport rubber band", async ({
    page,
  }) => {
    test.slow();

    const admin = createAdminClient();
    const client = createBrowserSupabaseClient();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let family: TestProfile | null = null;
    let auPair: TestProfile | null = null;
    let conversationId = "";

    try {
      [family, auPair] = await Promise.all([
        createProfile(admin, suffix, "family", {
          name: `QA Empty Chat Family ${suffix}`,
          withPhoto: true,
        }),
        createProfile(admin, suffix, "au_pair", {
          name: `QA Empty Chat Au Pair ${suffix}`,
          withPhoto: true,
        }),
      ]);

      const { error: signInError } = await client.auth.signInWithPassword({
        email: family.email,
        password: PASSWORD,
      });

      if (signInError) {
        throw new Error(signInError.message);
      }

      const { data: conversation, error: conversationError } = await client.rpc(
        "create_or_get_conversation",
        { p_profile_id: auPair.id },
      );

      if (conversationError || !conversation) {
        throw new Error(
          conversationError?.message ??
            "Could not create an empty QA conversation.",
        );
      }

      conversationId = String(conversation);
      await page.setViewportSize({ width: 390, height: 844 });
      await installQaMessageVisualViewport(page);

      const loginResponse = await page.request.post("/auth/login", {
        data: {
          email: family.email,
          password: PASSWORD,
        },
      });
      expect(loginResponse.ok()).toBe(true);
      await page.goto(`/messages?conversation=${conversationId}`, {
        waitUntil: "domcontentloaded",
      });

      const conversationPanel = page.getByTestId(
        "selected-conversation-panel",
      );
      const messageScrollContainer = page.locator(
        "[data-message-scroll-container]",
      );
      const messageComposer = page.locator(
        'form[data-message-composer] textarea[name="body"]',
      );

      await expect(conversationPanel).toBeVisible();
      await expect(messageScrollContainer).toBeVisible();
      await expect(messageComposer).not.toBeFocused();
      await expect
        .poll(() =>
          page.evaluate(() => document.body.style.touchAction),
        )
        .toBe("none");

      const gestureLock = await page.evaluate(() => {
        const messagesMain = document.querySelector<HTMLElement>(
          '[data-messages-gesture-lock="true"]',
        );
        const messageScroller = document.querySelector<HTMLElement>(
          "[data-message-scroll-container]",
        );

        return {
          bodyTouchAction: getComputedStyle(document.body).touchAction,
          mainTouchAction: messagesMain
            ? getComputedStyle(messagesMain).touchAction
            : null,
          rootTouchAction: getComputedStyle(
            document.documentElement,
          ).touchAction,
          scrollerTouchAction: messageScroller
            ? getComputedStyle(messageScroller).touchAction
            : null,
        };
      });

      expect(gestureLock).toEqual({
        bodyTouchAction: "none",
        mainTouchAction: "none",
        rootTouchAction: "none",
        scrollerTouchAction: "pan-y",
      });

      const emptyThreadMetrics = await messageScrollContainer.evaluate(
        (element) => ({
          clientHeight: element.clientHeight,
          overscrollBehaviorY: getComputedStyle(element).overscrollBehaviorY,
          scrollHeight: element.scrollHeight,
        }),
      );

      expect(emptyThreadMetrics.scrollHeight).toBeLessThanOrEqual(
        emptyThreadMetrics.clientHeight + 1,
      );
      expect(emptyThreadMetrics.overscrollBehaviorY).toBe("none");

      const geometryBeforeScaledViewport = await page.evaluate(() => ({
        height: document.documentElement.style.getPropertyValue(
          "--pa-message-viewport-height",
        ),
        top: document.documentElement.style.getPropertyValue(
          "--pa-message-viewport-offset-top",
        ),
      }));

      await setQaMessageVisualViewport(page, {
        height: 1_200,
        offsetTop: 260,
        scale: 0.7,
        events: ["resize", "scroll"],
      });
      await page.waitForTimeout(350);

      expect(
        await page.evaluate(() => ({
          height: document.documentElement.style.getPropertyValue(
            "--pa-message-viewport-height",
          ),
          top: document.documentElement.style.getPropertyValue(
            "--pa-message-viewport-offset-top",
          ),
        })),
      ).toEqual(geometryBeforeScaledViewport);

      await setQaMessageVisualViewport(page, {
        height: 844,
        offsetTop: 260,
        scale: 1,
        events: ["scroll"],
      });
      await expect
        .poll(() =>
          page.evaluate(() =>
            document.documentElement.style.getPropertyValue(
              "--pa-message-viewport-offset-top",
            ),
          ),
        )
        .toBe("0px");
      await expect
        .poll(() =>
          conversationPanel.evaluate(
            (element) => element.getBoundingClientRect().top,
          ),
        )
        .toBeLessThanOrEqual(1);

      await page.goto("/messages");
      const inboxScrollContainer = page.locator(
        '[data-messages-inbox-scroll-container="true"]',
      );

      await expect(inboxScrollContainer).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() => document.body.style.touchAction),
        )
        .toBe("none");
      expect(
        await page.evaluate(() => {
          const messagesMain = document.querySelector<HTMLElement>(
            '[data-messages-gesture-lock="true"]',
          );
          const inboxScroller = document.querySelector<HTMLElement>(
            '[data-messages-inbox-scroll-container="true"]',
          );

          return {
            inboxTouchAction: inboxScroller
              ? getComputedStyle(inboxScroller).touchAction
              : null,
            mainTouchAction: messagesMain
              ? getComputedStyle(messagesMain).touchAction
              : null,
          };
        }),
      ).toEqual({
        inboxTouchAction: "pan-y",
        mainTouchAction: "none",
      });
    } finally {
      if (conversationId) {
        await admin.from("conversations").delete().eq("id", conversationId);
      }

      await cleanupProfiles(admin, [family, auPair]);
    }
  });

  test("mobile composer growth keeps the latest read receipt visible", async ({
    page,
  }) => {
    test.slow();

    const admin = createAdminClient();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let family: TestProfile | null = null;
    let auPair: TestProfile | null = null;
    let conversationId = "";

    try {
      [family, auPair] = await Promise.all([
        createProfile(admin, suffix, "family", {
          name: `QA Composer Family ${suffix}`,
          withPhoto: true,
        }),
        createProfile(admin, suffix, "au_pair", {
          name: `QA Composer Au Pair ${suffix}`,
          withPhoto: true,
        }),
      ]);

      const { data: conversation, error: conversationError } = await admin
        .from("conversations")
        .insert({
          family_id: family.id,
          au_pair_id: auPair.id,
        })
        .select("id")
        .single();

      if (conversationError || !conversation) {
        throw new Error(
          conversationError?.message ?? "Could not create QA conversation.",
        );
      }

      conversationId = conversation.id;
      const createdAt = Date.now() - 60_000;
      const messageRows = Array.from({ length: 24 }, (_, index) => ({
        conversation_id: conversationId,
        sender_id: index % 2 === 0 ? auPair.id : family.id,
        body: `QA composer scroll message ${index + 1}`,
        created_at: new Date(createdAt + index * 1_000).toISOString(),
      }));

      const { error: messagesError } = await admin
        .from("messages")
        .insert(messageRows);

      if (messagesError) {
        throw new Error(messagesError.message);
      }

      const { error: readReceiptError } = await admin
        .from("conversation_reads")
        .upsert({
          user_id: auPair.id,
          conversation_id: conversationId,
          last_read_at: new Date(createdAt + 60_000).toISOString(),
        });

      if (readReceiptError) {
        throw new Error(readReceiptError.message);
      }

      await page.setViewportSize({ width: 390, height: 500 });
      const loginResponse = await page.request.post("/auth/login", {
        data: {
          email: family.email,
          password: PASSWORD,
        },
      });
      expect(loginResponse.ok()).toBe(true);
      await page.goto(`/messages?conversation=${conversationId}`, {
        waitUntil: "domcontentloaded",
      });

      const messageScrollContainer = page.locator(
        "[data-message-scroll-container]",
      );
      const messageComposer = page.locator(
        'form[data-message-composer] textarea[name="body"]',
      );
      const messageReadReceipt = page.locator(
        "[data-message-read-receipt]",
      );

      await expect(messageScrollContainer).toBeVisible();
      await expect(messageReadReceipt).toHaveAttribute("data-read", "true");
      await messageComposer.fill("One line draft");
      await messageScrollContainer.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(messageReadReceipt).toBeInViewport();

      const oneLineComposerHeight = await messageComposer.evaluate(
        (element) => element.getBoundingClientRect().height,
      );
      const wrappedDraft = Array.from(
        { length: 18 },
        () => "keep the latest read receipt visible",
      ).join(" ");

      await messageComposer.fill(wrappedDraft);
      await expect
        .poll(() =>
          messageComposer.evaluate(
            (element) => element.getBoundingClientRect().height,
          ),
        )
        .toBeGreaterThan(oneLineComposerHeight);
      await expect
        .poll(() =>
          messageScrollContainer.evaluate(
            (element) =>
              element.scrollHeight - element.scrollTop - element.clientHeight,
          ),
        )
        .toBeLessThanOrEqual(1);
      await expect(messageReadReceipt).toBeInViewport();
    } finally {
      if (conversationId) {
        await admin
          .from("messages")
          .delete()
          .eq("conversation_id", conversationId);
        await admin.from("conversations").delete().eq("id", conversationId);
      }

      await cleanupProfiles(admin, [family, auPair]);
    }
  });
});

test.describe("current public privacy and media regressions", () => {
  test("public search/profile RPCs hide unfinished or unsafe profiles and redact private fields", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let visibleAuPair: TestProfile | null = null;
    let noPhotoAuPair: TestProfile | null = null;
    let visibleFamily: TestProfile | null = null;
    let noPhotoFamily: TestProfile | null = null;
    let adminFamily: TestProfile | null = null;
    let deletedFamily: TestProfile | null = null;

    try {
      visibleAuPair = await createProfile(admin, suffix, "au_pair", {
        name: "Ana Ionescu",
        withPhoto: true,
      });
      noPhotoAuPair = await createProfile(admin, suffix, "au_pair", {
        name: `QA No Photo Au Pair ${suffix}`,
      });
      visibleFamily = await createProfile(admin, suffix, "family", {
        name: `QA Visible Family ${suffix}`,
        withPhoto: true,
      });
      noPhotoFamily = await createProfile(admin, suffix, "family", {
        name: `QA No Photo Family ${suffix}`,
      });
      adminFamily = await createProfile(admin, suffix, "family", {
        isAdmin: true,
        name: `QA Admin Family ${suffix}`,
        withPhoto: true,
      });
      deletedFamily = await createProfile(admin, suffix, "family", {
        deleted: true,
        name: `QA Deleted Family ${suffix}`,
        withPhoto: true,
      });

      const { data: familyCards, error: familyCardsError } = await admin.rpc(
        "get_bounded_public_profile_cards",
        {
          p_account_type: "family",
          p_filters: {},
          p_viewer_id: null,
          p_sort: "newest",
          p_page: 1,
          p_page_size: 24,
          p_guest_page_limit: null,
          p_include_countries: false,
        },
      );
      const familyIds = new Set(
        (((familyCards as { items?: Array<{ id: string }> } | null)?.items ?? [])).map(
          (profile) => profile.id,
        ),
      );

      expect(familyCardsError).toBeNull();
      expect(familyIds.has(visibleFamily.id)).toBe(true);
      expect(familyIds.has(noPhotoFamily.id)).toBe(false);
      expect(familyIds.has(adminFamily.id)).toBe(false);
      expect(familyIds.has(deletedFamily.id)).toBe(false);

      const { data: auPairCards, error: auPairCardsError } = await admin.rpc(
        "get_bounded_public_profile_cards",
        {
          p_account_type: "au_pair",
          p_filters: {},
          p_viewer_id: null,
          p_sort: "newest",
          p_page: 1,
          p_page_size: 24,
          p_guest_page_limit: null,
          p_include_countries: false,
        },
      );
      const auPairIds = new Set(
        (((auPairCards as { items?: Array<{ id: string }> } | null)?.items ?? [])).map(
          (profile) => profile.id,
        ),
      );

      expect(auPairCardsError).toBeNull();
      expect(auPairIds.has(visibleAuPair.id)).toBe(true);
      expect(auPairIds.has(noPhotoAuPair.id)).toBe(false);

      const { data: hiddenProfile } = await admin.rpc(
        "get_public_profile_by_identifier",
        { p_identifier: noPhotoFamily.publicSlug },
      );
      expect(hiddenProfile ?? []).toEqual([]);

      const { data: publicProfile, error: publicProfileError } = await admin.rpc(
        "get_public_profile_by_identifier",
        { p_identifier: visibleAuPair.publicSlug },
      );

      expect(publicProfileError).toBeNull();
      expect(publicProfile).toHaveLength(1);
      expect(Object.keys(publicProfile[0])).not.toEqual(
        expect.arrayContaining([
          "email",
          "phone_number",
          "phone_country_code",
          "street_address",
          "date_of_birth",
          "birth_date",
        ]),
      );

      await page.goto(`/profile/${visibleAuPair.id}`);
      await expect(page).toHaveURL(new RegExp(`/profile/${visibleAuPair.publicSlug}$`));
      await expect(page).toHaveTitle(
        `Ana, ${expectedAgeFromBirthDate(AU_PAIR_BIRTH_DATE)} | Perfect AuPair`,
      );
      await expect(page).not.toHaveTitle(
        /Ionescu|Berlin|Germany|Private Street|15123456789/,
      );
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex.*follow.*noimageindex/,
      );
      await expectNoNextErrorPage(page);
      const heroGermanyBadge = page.getByTestId(
        "profile-hero-already-in-germany",
      );
      const expectHeroGermanyBadgeLayout = async () => {
        const layout = await heroGermanyBadge.evaluate((element) => {
          const badgeBox = element.getBoundingClientRect();
          const identityContainer = element.closest(".relative");
          const reportLink = identityContainer?.querySelector(
            'a[href^="/report"]',
          );
          const reportBox = reportLink?.getBoundingClientRect() ?? null;
          const overlapsReport = reportBox
            ? !(
                badgeBox.right <= reportBox.left ||
                badgeBox.left >= reportBox.right ||
                badgeBox.bottom <= reportBox.top ||
                badgeBox.top >= reportBox.bottom
              )
            : false;

          return {
            overlapsReport,
            withinViewport:
              badgeBox.left >= 0 &&
              badgeBox.right <= document.documentElement.clientWidth,
          };
        });

        expect(layout.withinViewport).toBe(true);
        expect(layout.overlapsReport).toBe(false);
      };

      await page.setViewportSize({ width: 320, height: 844 });
      await expect(
        heroGermanyBadge.getByText("Already in Germany", { exact: true }),
      ).toBeVisible();
      await expectHeroGermanyBadgeLayout();
      await page.setViewportSize({ width: 1280, height: 900 });
      await expect(heroGermanyBadge).toBeVisible();
      await expectHeroGermanyBadgeLayout();
      await expect(
        page.getByText("Already in Germany", { exact: true }),
      ).toHaveCount(1);
      await expect(page.locator("body")).not.toContainText(visibleAuPair.email);
      await expect(page.locator("body")).not.toContainText("15123456789");
      await expect(page.locator("body")).not.toContainText("Private Street 42");
      await expect(page.locator("body")).not.toContainText("2000-01-01");

      const profilePhoto = page.locator(
        'img[src*="/api/media/profile-photo/"]',
      );
      await expect(profilePhoto).not.toHaveCount(0);
      const profilePhotoUrl = await profilePhoto.first().getAttribute("src");

      if (!profilePhotoUrl) {
        throw new Error("Public profile photo URL is missing.");
      }

      expect(
        new URL(profilePhotoUrl, page.url()).searchParams.get("width"),
      ).toBe("640");

      const profilePhotoResponse = await page.request.get(profilePhotoUrl);
      expect(profilePhotoResponse.status()).toBe(200);
      expect(profilePhotoResponse.headers()["x-robots-tag"]).toBe(
        "noindex, noimageindex",
      );
      const profilePhotoEtag = profilePhotoResponse.headers().etag;
      expect(profilePhotoEtag).toMatch(/^W\/"pa-v1-/);

      const unchangedProfilePhotoResponse = await page.request.get(
        profilePhotoUrl,
        { headers: { "If-None-Match": profilePhotoEtag } },
      );
      expect(unchangedProfilePhotoResponse.status()).toBe(304);

      const partialSlug = visibleAuPair.publicSlug.slice(0, -2);
      await page.goto(`/profile/${partialSlug}`);
      await expectNoNextErrorPage(page);
      await expect(page).not.toHaveURL(
        new RegExp(`/profile/${visibleAuPair.publicSlug}$`),
      );
      await expect(page.locator("body")).not.toContainText(visibleAuPair.email);
    } finally {
      await cleanupProfiles(admin, [
        visibleAuPair,
        noPhotoAuPair,
        visibleFamily,
        noPhotoFamily,
        adminFamily,
        deletedFamily,
      ]);
    }
  });

  test("family display names localize and own profile hides report action", async ({
    page,
  }) => {
    test.slow();
    const admin = createAdminClient();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let family: TestProfile | null = null;

    try {
      family = await createProfile(admin, suffix, "family", {
        name: "The Rossi family",
        withPhoto: true,
      });

      await page.context().addCookies([
        {
          name: "pa_locale",
          value: "it",
          url: "http://localhost:3000",
        },
        {
          name: LANGUAGE_PREFERENCE_VERSION_KEY,
          value: LANGUAGE_PREFERENCE_VERSION,
          url: "http://localhost:3000",
        },
        {
          name: COOKIE_CONSENT_COOKIE_NAME,
          value: "necessary",
          url: "http://localhost:3000",
        },
      ]);
      await page.goto(`/profile/${family.publicSlug}`);
      await expect(page).toHaveTitle("Host Family | Perfect AuPair");
      await expect(page).not.toHaveTitle(/Rossi|Austin|United States/);
      await expect(page.locator("body")).toContainText("Famiglia Rossi");
      await expect(page.locator("body")).not.toContainText("The Rossi family");

      await page.goto("/login");
      await page.getByLabel(/email/i).fill(family.email);
      await page.getByLabel(/password/i).fill(PASSWORD);
      await page.locator('form button[type="submit"]').click();
      await page.waitForURL(/\/search-aupair/, { timeout: 15_000 });

      await page.goto(`/profile/${family.publicSlug}`);
      await expectNoNextErrorPage(page);
      await expect(page.locator('a[href^="/report?"]')).toHaveCount(0);
      await expect(
        page.getByRole("button", {
          name: /report|segnala|melden|signaler|reportar|rapporteren/i,
        }),
      ).toHaveCount(0);
    } finally {
      await cleanupProfiles(admin, [family]);
    }
  });

  test("profile intro videos publish immediately and use the private proxy", async ({
    page,
    request,
  }) => {
    test.slow();
    const admin = createAdminClient();
    const browserClient = createBrowserSupabaseClient();
    const ownerClient = createBrowserSupabaseClient();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let auPair: TestProfile | null = null;
    let family: TestProfile | null = null;
    let noPhotoVideoOwner: TestProfile | null = null;
    let privateMediaFlagDisabled = false;

    try {
      auPair = await createProfile(admin, suffix, "au_pair", {
        name: `QA Video Au Pair ${suffix}`,
        withPhoto: true,
        withVideo: true,
      });
      family = await createProfile(admin, suffix, "family", {
        name: `QA Video Viewer Family ${suffix}`,
        withPhoto: true,
      });
      noPhotoVideoOwner = await createProfile(admin, suffix, "au_pair", {
        name: `QA No Photo Video Owner ${suffix}`,
        withVideo: true,
      });
      const configuredAdminEmails = new Set(
        (process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "")
          .split(",")
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      );
      expect(configuredAdminEmails.has(family.email.toLowerCase())).toBe(false);
      expect(
        configuredAdminEmails.has(noPhotoVideoOwner.email.toLowerCase()),
      ).toBe(false);

      const { data: video } = await admin
        .from("profile_videos")
        .select("storage_path")
        .eq("profile_id", auPair.id)
        .single();

      if (!video?.storage_path) {
        throw new Error("Profile video fixture was not created.");
      }

      const { data: noPhotoVideo } = await admin
        .from("profile_videos")
        .select("storage_path, content_moderation_status")
        .eq("profile_id", noPhotoVideoOwner.id)
        .single();

      if (!noPhotoVideo?.storage_path) {
        throw new Error("No-photo profile video fixture was not created.");
      }
      expect(noPhotoVideo.content_moderation_status).toBe("approved");

      const anonymousDownload = await browserClient.storage
        .from(PROFILE_VIDEO_BUCKET)
        .download(video.storage_path);
      expect(anonymousDownload.data).toBeNull();
      expect(anonymousDownload.error).not.toBeNull();

      const anonymousMetadata = await browserClient
        .from("profile_videos")
        .select("storage_path")
        .eq("profile_id", auPair.id)
        .single();

      expect(anonymousMetadata.error).not.toBeNull();
      expect(anonymousMetadata.data).toBeNull();

      const immediatePresence = await browserClient.rpc(
        "public_profile_has_approved_video",
        { p_profile_id: auPair.id },
      );
      expect(immediatePresence.error).toBeNull();
      expect(immediatePresence.data).toBe(true);

      const publicPreview = await browserClient.rpc(
        "public_profile_approved_video_preview",
        { p_profile_id: auPair.id },
      );
      expect(publicPreview.error).toBeNull();
      expect(publicPreview.data).toEqual([
        expect.objectContaining({
          has_video: true,
          poster_data_url: expect.stringMatching(
            /^data:image\/jpeg;base64,/,
          ),
        }),
      ]);

      const { error: ownerSignInError } =
        await ownerClient.auth.signInWithPassword({
          email: auPair.email,
          password: PASSWORD,
        });
      expect(ownerSignInError).toBeNull();

      const ownerApprovalAttempt = await ownerClient
        .from("profile_videos")
        .update({
          content_moderation_status: "approved",
          content_moderation_reviewed_at: new Date().toISOString(),
        })
        .eq("profile_id", auPair.id)
        .select("content_moderation_status, content_moderation_reviewed_at")
        .single();

      expect(ownerApprovalAttempt.error).toBeNull();
      expect(ownerApprovalAttempt.data).toMatchObject({
        content_moderation_status: "approved",
        content_moderation_reviewed_at: null,
      });

      const { error: signInError } = await browserClient.auth.signInWithPassword({
        email: family.email,
        password: PASSWORD,
      });

      expect(signInError).toBeNull();

      const [viewerEligibility, ownerEligibility, pairBlocked, deliveryFlag] =
        await Promise.all([
          browserClient.rpc("public_profile_is_eligible", {
            p_profile_id: family.id,
            p_require_photo: true,
          }),
          browserClient.rpc("public_profile_is_eligible", {
            p_profile_id: auPair.id,
            p_require_photo: true,
          }),
          browserClient.rpc("profile_pair_blocked", {
            p_first_profile_id: family.id,
            p_second_profile_id: auPair.id,
          }),
          browserClient.rpc("database_feature_flag_enabled", {
            p_key: "private_media_delivery",
          }),
        ]);
      expect(viewerEligibility).toMatchObject({ data: true, error: null });
      expect(ownerEligibility).toMatchObject({ data: true, error: null });
      expect(pairBlocked).toMatchObject({ data: false, error: null });
      expect(deliveryFlag).toMatchObject({ data: true, error: null });

      const authenticatedMetadata = await browserClient
        .from("profile_videos")
        .select("storage_path, content_moderation_status")
        .eq("profile_id", auPair.id)
        .single();
      expect(authenticatedMetadata.error).toBeNull();
      expect(authenticatedMetadata.data).toMatchObject({
        storage_path: video.storage_path,
        content_moderation_status: "approved",
      });

      const authenticatedDownload = await browserClient.storage
        .from(PROFILE_VIDEO_BUCKET)
        .download(video.storage_path);
      expect(authenticatedDownload.error).not.toBeNull();
      expect(authenticatedDownload.data).toBeNull();

      await page.goto("/login");
      await page.getByLabel(/email/i).fill(family.email);
      await page.getByLabel(/password/i).fill(PASSWORD);
      await page.locator("form").getByRole("button", { name: "Log in" }).click();
      await waitForSearchRoute(page);
      let eagerProfileVideoRequestCount = 0;
      page.on("request", (browserRequest) => {
        if (
          browserRequest
            .url()
            .includes("/api/media/private/profile-videos/")
        ) {
          eagerProfileVideoRequestCount += 1;
        }
      });
      await page.goto(`/profile/${auPair.publicSlug}`);

      const videoElement = page.locator("video").first();
      await expect(videoElement).toHaveAttribute(
        "src",
        new RegExp(`/api/media/private/profile-videos/${auPair.id}/`),
      );
      await expect(videoElement).toHaveAttribute(
        "poster",
        /^data:image\/jpeg;base64,/,
      );
      await expect(videoElement).toHaveAttribute("preload", "none");
      await expect(videoElement).not.toHaveAttribute("playsinline", "");
      const photoTile = page.getByTestId("profile-photo-tile");
      const videoTile = page.getByTestId("profile-video-tile");
      await expect(photoTile).toHaveCount(1);
      await expect(videoTile).toHaveCount(1);
      await expect(photoTile).toBeVisible();
      await expect(videoTile).toBeVisible();
      const photoTileBox = await photoTile.boundingBox();
      const videoTileBox = await videoTile.boundingBox();
      expect(photoTileBox).not.toBeNull();
      expect(videoTileBox).not.toBeNull();
      expect(videoTileBox!.width / photoTileBox!.width).toBeGreaterThan(1.9);
      expect(videoTileBox!.width / photoTileBox!.width).toBeLessThan(2.2);
      expect(Math.abs(videoTileBox!.height - videoTileBox!.width)).toBeLessThan(
        1,
      );
      await page.waitForTimeout(500);
      expect(eagerProfileVideoRequestCount).toBe(0);
      const videoPlayButton = page.getByTestId("profile-video-play");
      await expect(videoPlayButton).toBeVisible();
      await videoElement.evaluate((element) => {
        const video = element as HTMLVideoElement;

        Object.defineProperty(video, "play", {
          configurable: true,
          value: () => {
            video.dataset.playRequested = "true";
            return Promise.resolve();
          },
        });
        Object.defineProperty(video, "webkitEnterFullscreen", {
          configurable: true,
          value: () => {
            throw new DOMException(
              "The object is in an invalid state.",
              "InvalidStateError",
            );
          },
        });
        Object.defineProperty(video, "requestFullscreen", {
          configurable: true,
          value: () => {
            video.dataset.fullscreenRequested = "true";
            return Promise.resolve();
          },
        });
      });
      await videoPlayButton.click();
      await expect(videoElement).not.toHaveAttribute(
        "data-fullscreen-requested",
        "true",
      );
      await expect(videoElement).toHaveAttribute("data-play-requested", "true");
      await expect(videoElement).toHaveAttribute("controls", "");
      const videoSrc = await videoElement.getAttribute("src");

      if (!videoSrc) {
        throw new Error("Private profile video URL was not rendered.");
      }

      const guestProxyResponse = await request.get(videoSrc, {
        headers: { Range: "bytes=0-1" },
      });
      expect(guestProxyResponse.status()).toBe(404);

      const { error: clearViewerCountersError } = await admin
        .from("private_media_delivery_counters")
        .update({
          byte_count: 0,
          request_count: 0,
          window_started_at: "2000-01-01T00:00:00.000Z",
        })
        .eq("bucket_id", "*")
        .in("scope", ["viewer_10m", "viewer_day"]);
      expect(clearViewerCountersError).toBeNull();

      const proxyResponse = await page.request.get(videoSrc, {
        headers: { Range: "bytes=0-1" },
      });
      expect(proxyResponse.status()).toBe(206);
      expect(proxyResponse.headers()["content-range"]).toMatch(
        /^bytes 0-1\/\d+$/,
      );
      expect(proxyResponse.headers()["content-length"]).toBe("2");
      expect(proxyResponse.headers()["location"]).toBeUndefined();
      expect(proxyResponse.headers()["cache-control"]).toContain(
        "private, no-store",
      );
      expect(proxyResponse.headers()["cross-origin-resource-policy"]).toBe(
        "same-site",
      );
      expect(proxyResponse.headers()["x-content-type-options"]).toBe(
        "nosniff",
      );
      expect(await proxyResponse.body()).toEqual(Buffer.from("qa"));

      const { data: viewerCounter, error: viewerCounterError } = await admin
        .from("private_media_delivery_counters")
        .select("window_started_at, request_count, byte_count")
        .eq("bucket_id", "*")
        .eq("scope", "viewer_10m")
        .gt("request_count", 0)
        .single();
      expect(viewerCounterError).toBeNull();
      expect(viewerCounter).toMatchObject({ request_count: 1, byte_count: 2 });

      const { data: viewerCounterIdentity } = await admin
        .from("private_media_delivery_counters")
        .select("identity_hash")
        .eq("bucket_id", "*")
        .eq("scope", "viewer_10m")
        .gt("request_count", 0)
        .single();
      expect(viewerCounterIdentity?.identity_hash).toMatch(/^s\d{4}$/);

      const currentHour = new Date();
      currentHour.setUTCMinutes(0, 0, 0);
      const { error: resetAtomicViewerCountersError } = await admin
        .from("private_media_delivery_counters")
        .update({
          byte_count: 0,
          request_count: 0,
          window_started_at: "2000-01-01T00:00:00.000Z",
        })
        .eq("bucket_id", "*")
        .in("scope", ["viewer_10m", "viewer_day"]);
      expect(resetAtomicViewerCountersError).toBeNull();

      const { error: saturateBucketCountersError } = await admin
        .from("private_media_delivery_counters")
        .update({
          byte_count: 0,
          request_count: 1_250,
          window_started_at: currentHour.toISOString(),
        })
        .eq("bucket_id", PROFILE_VIDEO_BUCKET)
        .eq("scope", "bucket_hour");
      expect(saturateBucketCountersError).toBeNull();

      const rejectedSharedQuotaAccess = await admin.rpc(
        "get_private_media_access",
        {
          p_bucket_id: PROFILE_VIDEO_BUCKET,
          p_ip_hash: "a".repeat(64),
          p_ip_prefix_hash: "b".repeat(64),
          p_is_admin: false,
          p_range_end: 1,
          p_range_start: 0,
          p_range_suffix: null,
          p_storage_path: video.storage_path,
          p_viewer_id: family.id,
        },
      );
      expect(rejectedSharedQuotaAccess.error).toBeNull();
      expect(rejectedSharedQuotaAccess.data).toEqual([
        expect.objectContaining({ allowed: false, charged_bytes: 2 }),
      ]);

      const { data: viewerCountersAfterSharedRejection, error: atomicError } =
        await admin
          .from("private_media_delivery_counters")
          .select("request_count, byte_count")
          .eq("bucket_id", "*")
          .in("scope", ["viewer_10m", "viewer_day"]);
      expect(atomicError).toBeNull();
      expect(viewerCountersAfterSharedRejection).not.toHaveLength(0);
      expect(
        viewerCountersAfterSharedRejection?.every(
          (counter) =>
            counter.request_count === 0 && counter.byte_count === 0,
        ),
      ).toBe(true);

      const { error: clearBucketCountersError } = await admin
        .from("private_media_delivery_counters")
        .update({
          byte_count: 0,
          request_count: 0,
          window_started_at: "2000-01-01T00:00:00.000Z",
        })
        .eq("bucket_id", PROFILE_VIDEO_BUCKET)
        .eq("scope", "bucket_hour");
      expect(clearBucketCountersError).toBeNull();

      const malformedRange = await page.request.get(videoSrc, {
        headers: { Range: "bytes=0-1,3-4" },
      });
      expect(malformedRange.status()).toBe(416);
      expect(malformedRange.headers()["content-range"]).toBeUndefined();

      const outOfBoundsRange = await page.request.get(videoSrc, {
        headers: { Range: "bytes=999999-1000000" },
      });
      expect(outOfBoundsRange.status()).toBe(416);
      expect(outOfBoundsRange.headers()["content-range"]).toMatch(
        /^bytes \*\/\d+$/,
      );

      const { error: disablePrivateMediaError } = await admin
        .from("feature_flags")
        .update({ enabled: false })
        .eq("key", "private_media_delivery");
      expect(disablePrivateMediaError).toBeNull();
      privateMediaFlagDisabled = true;

      const disabledProxyResponse = await page.request.get(videoSrc, {
        headers: { Range: "bytes=0-1" },
      });
      expect(disabledProxyResponse.status()).toBe(404);

      const { error: restorePrivateMediaError } = await admin
        .from("feature_flags")
        .update({ enabled: true })
        .eq("key", "private_media_delivery");
      expect(restorePrivateMediaError).toBeNull();
      privateMediaFlagDisabled = false;

      const currentTenMinute = new Date();
      currentTenMinute.setUTCMinutes(
        Math.floor(currentTenMinute.getUTCMinutes() / 10) * 10,
        0,
        0,
      );
      const { error: saturateViewerCounterError } = await admin
        .from("private_media_delivery_counters")
        .update({
          byte_count: 0,
          request_count: 400,
          window_started_at: currentTenMinute.toISOString(),
        })
        .eq("bucket_id", "*")
        .eq("scope", "viewer_10m")
        .eq("identity_hash", viewerCounterIdentity?.identity_hash);
      expect(saturateViewerCounterError).toBeNull();

      const limitedProxyResponse = await page.request.get(videoSrc, {
        headers: { Range: "bytes=0-1" },
      });
      expect(limitedProxyResponse.status()).toBe(429);
      expect(
        Number(limitedProxyResponse.headers()["retry-after"]),
      ).toBeGreaterThan(0);

      const { error: clearSaturatedCounterError } = await admin
        .from("private_media_delivery_counters")
        .update({
          byte_count: 0,
          request_count: 0,
          window_started_at: "2000-01-01T00:00:00.000Z",
        })
        .eq("bucket_id", "*")
        .eq("scope", "viewer_10m")
        .eq("identity_hash", viewerCounterIdentity?.identity_hash);
      expect(clearSaturatedCounterError).toBeNull();

      const { data: suspendedViewer, error: suspendViewerError } = await admin
        .from("profiles")
        .update({ suspended_at: new Date().toISOString() })
        .eq("id", family.id)
        .select("suspended_at")
        .single();
      expect(suspendViewerError).toBeNull();
      expect(suspendedViewer?.suspended_at).not.toBeNull();

      const suspendedMediaAccess = await admin.rpc("get_private_media_access", {
        p_bucket_id: PROFILE_VIDEO_BUCKET,
        p_ip_hash: "c".repeat(64),
        p_ip_prefix_hash: "d".repeat(64),
        p_is_admin: false,
        p_range_end: 1,
        p_range_start: 0,
        p_range_suffix: null,
        p_storage_path: video.storage_path,
        p_viewer_id: family.id,
      });
      expect(suspendedMediaAccess.error).toBeNull();
      expect(suspendedMediaAccess.data).toEqual([]);

      const suspendedProxyResponse = await page.request.get(videoSrc, {
        headers: { Range: "bytes=0-1" },
      });
      expect(suspendedProxyResponse.status()).toBe(404);

      const { error: restoreSuspendedViewerError } = await admin
        .from("profiles")
        .update({ suspended_at: null })
        .eq("id", family.id);
      expect(restoreSuspendedViewerError).toBeNull();

      const deletionRequestedAt = new Date().toISOString();
      const { data: deletionPendingViewer, error: markDeletionPendingError } =
        await admin
          .from("profiles")
          .update({
            deletion_requested_at: deletionRequestedAt,
            deletion_scheduled_at: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1_000,
            ).toISOString(),
          })
          .eq("id", family.id)
          .select("deletion_requested_at")
          .single();
      expect(markDeletionPendingError).toBeNull();
      expect(
        new Date(
          deletionPendingViewer?.deletion_requested_at ?? 0,
        ).getTime(),
      ).toBe(new Date(deletionRequestedAt).getTime());

      const deletionPendingProxyResponse = await page.request.get(videoSrc, {
        headers: { Range: "bytes=0-1" },
      });
      expect(deletionPendingProxyResponse.status()).toBe(404);

      const { error: restoreDeletionPendingViewerError } = await admin
        .from("profiles")
        .update({
          deletion_requested_at: null,
          deletion_scheduled_at: null,
        })
        .eq("id", family.id);
      expect(restoreDeletionPendingViewerError).toBeNull();

      const noPhotoVideoSrc =
        `/api/media/private/${PROFILE_VIDEO_BUCKET}/${noPhotoVideo.storage_path}`;
      const ineligibleOwnerVideoOtherViewerResponse = await page.request.get(
        noPhotoVideoSrc,
        { headers: { Range: "bytes=0-1" } },
      );
      expect(ineligibleOwnerVideoOtherViewerResponse.status()).toBe(404);

      await page.context().clearCookies();
      await page.context().addCookies([
        {
          name: COOKIE_CONSENT_COOKIE_NAME,
          value: "necessary",
          url: "http://localhost:3000",
        },
      ]);
      await page.goto("/login");
      await page.getByLabel(/email/i).fill(noPhotoVideoOwner.email);
      await page.getByLabel(/password/i).fill(PASSWORD);
      await page.locator("form").getByRole("button", { name: "Log in" }).click();
      await page.waitForURL(/\/profile\/photos/, { timeout: 15_000 });

      const noPhotoVideoOwnerResponse = await page.request.get(
        noPhotoVideoSrc,
        { headers: { Range: "bytes=0-1" } },
      );
      expect(noPhotoVideoOwnerResponse.status()).toBe(206);
      expect(await noPhotoVideoOwnerResponse.body()).toEqual(Buffer.from("qa"));
    } finally {
      if (privateMediaFlagDisabled) {
        await admin
          .from("feature_flags")
          .update({ enabled: true })
          .eq("key", "private_media_delivery");
      }
      if (family) {
        await admin
          .from("private_media_delivery_counters")
          .update({
            byte_count: 0,
            request_count: 0,
            window_started_at: "2000-01-01T00:00:00.000Z",
          })
          .neq("identity_hash", "qa-never-matches");
      }
      await browserClient.auth.signOut();
      await ownerClient.auth.signOut();
      await cleanupProfiles(admin, [auPair, family, noPhotoVideoOwner]);
    }
  });
});

test.describe("current retention cleanup regressions", () => {
  test("retained message cleanup removes expired photos, videos, and audio only", async () => {
    const admin = createAdminClient();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const expiredPhotoPath = `qa-retained/${suffix}/expired-photo.png`;
    const activePhotoPath = `qa-retained/${suffix}/active-photo.png`;
    const expiredVideoPath = `qa-retained/${suffix}/expired-video.mp4`;
    const activeVideoPath = `qa-retained/${suffix}/active-video.mp4`;
    const expiredAudioPath = `qa-retained/${suffix}/expired-audio.webm`;
    const activeAudioPath = `qa-retained/${suffix}/active-audio.webm`;
    const photoBytes = readFileSync(join(process.cwd(), "tests/fixtures/profile-photo.png"));
    const videoBytes = Buffer.from("qa retained video fixture");
    const audioBytes = Buffer.from("qa retained audio fixture");

    try {
      await Promise.all([
        admin.storage.from(MESSAGE_PHOTO_BUCKET).upload(expiredPhotoPath, photoBytes, {
          contentType: "image/png",
          upsert: true,
        }),
        admin.storage.from(MESSAGE_PHOTO_BUCKET).upload(activePhotoPath, photoBytes, {
          contentType: "image/png",
          upsert: true,
        }),
        admin.storage.from(MESSAGE_VIDEO_BUCKET).upload(expiredVideoPath, videoBytes, {
          contentType: "video/mp4",
          upsert: true,
        }),
        admin.storage.from(MESSAGE_VIDEO_BUCKET).upload(activeVideoPath, videoBytes, {
          contentType: "video/mp4",
          upsert: true,
        }),
        admin.storage.from(MESSAGE_AUDIO_BUCKET).upload(expiredAudioPath, audioBytes, {
          contentType: "audio/webm",
          upsert: true,
        }),
        admin.storage.from(MESSAGE_AUDIO_BUCKET).upload(activeAudioPath, audioBytes, {
          contentType: "audio/webm",
          upsert: true,
        }),
      ]);

      await admin.from("retained_message_photos").insert([
        {
          original_image_path: expiredPhotoPath,
          image_mime_type: "image/png",
          retained_until: "2026-01-01T00:00:00.000Z",
        },
        {
          original_image_path: activePhotoPath,
          image_mime_type: "image/png",
          retained_until: "2026-12-31T00:00:00.000Z",
        },
      ]);
      await admin.from("retained_message_videos").insert([
        {
          original_video_path: expiredVideoPath,
          video_mime_type: "video/mp4",
          video_size_bytes: videoBytes.byteLength,
          video_duration_seconds: 3,
          retained_until: "2026-01-01T00:00:00.000Z",
        },
        {
          original_video_path: activeVideoPath,
          video_mime_type: "video/mp4",
          video_size_bytes: videoBytes.byteLength,
          video_duration_seconds: 3,
          retained_until: "2026-12-31T00:00:00.000Z",
        },
      ]);
      await admin.from("retained_message_audio").insert([
        {
          original_audio_path: expiredAudioPath,
          audio_mime_type: "audio/webm",
          audio_size_bytes: audioBytes.byteLength,
          audio_duration_seconds: 2,
          retained_until: "2026-01-01T00:00:00.000Z",
        },
        {
          original_audio_path: activeAudioPath,
          audio_mime_type: "audio/webm",
          audio_size_bytes: audioBytes.byteLength,
          audio_duration_seconds: 2,
          retained_until: "2026-12-31T00:00:00.000Z",
        },
      ]);

      const result = await cleanupRetainedMessagePhotos({
        supabase: admin,
        now: new Date("2026-07-04T12:00:00.000Z"),
      });

      expect(result.deletedPhotoRows).toBe(1);
      expect(result.deletedVideoRows).toBe(1);
      expect(result.deletedAudioRows).toBe(1);
      expect(result.deletedRows).toBe(3);
      expect(result.removedFiles).toBe(3);

      const [expiredPhoto, activePhoto, expiredVideo, activeVideo, expiredAudio, activeAudio] =
        await Promise.all([
          admin.storage.from(MESSAGE_PHOTO_BUCKET).download(expiredPhotoPath),
          admin.storage.from(MESSAGE_PHOTO_BUCKET).download(activePhotoPath),
          admin.storage.from(MESSAGE_VIDEO_BUCKET).download(expiredVideoPath),
          admin.storage.from(MESSAGE_VIDEO_BUCKET).download(activeVideoPath),
          admin.storage.from(MESSAGE_AUDIO_BUCKET).download(expiredAudioPath),
          admin.storage.from(MESSAGE_AUDIO_BUCKET).download(activeAudioPath),
        ]);

      expect(expiredPhoto.data).toBeNull();
      expect(expiredVideo.data).toBeNull();
      expect(expiredAudio.data).toBeNull();
      expect(activePhoto.error).toBeNull();
      expect(activeVideo.error).toBeNull();
      expect(activeAudio.error).toBeNull();
    } finally {
      await admin.storage
        .from(MESSAGE_PHOTO_BUCKET)
        .remove([expiredPhotoPath, activePhotoPath]);
      await admin.storage
        .from(MESSAGE_VIDEO_BUCKET)
        .remove([expiredVideoPath, activeVideoPath]);
      await admin.storage
        .from(MESSAGE_AUDIO_BUCKET)
        .remove([expiredAudioPath, activeAudioPath]);
      await admin
        .from("retained_message_photos")
        .delete()
        .in("original_image_path", [expiredPhotoPath, activePhotoPath]);
      await admin
        .from("retained_message_videos")
        .delete()
        .in("original_video_path", [expiredVideoPath, activeVideoPath]);
      await admin
        .from("retained_message_audio")
        .delete()
        .in("original_audio_path", [expiredAudioPath, activeAudioPath]);
    }
  });
});
