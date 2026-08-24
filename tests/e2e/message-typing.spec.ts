import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  LANGUAGE_PREFERENCE_VERSION,
  LANGUAGE_PREFERENCE_VERSION_KEY,
} from "../../lib/i18n/config";
import {
  COOKIE_CONSENT_COOKIE_NAME,
  COOKIE_CONSENT_STORAGE_KEY,
} from "../../lib/analytics/consent";
import { getSupabaseCredentials } from "./helpers/supabase-local";

const PASSWORD = "TestPassword123!";
const PROFILE_PHOTO_BUCKET = "profile-photos";

type AccountType = "family" | "au_pair";

type TestProfile = {
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

async function authenticatePage(page: Page, email: string) {
  const response = await page.request.post("/auth/login", {
    data: { email, password: PASSWORD },
  });

  expect(response.ok()).toBe(true);

  await page.context().addCookies([
    {
      name: "pa_locale",
      value: "en",
      url: new URL(page.url() || "http://localhost").origin,
    },
    {
      name: LANGUAGE_PREFERENCE_VERSION_KEY,
      value: LANGUAGE_PREFERENCE_VERSION,
      url: new URL(page.url() || "http://localhost").origin,
    },
    {
      name: COOKIE_CONSENT_COOKIE_NAME,
      value: "necessary",
      url: new URL(page.url() || "http://localhost").origin,
    },
  ]);

  await page.evaluate(
    ([storageKey]) => window.localStorage.setItem(storageKey, "necessary"),
    [COOKIE_CONSENT_STORAGE_KEY],
  );
}

async function openConversationFromInbox(page: Page, conversationId: string) {
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    await page.getByRole("link", { name: "Go back" }).click();
    await expect(page).toHaveURL(/\/messages$/);
  }

  const conversationLink = page
    .locator(
      `a[href="/messages?conversation=${encodeURIComponent(conversationId)}"]`,
    )
    .first();

  await expect(conversationLink).toBeVisible();
  await conversationLink.click();
  await expect(page).toHaveURL(new RegExp(`conversation=${conversationId}$`));
}

async function createProfile(
  admin: SupabaseClient,
  accountType: AccountType,
  suffix: string,
): Promise<TestProfile> {
  const label =
    accountType === "family" ? "Qa Typing Family" : "Qa Typing Au Pair";
  const email = `qa-message-typing-${accountType}-${suffix}@example.com`;
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { account_type: accountType },
    });

  if (createError || !created.user) {
    throw new Error(createError?.message ?? "Could not create test account.");
  }

  const id = created.user.id;
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      account_type: accountType,
      onboarding_completed: true,
      first_name: accountType === "au_pair" ? "Qa Typing" : null,
      last_name: accountType === "au_pair" ? "Au Pair" : null,
      full_name: label,
      country: accountType === "family" ? "United States" : "Germany",
      city: accountType === "family" ? "Austin" : "Berlin",
      preferred_host_countries:
        accountType === "au_pair" ? ["Germany", "United States"] : [],
      content_moderation_status: "approved",
      content_moderation_reviewed_at: new Date().toISOString(),
      content_moderation_reason: "QA typing fixture approved.",
    })
    .eq("id", id);

  if (profileError) {
    throw new Error(profileError.message);
  }

  const photoPath = `${id}/message-typing-${suffix}.png`;
  const photo = readFileSync(
    join(process.cwd(), "tests/fixtures/profile-photo.png"),
  );
  const { error: uploadError } = await admin.storage
    .from(PROFILE_PHOTO_BUCKET)
    .upload(photoPath, photo, { contentType: "image/png", upsert: false });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { error: photoError } = await admin.from("profile_photos").insert({
    profile_id: id,
    storage_path: photoPath,
    is_primary: true,
    sort_order: 0,
  });

  if (photoError) {
    throw new Error(photoError.message);
  }

  return { email, id, photoPath };
}

async function removeProfile(
  admin: SupabaseClient,
  profile: TestProfile | null,
) {
  if (!profile) return;

  await admin.storage
    .from(PROFILE_PHOTO_BUCKET)
    .remove([profile.photoPath]);
  await admin.from("profile_photos").delete().eq("profile_id", profile.id);
  await admin.from("profiles").delete().eq("id", profile.id);
  await admin.auth.admin.deleteUser(profile.id);
}

