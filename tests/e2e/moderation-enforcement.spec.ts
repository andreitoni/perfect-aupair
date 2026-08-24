import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";
import { getSupabaseCredentials } from "./helpers/supabase-local";

const PASSWORD = "TestPassword123!";

type FixtureProfile = {
  email: string;
  id: string;
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

async function createProfile(
  admin: SupabaseClient,
  suffix: string,
  accountType: "family" | "au_pair",
  isAdmin = false,
): Promise<FixtureProfile> {
  const email = `qa-moderation-${accountType}-${suffix}-${randomUUID().slice(0, 6)}@example.com`;
  const { data: authData, error: authError } =
    await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { account_type: accountType },
    });

  if (authError || !authData.user) {
    throw new Error(authError?.message ?? "Could not create auth fixture.");
  }

  const id = authData.user.id;
  const { error: profileError } = await admin.from("profiles").upsert({
    id,
    email,
    account_type: accountType,
    full_name:
      accountType === "family"
        ? `QA Moderation Family ${suffix}`
        : `QA Moderation Au Pair ${suffix}`,
    first_name: "QA",
    last_name: `Moderation-${suffix}`,
    city: accountType === "family" ? "Berlin" : "Munich",
    country: "Germany",
    preferred_host_countries:
      accountType === "au_pair" ? ["Germany"] : [],
    onboarding_completed: true,
    content_moderation_status: "approved",
    content_moderation_needs_review: false,
    is_admin: isAdmin,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(id);
    throw new Error(profileError.message);
  }

  if (!isAdmin) {
    const { error: photoError } = await admin.from("profile_photos").insert({
      profile_id: id,
      storage_path: `${id}/qa-moderation-${suffix}.webp`,
      is_primary: true,
    });

    if (photoError) {
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
      throw new Error(approvalError.message);
    }
  }

  return { email, id };
}

async function signIn(client: SupabaseClient, profile: FixtureProfile) {
  const { error } = await client.auth.signInWithPassword({
    email: profile.email,
    password: PASSWORD,
  });

  if (error) {
    throw new Error(error.message);
  }
}

