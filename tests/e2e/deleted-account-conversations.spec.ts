import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { cleanupScheduledAccountDeletions } from "../../lib/privacy/cleanup-scheduled-account-deletions";
import { getSupabaseCredentials } from "./helpers/supabase-local";

const PASSWORD = "TestPassword123!";
const SUPABASE_COOKIE_CHUNK_SIZE = 3180;

type AccountType = "family" | "au_pair";

type TestProfile = {
  id: string;
  email: string;
  photoPath: string;
};

function createAdminClient() {
  const { url, serviceRoleKey } = getSupabaseCredentials();

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function createAuthenticatedClient() {
  const { url, publishableKey } = getSupabaseCredentials();

  if (!publishableKey) {
    throw new Error("Could not find local Supabase publishable key.");
  }

  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function authenticateBrowserSession({
  appBaseUrl,
  page,
  session,
  supabaseUrl,
}: {
  appBaseUrl: string;
  page: Page;
  session: Session;
  supabaseUrl: string;
}) {
  const storageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  const encodedSession = `base64-${Buffer.from(
    JSON.stringify(session),
    "utf8",
  ).toString("base64url")}`;
  const chunkValues = Array.from(
    { length: Math.ceil(encodedSession.length / SUPABASE_COOKIE_CHUNK_SIZE) },
    (_, index) =>
      encodedSession.slice(
        index * SUPABASE_COOKIE_CHUNK_SIZE,
        (index + 1) * SUPABASE_COOKIE_CHUNK_SIZE,
      ),
  );

  await page.context().addCookies(
    chunkValues.map((value, index) => ({
      name:
        chunkValues.length === 1 ? storageKey : `${storageKey}.${index}`,
      value,
      url: appBaseUrl,
      httpOnly: false,
      secure: new URL(appBaseUrl).protocol === "https:",
      sameSite: "Lax" as const,
    })),
  );
}

async function createEligibleProfile(
  admin: SupabaseClient,
  accountType: AccountType,
  suffix: string,
): Promise<TestProfile> {
  const email = `qa-deleted-chat-${accountType}-${suffix}@example.com`;
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
      full_name:
        accountType === "family" ? "QA Delete Family" : "QA Delete Au Pair",
      country: accountType === "family" ? "Germany" : "Romania",
      city: accountType === "family" ? "Berlin" : "Cluj-Napoca",
      preferred_host_countries:
        accountType === "au_pair" ? ["Germany"] : [],
    })
    .eq("id", id);

  if (profileError) {
    throw new Error(profileError.message);
  }

  const photoPath = `${id}/deleted-chat-${suffix}.png`;
  const photo = readFileSync(
    join(process.cwd(), "tests/fixtures/profile-photo.png"),
  );
  const { error: uploadError } = await admin.storage
    .from("profile-photos")
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

  return { id, email, photoPath };
}

async function removeProfile(admin: SupabaseClient, profile: TestProfile | null) {
  if (!profile) return;

  await admin
    .from("account_deletion_requests")
    .delete()
    .eq("profile_id", profile.id);
  await admin.storage.from("profile-photos").remove([profile.photoPath]);
  await admin.auth.admin.deleteUser(profile.id);
}