test("typing indicator is visible only to the other participant and stops on clear, blur, and send", async ({
  baseURL,
  browser,
  page: recipientPage,
}) => {
  test.slow();

  const appBaseUrl = baseURL ?? "http://localhost:3000";
  const admin = createAdminClient();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let recipient: TestProfile | null = null;
  let sender: TestProfile | null = null;
  let secondSender: TestProfile | null = null;
  let conversationId = "";
  let secondConversationId = "";
  let senderContext: BrowserContext | null = null;

  try {
    recipient = await createProfile(admin, "family", `${suffix}-recipient`);
    sender = await createProfile(admin, "au_pair", `${suffix}-sender`);
    secondSender = await createProfile(
      admin,
      "au_pair",
      `${suffix}-second-sender`,
    );

    const { error: secondSenderNameError } = await admin
      .from("profiles")
      .update({
        first_name: "Qa Second",
        last_name: "Au Pair",
        full_name: "Qa Second Au Pair",
      })
      .eq("id", secondSender.id);

    if (secondSenderNameError) {
      throw new Error(secondSenderNameError.message);
    }

    const { data: conversation, error: conversationError } = await admin
      .from("conversations")
      .insert({ family_id: recipient.id, au_pair_id: sender.id })
      .select("id")
      .single();

    if (conversationError || !conversation) {
      throw new Error(
        conversationError?.message ?? "Could not create test conversation.",
      );
    }

    conversationId = conversation.id;
    const { data: secondConversation, error: secondConversationError } =
      await admin
        .from("conversations")
        .insert({ family_id: recipient.id, au_pair_id: secondSender.id })
        .select("id")
        .single();

    if (secondConversationError || !secondConversation) {
      throw new Error(
        secondConversationError?.message ??
          "Could not create second test conversation.",
      );
    }

    secondConversationId = secondConversation.id;
    const { error: initialMessageError } = await admin.from("messages").insert({
      conversation_id: conversationId,
      sender_id: recipient.id,
      body: "Initial typing indicator test message",
    });

    if (initialMessageError) {
      throw new Error(initialMessageError.message);
    }

    const { error: secondInitialMessageError } = await admin
      .from("messages")
      .insert({
        conversation_id: secondConversationId,
        sender_id: recipient.id,
        body: "Initial second conversation message",
      });

    if (secondInitialMessageError) {
      throw new Error(secondInitialMessageError.message);
    }

    await recipientPage.goto(appBaseUrl);
    await authenticatePage(recipientPage, recipient.email);

    senderContext = await browser.newContext({ baseURL: appBaseUrl });
    const senderPage = await senderContext.newPage();
    await senderPage.goto(appBaseUrl);
    await authenticatePage(senderPage, sender.email);

    const conversationRefreshes = new Map<Page, number>([
      [recipientPage, 0],
      [senderPage, 0],
    ]);
    const countConversationRefresh = (page: Page) =>
      page.on("request", (request) => {
        const requestUrl = new URL(request.url());

        if (
          requestUrl.pathname === "/messages" &&
          request.resourceType() === "fetch" &&
          request.headers().rsc === "1"
        ) {
          conversationRefreshes.set(
            page,
            (conversationRefreshes.get(page) ?? 0) + 1,
          );
        }
      });

    countConversationRefresh(recipientPage);
    countConversationRefresh(senderPage);

    await Promise.all([
      recipientPage.goto(`/messages?conversation=${conversationId}`),
      senderPage.goto(`/messages?conversation=${conversationId}`),
    ]);

    const recipientIndicator = recipientPage.locator(
      "[data-message-typing-indicator]",
    );
    const senderIndicator = senderPage.locator(
      "[data-message-typing-indicator]",
    );
    const senderComposer = senderPage.locator(
      'form[data-message-composer] textarea[name="body"]',
    );

    await expect(senderComposer).toBeVisible();
    await expect(recipientIndicator).toHaveCount(1);
    await expect(senderIndicator).toHaveCount(1);
    await expect(recipientIndicator).not.toBeVisible();
    await expect(senderIndicator).not.toBeVisible();

    await senderPage.waitForTimeout(3_500);
    expect(conversationRefreshes.get(recipientPage) ?? 0).toBeLessThanOrEqual(2);
    expect(conversationRefreshes.get(senderPage) ?? 0).toBeLessThanOrEqual(2);

    await senderComposer.pressSequentially("Hello", { delay: 350 });
    await expect(recipientIndicator).toBeVisible();
    await expect(recipientIndicator).toHaveText(
      "Qa Typing Au Pair is typing…",
    );
    await expect(senderIndicator).not.toBeVisible();

    await senderComposer.fill("");
    await expect(recipientIndicator).not.toBeVisible();

    await senderComposer.pressSequentially("Blur", { delay: 350 });
    await expect(recipientIndicator).toBeVisible();
    await senderComposer.blur();
    await expect(recipientIndicator).not.toBeVisible();

    const sentMessage = `Typing send ${suffix}`;
    await senderComposer.fill("");
    await senderComposer.pressSequentially(sentMessage, { delay: 100 });
    await expect(recipientIndicator).toBeVisible();
    await senderPage
      .getByRole("button", { name: "Send", exact: true })
      .click();

    await expect(recipientIndicator).not.toBeVisible();
    await expect(
      recipientPage
        .locator("[data-message-scroll-container]")
        .getByText(sentMessage, { exact: true }),
    ).toBeVisible();
    await expect(senderIndicator).not.toBeVisible();

    await senderComposer.pressSequentially("Pending block", { delay: 100 });
    await expect(recipientIndicator).toBeVisible();

    await recipientPage
      .getByRole("button", { name: "Conversation actions" })
      .last()
      .click();
    await recipientPage.getByRole("button", { name: "Block", exact: true }).click();
    await recipientPage
      .getByRole("dialog")
      .getByRole("button", { name: "Block", exact: true })
      .click();
    await expect(
      recipientPage.getByRole("heading", {
        name: "User unavailable",
        exact: true,
        level: 1,
      }),
    ).toBeVisible();

    await openConversationFromInbox(recipientPage, secondConversationId);
    await expect(
      recipientPage.getByRole("heading", {
        name: "Qa Second Au Pair",
        exact: true,
        level: 1,
      }),
    ).toBeVisible();

    const secondConversationComposer = recipientPage.locator(
      'form[data-message-composer] textarea[name="body"]',
    );
    await expect(secondConversationComposer).toBeVisible();
    await expect(
      recipientPage.getByText("You blocked Qa Second Au Pair", { exact: true }),
    ).toHaveCount(0);

    await recipientPage
      .getByRole("button", { name: "Conversation actions" })
      .last()
      .click();
    await expect(
      recipientPage.getByRole("button", { name: "Block", exact: true }),
    ).toBeVisible();
    await expect(
      recipientPage.getByRole("button", { name: "Unblock", exact: true }),
    ).toHaveCount(0);
    await recipientPage
      .getByRole("button", { name: "Conversation actions" })
      .last()
      .click();

    const secondConversationMessage = `Second chat remains open ${suffix}`;
    await secondConversationComposer.fill(secondConversationMessage);
    await recipientPage
      .getByRole("button", { name: "Send", exact: true })
      .click();
    await expect(
      recipientPage
        .locator("[data-message-scroll-container]")
        .getByText(secondConversationMessage, { exact: true }),
    ).toBeVisible();

    const { data: activeBlocks, error: activeBlocksError } = await admin
      .from("profile_blocks")
      .select("blocker_id, blocked_profile_id")
      .eq("blocker_id", recipient.id);

    if (activeBlocksError) {
      throw new Error(activeBlocksError.message);
    }

    expect(activeBlocks).toEqual([
      {
        blocker_id: recipient.id,
        blocked_profile_id: sender.id,
      },
    ]);

    await openConversationFromInbox(recipientPage, conversationId);
    await expect(
      recipientPage.getByRole("heading", {
        name: "User unavailable",
        exact: true,
        level: 1,
      }),
    ).toBeVisible();
    await expect(
      recipientPage.locator('form[data-message-composer]'),
    ).toHaveCount(0);

    await recipientPage
      .getByRole("button", { name: "Unblock", exact: true })
      .click();
    await recipientPage
      .getByRole("dialog")
      .getByRole("button", { name: "Unblock", exact: true })
      .click();
    await expect(recipientIndicator).toHaveCount(1);
    await expect(recipientIndicator).not.toBeVisible();
    await expect(
      recipientPage.locator(
        'form[data-message-composer] textarea[name="body"]',
      ),
    ).toBeVisible();
  } finally {
    await senderContext?.close();

    if (conversationId) {
      await admin
        .from("messages")
        .delete()
        .eq("conversation_id", conversationId);
      await admin.from("conversations").delete().eq("id", conversationId);
    }

    if (secondConversationId) {
      await admin
        .from("messages")
        .delete()
        .eq("conversation_id", secondConversationId);
      await admin
        .from("conversations")
        .delete()
        .eq("id", secondConversationId);
    }

    await removeProfile(admin, secondSender);
    await removeProfile(admin, sender);
    await removeProfile(admin, recipient);
  }
});