test("confirmed first incident creates an immutable safety separation and two notifications", async ({
  browser,
  page,
}) => {
  test.slow();
  test.setTimeout(150_000);
  const admin = createAdminClient();
  const reporterClient = createPublicClient();
  const reportedClient = createPublicClient();
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const reporter = await createProfile(admin, suffix, "family");
  const reported = await createProfile(admin, suffix, "au_pair");
  const moderator = await createProfile(admin, suffix, "family", true);
  let reportId: string | null = null;
  let conversationId: string | null = null;
  let reportedContext: BrowserContext | null = null;

  try {
    await Promise.all([
      signIn(reporterClient, reporter),
      signIn(reportedClient, reported),
    ]);

    const { data: conversation, error: conversationError } = await admin
      .from("conversations")
      .insert({ family_id: reporter.id, au_pair_id: reported.id })
      .select("id")
      .single<{ id: string }>();
    expect(conversationError).toBeNull();
    expect(conversation?.id).toBeTruthy();
    conversationId = conversation?.id ?? null;

    const { error: messageError } = await admin.from("messages").insert({
      body: "QA moderation conversation fixture",
      conversation_id: conversationId,
      sender_id: reported.id,
    });
    expect(messageError).toBeNull();

    const { data: report, error: reportError } = await reporterClient
      .from("moderation_reports")
      .insert({
        reporter_id: reporter.id,
        subject_type: "profile",
        subject_id: reported.id,
        reported_profile_id: reported.id,
        category: "harassment_safety",
        reason: "Controlling or manipulative behavior",
        details: "They were being controlling and trying to be manipulative.",
      })
      .select("id")
      .single<{ id: string }>();

    expect(reportError).toBeNull();
    expect(report?.id).toBeTruthy();
    reportId = report?.id ?? null;

    const unauthorizedResult = await reporterClient.rpc(
      "apply_report_warning_and_separation",
      {
        p_admin_notes: "Forged action",
        p_admin_profile_id: moderator.id,
        p_report_id: reportId,
      },
    );
    expect(unauthorizedResult.error).not.toBeNull();

    const { data: result, error: actionError } = await admin.rpc(
      "apply_report_warning_and_separation",
      {
        p_admin_notes: "First confirmed incident; no threats or coercion.",
        p_admin_profile_id: moderator.id,
        p_report_id: reportId,
      },
    );

    expect(actionError).toBeNull();
    expect(result).toMatchObject({ ok: true, changed: true });

    const [
      reportResult,
      blockResult,
      warningResult,
      notificationsResult,
      auditResult,
      profilesResult,
      reporterPairResult,
      reportedPairResult,
    ] = await Promise.all([
      admin
        .from("moderation_reports")
        .select("status, resolution, reviewed_by, admin_notes")
        .eq("id", reportId)
        .single(),
      admin
        .from("profile_blocks")
        .select(
          "blocker_id, blocked_profile_id, enforced_by_admin, enforced_report_id, enforced_by, enforced_at",
        )
        .eq("blocker_id", reporter.id)
        .eq("blocked_profile_id", reported.id)
        .single(),
      admin
        .from("profile_moderation_actions")
        .select(
          "profile_id, source_report_id, action_type, severity, policy_area, issued_by",
        )
        .eq("source_report_id", reportId)
        .single(),
      admin
        .from("system_notifications")
        .select("recipient_id, type, action_href, dedupe_key")
        .in("dedupe_key", [
          `report_action_taken:${reportId}`,
          `conduct_warning:${reportId}`,
        ])
        .order("type"),
      admin
        .from("admin_audit_log")
        .select("action, target_profile_id, target_resource_id, metadata")
        .eq("target_resource_id", reportId)
        .eq("action", "confirm_report_violation_and_separate")
        .single(),
      admin
        .from("profiles")
        .select("id, suspended_at")
        .in("id", [reporter.id, reported.id]),
      reporterClient.rpc("profile_pair_blocked", {
        p_first_profile_id: reporter.id,
        p_second_profile_id: reported.id,
      }),
      reportedClient.rpc("profile_pair_blocked", {
        p_first_profile_id: reported.id,
        p_second_profile_id: reporter.id,
      }),
    ]);

    expect(reportResult.error).toBeNull();
    expect(reportResult.data).toEqual({
      status: "reviewed",
      resolution: "warning_and_separation",
      reviewed_by: moderator.id,
      admin_notes: "First confirmed incident; no threats or coercion.",
    });
    expect(blockResult.error).toBeNull();
    expect(blockResult.data).toMatchObject({
      blocker_id: reporter.id,
      blocked_profile_id: reported.id,
      enforced_by_admin: true,
      enforced_report_id: reportId,
      enforced_by: moderator.id,
    });
    expect(blockResult.data?.enforced_at).toBeTruthy();
    expect(warningResult.error).toBeNull();
    expect(warningResult.data).toEqual({
      profile_id: reported.id,
      source_report_id: reportId,
      action_type: "formal_warning",
      severity: "medium",
      policy_area: "harassment_safety",
      issued_by: moderator.id,
    });
    expect(notificationsResult.error).toBeNull();
    expect(notificationsResult.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipient_id: reported.id,
          type: "conduct_warning",
          action_href: "/safety",
        }),
        expect.objectContaining({
          recipient_id: reporter.id,
          type: "report_action_taken",
          action_href: "/messages",
        }),
      ]),
    );
    expect(auditResult.error).toBeNull();
    expect(auditResult.data).toMatchObject({
      action: "confirm_report_violation_and_separate",
      target_profile_id: reported.id,
      target_resource_id: reportId,
      metadata: {
        resolution: "warning_and_separation",
        severity: "medium",
        formalWarning: true,
        enforcedSeparation: true,
        suspended: false,
      },
    });
    expect(profilesResult.error).toBeNull();
    expect(profilesResult.data).toHaveLength(2);
    expect(profilesResult.data?.every((profile) => !profile.suspended_at)).toBe(
      true,
    );
    expect(reporterPairResult).toMatchObject({ data: true, error: null });
    expect(reportedPairResult).toMatchObject({ data: true, error: null });

    const { data: unblockResult, error: unblockError } =
      await reporterClient.rpc("unblock_profile", {
        p_blocked_profile_id: reported.id,
      });
    expect(unblockError).toBeNull();
    expect(unblockResult).toEqual({
      ok: false,
      error_code: "moderation_separation",
    });

    const { data: repeatedResult, error: repeatedError } = await admin.rpc(
      "apply_report_warning_and_separation",
      {
        p_admin_notes: "Repeated request must be idempotent.",
        p_admin_profile_id: moderator.id,
        p_report_id: reportId,
      },
    );
    expect(repeatedError).toBeNull();
    expect(repeatedResult).toMatchObject({ ok: true, changed: false });

    const [{ count: warningCount }, { count: notificationCount }, { count: auditCount }] =
      await Promise.all([
        admin
          .from("profile_moderation_actions")
          .select("id", { count: "exact", head: true })
          .eq("source_report_id", reportId),
        admin
          .from("system_notifications")
          .select("id", { count: "exact", head: true })
          .in("dedupe_key", [
            `report_action_taken:${reportId}`,
            `conduct_warning:${reportId}`,
          ]),
        admin
          .from("admin_audit_log")
          .select("id", { count: "exact", head: true })
          .eq("target_resource_id", reportId)
          .eq("action", "confirm_report_violation_and_separate"),
      ]);
    expect(warningCount).toBe(1);
    expect(notificationCount).toBe(2);
    expect(auditCount).toBe(1);

    await page.goto("/login");
    await page.getByLabel(/email/i).fill(reporter.email);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.locator("form").getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/search-aupair/);

    await page.waitForLoadState("load");
    const reporterNotificationsButton = page.getByRole("button", {
      name: "Notifications",
    });
    await expect(reporterNotificationsButton).toContainText("1");
    await reporterNotificationsButton.click();
    const { data: unopenedReportNotification } = await admin
      .from("system_notifications")
      .select("read_at")
      .eq("dedupe_key", `report_action_taken:${reportId}`)
      .single<{ read_at: string | null }>();
    expect(unopenedReportNotification?.read_at).toBeNull();
    await expect(reporterNotificationsButton).toContainText("1");
    await page
      .getByRole("link", { name: /We took action on your report/ })
      .click();

    const reporterDialog = page.getByTestId("notification-detail-dialog");
    await expect(reporterDialog).toBeVisible();
    await expect(
      reporterDialog.getByRole("heading", {
        name: "We took action on your report",
      }),
    ).toBeVisible();
    await expect(reporterDialog).toContainText(
      "This member can no longer contact you or see your profile",
    );
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("system_notifications")
          .select("read_at")
          .eq("dedupe_key", `report_action_taken:${reportId}`)
          .single<{ read_at: string | null }>();
        return data?.read_at ?? null;
      })
      .not.toBeNull();
    await expect(reporterDialog.locator("svg")).toHaveCount(1);
    await expect(reporterDialog.locator("img")).toHaveCount(0);

    await reporterDialog
      .getByRole("button", { name: "Close", exact: true })
      .last()
      .click();
    await expect(reporterDialog).toBeHidden();
    await reporterNotificationsButton.click();
    await expect(
      page.getByRole("link", { name: /We took action on your report/ }),
    ).toHaveCount(0);
    await reporterNotificationsButton.click();

    await page.goto("/messages");
    const reporterConversationCard = page.locator(
      `[data-conversation-id="${conversationId}"]`,
    );
    await expect(reporterConversationCard).toHaveAttribute(
      "data-admin-separated",
      "true",
    );
    await expect(reporterConversationCard.locator("img")).toHaveCount(0);
    await expect(
      reporterConversationCard.locator("[data-deleted-account-avatar]"),
    ).toHaveCount(1);
    await expect(reporterConversationCard).toContainText("User unavailable");
    await expect(
      reporterConversationCard.getByText(/Online|Active recently/, {
        exact: true,
      }),
    ).toHaveCount(0);

    await page.goto(`/messages?conversation=${conversationId}`);
    const selectedConversation = page.getByTestId(
      "selected-conversation-panel",
    );
    await expect(selectedConversation).toBeVisible();
    await expect(
      selectedConversation.getByRole("heading", { name: "User unavailable" }),
    ).toBeVisible();
    await expect(
      selectedConversation.getByText(/Online|Active recently/, {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      selectedConversation.getByText("View profile", { exact: true }),
    ).toHaveAttribute("aria-disabled", "true");
    await expect(
      selectedConversation.getByRole("button", { name: "Media" }),
    ).toBeDisabled();
    const avatarShape = await selectedConversation
      .getByTestId("conversation-profile-avatar")
      .evaluate((element) => ({
        radius: Number.parseFloat(
          window.getComputedStyle(element).borderTopLeftRadius,
        ),
        width: element.getBoundingClientRect().width,
      }));
    expect(avatarShape.radius).toBeGreaterThanOrEqual(avatarShape.width / 2);
    await expect(
      selectedConversation.getByTestId("conversation-profile-avatar").locator("img"),
    ).toHaveCount(0);
    await expect(
      selectedConversation
        .getByTestId("conversation-profile-avatar")
        .locator("[data-deleted-account-avatar]"),
    ).toHaveCount(1);

    await expect(
      selectedConversation.getByTestId("conversation-header-actions"),
    ).toHaveAttribute("data-actions-disabled", "true");

    reportedContext = await browser.newContext({
      baseURL: test.info().project.use.baseURL as string,
    });
    const reportedPage = await reportedContext.newPage();
    await reportedPage.goto("/login");
    await reportedPage.getByLabel(/email/i).fill(reported.email);
    await reportedPage.getByLabel(/password/i).fill(PASSWORD);
    await reportedPage
      .locator("form")
      .getByRole("button", { name: "Log in" })
      .click();
    await expect(reportedPage).toHaveURL(/\/search-family/);

    await reportedPage.goto("/messages");
    const reportedConversationCard = reportedPage.locator(
      `[data-conversation-id="${conversationId}"]`,
    );
    await expect(reportedConversationCard).toHaveAttribute(
      "data-admin-separated",
      "true",
    );
    await expect(reportedConversationCard.locator("img")).toHaveCount(0);
    await expect(
      reportedConversationCard.locator("[data-deleted-account-avatar]"),
    ).toHaveCount(1);
    await expect(reportedConversationCard).toContainText("User unavailable");
    await expect(
      reportedConversationCard.getByText(/Online|Active recently/, {
        exact: true,
      }),
    ).toHaveCount(0);

    await reportedPage.goto(`/messages?conversation=${conversationId}`);
    const reportedSelectedConversation = reportedPage.getByTestId(
      "selected-conversation-panel",
    );
    await expect(reportedSelectedConversation).toBeVisible();
    await expect(
      reportedSelectedConversation.getByRole("heading", {
        name: "User unavailable",
      }),
    ).toBeVisible();
    await expect(
      reportedSelectedConversation.getByText(/Online|Active recently/, {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      reportedSelectedConversation
        .getByTestId("conversation-profile-avatar")
        .locator("img"),
    ).toHaveCount(0);
    await expect(
      reportedSelectedConversation
        .getByTestId("conversation-profile-avatar")
        .locator("[data-deleted-account-avatar]"),
    ).toHaveCount(1);
    await expect(
      reportedSelectedConversation.getByTestId("conversation-header-actions"),
    ).toHaveAttribute("data-actions-disabled", "true");

    await reportedPage.goto("/search-family");
    await reportedPage.waitForLoadState("load");
    const warningNotificationsButton = reportedPage.getByRole("button", {
      name: "Notifications",
    });
    await expect(warningNotificationsButton).toContainText("1");
    await warningNotificationsButton.click();
    const { data: unopenedWarningNotification } = await admin
      .from("system_notifications")
      .select("read_at")
      .eq("dedupe_key", `conduct_warning:${reportId}`)
      .single<{ read_at: string | null }>();
    expect(unopenedWarningNotification?.read_at).toBeNull();
    await expect(warningNotificationsButton).toContainText("1");
    await reportedPage
      .getByRole("link", { name: /Warning about your conduct/ })
      .click();

    const warningDialog = reportedPage.getByTestId(
      "notification-detail-dialog",
    );
    await expect(warningDialog).toBeVisible();
    await expect(
      warningDialog.getByRole("heading", {
        name: "Warning about your conduct",
      }),
    ).toBeVisible();
    await expect(warningDialog).toContainText(
      "Do not pressure, control, or manipulate other members",
    );
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("system_notifications")
          .select("read_at")
          .eq("dedupe_key", `conduct_warning:${reportId}`)
          .single<{ read_at: string | null }>();
        return data?.read_at ?? null;
      })
      .not.toBeNull();
    await expect(
      reportedPage.getByRole("link", { name: /Warning about your conduct/ }),
    ).toHaveCount(0);
    await warningDialog
      .getByRole("link", { name: "Read our safety rules" })
      .click();
    await expect(reportedPage).toHaveURL(/\/safety$/);
  } finally {
    await reportedContext?.close();

    if (reportId) {
      await admin
        .from("profile_blocks")
        .delete()
        .eq("enforced_report_id", reportId);
      await admin
        .from("profile_moderation_actions")
        .delete()
        .eq("source_report_id", reportId);
      await admin
        .from("admin_audit_log")
        .delete()
        .eq("target_resource_id", reportId);
      await admin.from("moderation_reports").delete().eq("id", reportId);
    }

    await admin
      .from("conversations")
      .delete()
      .eq("family_id", reporter.id)
      .eq("au_pair_id", reported.id);
    await admin
      .from("profile_photos")
      .delete()
      .in("profile_id", [reporter.id, reported.id]);
    await admin
      .from("profiles")
      .delete()
      .in("id", [reporter.id, reported.id, moderator.id]);
    await Promise.all([
      admin.auth.admin.deleteUser(reporter.id),
      admin.auth.admin.deleteUser(reported.id),
      admin.auth.admin.deleteUser(moderator.id),
    ]);
  }
});