test("recipient keeps an anonymized read-only conversation through pending and completed deletion", async ({
  baseURL,
  page,
}) => {
  test.slow();

  const admin = createAdminClient();
  const recipient = createAuthenticatedClient();
  const browserContext = page.context();
  let browserPage = page;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let family: TestProfile | null = null;
  let auPair: TestProfile | null = null;
  let conversationId: string | null = null;

  try {
    family = await createEligibleProfile(admin, "family", suffix);
    auPair = await createEligibleProfile(admin, "au_pair", suffix);

    const { data: conversation, error: conversationError } = await admin
      .from("conversations")
      .insert({ family_id: family.id, au_pair_id: auPair.id })
      .select("id")
      .single();

    if (conversationError || !conversation) {
      throw new Error(
        conversationError?.message ?? "Could not create test conversation.",
      );
    }

    conversationId = conversation.id;
    const { data: message, error: messageError } = await admin
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: auPair.id,
        body: "This recipient copy must remain visible",
      })
      .select("id")
      .single();

    if (messageError || !message) {
      throw new Error(messageError?.message ?? "Could not create test message.");
    }

    const { data: signInData, error: signInError } =
      await recipient.auth.signInWithPassword({
        email: family.email,
        password: PASSWORD,
      });

    if (signInError || !signInData.session) {
      throw new Error(signInError?.message ?? "Could not create test session.");
    }

    const { url: supabaseUrl } = getSupabaseCredentials();
    await authenticateBrowserSession({
      appBaseUrl: baseURL ?? "http://localhost:3000",
      page: browserPage,
      session: signInData.session,
      supabaseUrl,
    });

    const { data: deletionData, error: deletionError } = await admin.rpc(
      "request_account_deletion",
      { p_email: auPair.email, p_profile_id: auPair.id },
    );

    if (deletionError || !deletionData) {
      throw new Error(
        deletionError?.message ?? "Could not request account deletion.",
      );
    }

    const requestId = String(deletionData.request_id);

    const assertUnavailableConversation = async () => {
      const [inboxResult, profileResult, messagesResult, sendAllowedResult] =
        await Promise.all([
          recipient.rpc("get_message_inbox_cards"),
          recipient.rpc("get_message_conversation_profile", {
            p_conversation_id: conversationId,
          }),
          recipient
            .from("messages")
            .select("id, sender_id, body")
            .eq("conversation_id", conversationId),
          recipient.rpc("message_send_is_allowed", {
            p_conversation_id: conversationId,
            p_sender_id: family?.id,
          }),
        ]);

      expect(inboxResult.error).toBeNull();
      expect(profileResult.error).toBeNull();
      expect(messagesResult.error).toBeNull();
      expect(sendAllowedResult.error).toBeNull();

      const inboxCard = inboxResult.data?.find(
        (card) => card.conversation_id === conversationId,
      );
      expect(inboxCard).toMatchObject({
        other_profile_id: auPair?.id,
        other_account_type: "au_pair",
        other_public_slug: null,
        other_full_name: null,
        other_country: null,
        other_city: null,
        other_primary_photo_path: null,
        other_profile_available: false,
        last_message_body: "This recipient copy must remain visible",
      });
      expect(profileResult.data?.[0]).toMatchObject({
        id: auPair?.id,
        account_type: "au_pair",
        public_slug: null,
        full_name: null,
        country: null,
        city: null,
        primary_photo_path: null,
        profile_available: false,
      });
      expect(messagesResult.data).toEqual([
        {
          id: message.id,
          sender_id: auPair?.id,
          body: "This recipient copy must remain visible",
        },
      ]);
      expect(sendAllowedResult.data).toBe(false);
    };

    await assertUnavailableConversation();

    const assertUnavailableConversationPage = async () => {
      await browserPage.goto(`/messages?conversation=${conversationId}`);
      await expect(
        browserPage.locator("h1", { hasText: "User unavailable" }),
      ).toBeVisible();
      await expect(
        browserPage.locator("[data-deleted-account-avatar]:visible").first(),
      ).toBeVisible();
      await expect(
        browserPage.locator("p", {
          hasText: /^This recipient copy must remain visible$/,
        }),
      ).toBeVisible();
      await expect(
        browserPage.getByText("This account is no longer available.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        browserPage.getByText(
          "You can still read this conversation, but new messages are disabled.",
          { exact: true },
        ),
      ).toHaveCount(0);
      await expect(
        browserPage.locator(
          'form[data-message-composer] textarea[name="body"]',
        ),
      ).toHaveCount(0);
    };

    await assertUnavailableConversationPage();

    const dueAt = new Date(Date.now() - 60_000).toISOString();
    const [{ error: profileDueError }, { error: requestDueError }] =
      await Promise.all([
        admin
          .from("profiles")
          .update({ deletion_scheduled_at: dueAt })
          .eq("id", auPair.id),
        admin
          .from("account_deletion_requests")
          .update({
            scheduled_delete_at: dueAt,
            confirmation_email_sent_at: new Date().toISOString(),
          })
          .eq("id", requestId),
      ]);

    expect(profileDueError).toBeNull();
    expect(requestDueError).toBeNull();

    const cleanup = await cleanupScheduledAccountDeletions({
      supabase: admin,
      batchSize: 1,
      now: new Date(),
    });

    expect(cleanup).toMatchObject({ completed: 1, failed: 0 });
    expect(
      (await admin.from("profiles").select("id").eq("id", auPair.id)).data,
    ).toEqual([]);
    expect(
      (
        await admin
          .from("conversations")
          .select("id")
          .eq("id", conversationId)
      ).data,
    ).toEqual([{ id: conversationId }]);

    await assertUnavailableConversation();
    await browserPage.close();
    browserPage = await browserContext.newPage();
    await assertUnavailableConversationPage();
  } finally {
    await recipient.auth.signOut();

    if (conversationId) {
      await admin.from("conversations").delete().eq("id", conversationId);
    }

    await removeProfile(admin, auPair);
    await removeProfile(admin, family);
  }
});