test("conversation links navigate without speculative prefetch", async ({
  page,
}) => {
  const admin = createAdminClient();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let family: TestProfile | null = null;
  let firstAuPair: TestProfile | null = null;
  let secondAuPair: TestProfile | null = null;
  let firstConversationId = "";
  let secondConversationId = "";

  try {
    family = await createProfile(admin, "family", `${suffix}-family`);
    firstAuPair = await createProfile(
      admin,
      "au_pair",
      `${suffix}-first-au-pair`,
    );
    secondAuPair = await createProfile(
      admin,
      "au_pair",
      `${suffix}-second-au-pair`,
    );

    const { data: conversations, error: conversationError } = await admin
      .from("conversations")
      .insert([
        { family_id: family.id, au_pair_id: firstAuPair.id },
        { family_id: family.id, au_pair_id: secondAuPair.id },
      ])
      .select("id, au_pair_id");

    if (conversationError || !conversations) {
      throw new Error(
        conversationError?.message ?? "Could not create conversations.",
      );
    }

    firstConversationId =
      conversations.find(
        (conversation) => conversation.au_pair_id === firstAuPair?.id,
      )?.id ?? "";
    secondConversationId =
      conversations.find(
        (conversation) => conversation.au_pair_id === secondAuPair?.id,
      )?.id ?? "";

    if (!firstConversationId || !secondConversationId) {
      throw new Error("Could not identify conversations.");
    }

    const { error: messageError } = await admin.from("messages").insert([
      {
        conversation_id: firstConversationId,
        sender_id: firstAuPair.id,
        body: "First navigation test conversation",
      },
      {
        conversation_id: secondConversationId,
        sender_id: secondAuPair.id,
        body: "Second navigation test conversation",
      },
    ]);

    if (messageError) {
      throw new Error(messageError.message);
    }

    await page.goto("/");
    await authenticatePage(page, family.email);
    await page.goto("/messages");
    await page.waitForFunction(() =>
      document.documentElement.style.getPropertyValue(
        "--pa-message-viewport-height",
      ),
    );

    if ((page.viewportSize()?.width ?? 0) < 640) {
      const inboxGeometry = await page.evaluate(() => {
        const inboxPane = document.querySelector<HTMLElement>(
          '[data-messages-inbox-pane="true"]',
        );
        const inboxScrollContainer = document.querySelector<HTMLElement>(
          '[data-messages-inbox-scroll-container="true"]',
        );
        const mobileNavigation =
          document.querySelector<HTMLElement>(".pa-mobile-app-nav");

        if (!inboxPane || !inboxScrollContainer || !mobileNavigation) {
          return null;
        }

        return {
          inboxBottom: inboxPane.getBoundingClientRect().bottom,
          navigationTop: mobileNavigation.getBoundingClientRect().top,
          pageScrollHeight: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight,
          inboxOverflowY: getComputedStyle(inboxScrollContainer).overflowY,
        };
      });

      expect(inboxGeometry).not.toBeNull();
      expect(
        Math.abs(
          (inboxGeometry?.inboxBottom ?? 0) -
            (inboxGeometry?.navigationTop ?? 0),
        ),
      ).toBeLessThanOrEqual(1);
      expect(inboxGeometry?.pageScrollHeight ?? Infinity).toBeLessThanOrEqual(
        (inboxGeometry?.viewportHeight ?? 0) + 1,
      );
      expect(inboxGeometry?.inboxOverflowY).toBe("auto");
    }

    const targetHref = `/messages?conversation=${secondConversationId}`;
    const targetLink = page.locator(`a[href="${targetHref}"]`).first();
    await expect(targetLink).toBeVisible();

    const speculativeRequests: string[] = [];
    page.on("request", (request) => {
      const requestUrl = new URL(request.url());

      if (
        requestUrl.searchParams.has("_rsc") &&
        requestUrl.searchParams.get("conversation") === secondConversationId
      ) {
        speculativeRequests.push(request.url());
      }
    });

    await targetLink.focus();
    await page.waitForTimeout(750);
    expect(speculativeRequests).toEqual([]);

    // Start the click assertion from a fresh pointer state. WebKit's touch
    // emulation intentionally keeps programmatic focus differently from a
    // physical tap, which can otherwise turn this into a focus-only action.
    await page.goto("/messages");
    await page.waitForFunction(() =>
      document.documentElement.style.getPropertyValue(
        "--pa-message-viewport-height",
      ),
    );
    await page.locator(`a[href="${targetHref}"]`).first().click();
    await expect(page).toHaveURL(
      new RegExp(`\\?conversation=${secondConversationId}$`),
    );
    await expect(page.getByTestId("selected-conversation-panel")).toBeVisible();
  } finally {
    for (const conversationId of [
      firstConversationId,
      secondConversationId,
    ]) {
      if (!conversationId) continue;

      await admin.from("messages").delete().eq("conversation_id", conversationId);
      await admin.from("conversations").delete().eq("id", conversationId);
    }

    await removeProfile(admin, secondAuPair);
    await removeProfile(admin, firstAuPair);
    await removeProfile(admin, family);
  }
});