test("a normal block masks both profiles while preserving unblock for the blocker", async ({
  browser,
  page,
}) => {
  test.slow();
  const admin = createAdminClient();
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const blocker = await createProfile(admin, suffix, "family");
  const blocked = await createProfile(admin, suffix, "au_pair");
  let conversationId: string | null = null;
  let blockedContext: BrowserContext | null = null;

  try {
    const { data: conversation, error: conversationError } = await admin
      .from("conversations")
      .insert({ family_id: blocker.id, au_pair_id: blocked.id })
      .select("id")
      .single<{ id: string }>();
    expect(conversationError).toBeNull();
    conversationId = conversation?.id ?? null;
    expect(conversationId).toBeTruthy();

    const [{ error: messageError }, { error: blockError }] = await Promise.all([
      admin.from("messages").insert({
        body: "QA normal block conversation fixture",
        conversation_id: conversationId,
        sender_id: blocked.id,
      }),
      admin.from("profile_blocks").insert({
        blocker_id: blocker.id,
        blocked_profile_id: blocked.id,
      }),
    ]);
    expect(messageError).toBeNull();
    expect(blockError).toBeNull();

    await page.goto("/login");
    await page.getByLabel(/email/i).fill(blocker.email);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.locator("form").getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/search-aupair/);

    await page.goto("/messages");
    const blockerConversationCard = page.locator(
      `[data-conversation-id="${conversationId}"]`,
    );
    await expect(blockerConversationCard).toContainText("User unavailable");
    await expect(blockerConversationCard.locator("img")).toHaveCount(0);
    await expect(
      blockerConversationCard.locator("[data-deleted-account-avatar]"),
    ).toHaveCount(1);

    await page.goto(`/messages?conversation=${conversationId}`);
    const selectedConversation = page.getByTestId(
      "selected-conversation-panel",
    );
    await expect(selectedConversation).toBeVisible();
    await expect(
      selectedConversation.getByRole("heading", { name: "User unavailable" }),
    ).toBeVisible();
    await expect(
      selectedConversation.getByText(/Online|Active recently/, {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      selectedConversation.getByRole("button", { name: "Media" }),
    ).toBeDisabled();
    await expect(
      selectedConversation
        .getByTestId("conversation-profile-avatar")
        .locator("[data-deleted-account-avatar]"),
    ).toHaveCount(1);

    await expect(
      selectedConversation.getByTestId("conversation-header-actions"),
    ).toHaveAttribute("data-actions-disabled", "false");
    await expect(
      selectedConversation.getByTestId("conversation-header-actions"),
    ).toHaveAttribute("data-block-action", "unblock");
    await expect(
      selectedConversation.getByTestId("conversation-header-actions"),
    ).toHaveAttribute("data-report-disabled", "true");

    blockedContext = await browser.newContext({
      baseURL: test.info().project.use.baseURL as string,
    });
    const blockedPage = await blockedContext.newPage();
    await blockedPage.goto("/login");
    await blockedPage.getByLabel(/email/i).fill(blocked.email);
    await blockedPage.getByLabel(/password/i).fill(PASSWORD);
    await blockedPage
      .locator("form")
      .getByRole("button", { name: "Log in" })
      .click();
    await expect(blockedPage).toHaveURL(/\/search-family/);

    await blockedPage.goto("/messages");
    const blockedConversationCard = blockedPage.locator(
      `[data-conversation-id="${conversationId}"]`,
    );
    await expect(blockedConversationCard).toContainText("User unavailable");
    await expect(blockedConversationCard.locator("img")).toHaveCount(0);
    await expect(
      blockedConversationCard.locator("[data-deleted-account-avatar]"),
    ).toHaveCount(1);

    await blockedPage.goto(`/messages?conversation=${conversationId}`);
    const blockedSelectedConversation = blockedPage.getByTestId(
      "selected-conversation-panel",
    );
    await expect(blockedSelectedConversation).toBeVisible();
    await expect(
      blockedSelectedConversation.getByRole("heading", {
        name: "User unavailable",
      }),
    ).toBeVisible();
    await expect(
      blockedSelectedConversation.getByRole("button", { name: "Media" }),
    ).toBeDisabled();
    await expect(
      blockedSelectedConversation.getByTestId("conversation-header-actions"),
    ).toHaveAttribute("data-actions-disabled", "true");
    await expect(
      blockedSelectedConversation.getByTestId("conversation-header-actions"),
    ).toHaveAttribute("data-block-action", "block");
    await expect(
      blockedSelectedConversation.getByTestId("conversation-header-actions"),
    ).toHaveAttribute("data-report-disabled", "true");
  } finally {
    await blockedContext?.close();
    await admin
      .from("profile_blocks")
      .delete()
      .eq("blocker_id", blocker.id)
      .eq("blocked_profile_id", blocked.id);

    if (conversationId) {
      await admin.from("messages").delete().eq("conversation_id", conversationId);
      await admin.from("conversations").delete().eq("id", conversationId);
    }

    await admin
      .from("profile_photos")
      .delete()
      .in("profile_id", [blocker.id, blocked.id]);
    await admin.from("profiles").delete().in("id", [blocker.id, blocked.id]);
    await Promise.all([
      admin.auth.admin.deleteUser(blocker.id),
      admin.auth.admin.deleteUser(blocked.id),
    ]);
  }
});
