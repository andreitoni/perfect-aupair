import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { getSupabaseCredentials } from "./helpers/supabase-local";

const PASSWORD = "TestPassword123!";

function createAdminClient() {
  const { serviceRoleKey, url } = getSupabaseCredentials();

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function fixtureEmail(kind: "admin" | "member", projectName: string) {
  const project = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `qa-${kind}-browser-${project}@example.com`;
}

async function findAuthUserId(admin: SupabaseClient, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) throw new Error(error.message);

    const user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email.toLowerCase(),
    );

    if (user) return user.id;
    if (data.users.length < 200) return null;
  }

  return null;
}

async function deleteFixtureUser(admin: SupabaseClient, userId: string) {
  const { error: auditError } = await admin
    .from("admin_audit_log")
    .delete()
    .or(
      `admin_profile_id.eq.${userId},target_profile_id.eq.${userId},target_resource_id.eq.${userId}`,
    );

  if (auditError) throw new Error(auditError.message);

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);

  if (deleteError) throw new Error(deleteError.message);
}

async function replaceAuthUser(
  admin: SupabaseClient,
  email: string,
  accountType: "family" | "au_pair",
) {
  const existingId = await findAuthUserId(admin, email);

  if (existingId) {
    await deleteFixtureUser(admin, existingId);
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: PASSWORD,
    user_metadata: { account_type: accountType },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Could not create admin browser fixture.");
  }

  return data.user.id;
}

test("admin member editing stays contextual and usable at the current viewport", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);

  const admin = createAdminClient();
  const adminEmail = fixtureEmail("admin", testInfo.project.name);
  const memberEmail = fixtureEmail("member", testInfo.project.name);
  let adminId: string | null = null;
  let memberId: string | null = null;
  let uploadedStoragePath: string | null = null;

  try {
    adminId = await replaceAuthUser(admin, adminEmail, "family");
    memberId = await replaceAuthUser(admin, memberEmail, "family");

    const [{ error: adminProfileError }, { error: memberProfileError }] =
      await Promise.all([
        admin
          .from("profiles")
          .update({
            city: "Berlin",
            country: "Germany",
            first_name: "Quality",
            full_name: "Quality Admin",
            is_admin: true,
            last_name: "Admin",
          })
          .eq("id", adminId),
        admin
          .from("profiles")
          .update({
            account_type: "family",
            auth_email_confirmed: true,
            au_pair_allowance_amount: 500,
            au_pair_allowance_currency: "EUR",
            bio: "Original family introduction.",
            children_info: "2 children",
            city: "Berlin",
            content_moderation_status: "approved",
            country: "Germany",
            first_name: "Quality",
            full_name: "The Browser family",
            is_admin: false,
            last_name: "Browser",
            onboarding_completed: true,
          })
          .eq("id", memberId),
      ]);

    expect(adminProfileError).toBeNull();
    expect(memberProfileError).toBeNull();

    const { data: photos, error: photosError } = await admin
      .from("profile_photos")
      .insert([
        {
          is_primary: true,
          profile_id: memberId,
          sort_order: 0,
          storage_path: `${memberId}/browser-primary.webp`,
        },
        {
          is_primary: false,
          profile_id: memberId,
          sort_order: 1,
          storage_path: `${memberId}/browser-secondary.webp`,
        },
      ])
      .select("id, is_primary, sort_order")
      .order("sort_order", { ascending: true });
    expect(photosError).toBeNull();
    expect(photos).toHaveLength(2);

    const baseURL = String(
      testInfo.project.use.baseURL ?? "http://localhost:3000",
    );
    await page.context().addCookies([
      { name: "pa_cookie_consent", value: "necessary", url: baseURL },
    ]);
    await page.addInitScript(() => {
      window.localStorage.setItem("pa_cookie_consent", "necessary");
    });

    await page.goto("/login");
    const loginForm = page.locator('form[action="/auth/login"]');
    await Promise.all([
      page.waitForURL(/\/admin(?:\?|$)/),
      loginForm.evaluate(
        (form: HTMLFormElement, credentials) => {
          const emailInput = form.elements.namedItem("email");
          const passwordInput = form.elements.namedItem("password");

          if (
            !(emailInput instanceof HTMLInputElement) ||
            !(passwordInput instanceof HTMLInputElement)
          ) {
            throw new Error("Login fields are unavailable.");
          }

          emailInput.value = credentials.email;
          passwordInput.value = credentials.password;
          form.submit();
        },
        { email: adminEmail, password: PASSWORD },
      ),
    ]);

    const memberDirectory = `/admin?view=members&type=family&q=${encodeURIComponent(memberEmail)}`;
    await page.goto(memberDirectory);
    const memberCard = page.locator(`#member-${memberId}`);
    await expect(memberCard).toBeVisible();
    await memberCard.getByRole("link", { name: "Edit profile" }).click();

    await expect(page.getByRole("heading", { name: "Profile information" })).toBeVisible();
    await expect(page.locator('[name="city"]')).toHaveValue("Berlin");

    const viewport = page.viewportSize();
    const isCompact = (viewport?.width ?? 1280) < 1024;
    await expect(page.locator("aside")).toBeVisible({ visible: !isCompact });

    const responsiveMetrics = await page.evaluate(() => {
      const visibleFields = Array.from(
        document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          "input, select, textarea",
        ),
      ).filter((element) => element.getClientRects().length > 0);

      return {
        fieldFontSizes: visibleFields.map((element) =>
          Number.parseFloat(window.getComputedStyle(element).fontSize),
        ),
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });

    expect(responsiveMetrics.scrollWidth).toBeLessThanOrEqual(
      responsiveMetrics.innerWidth + 1,
    );
    expect(Math.min(...responsiveMetrics.fieldFontSizes)).toBeGreaterThanOrEqual(16);

    await page.locator('[name="city"]').fill("Stockholm");
    await page
      .locator('[name="bio"]')
      .fill("Updated safely from the responsive admin editor.\n\nSecond paragraph stays intact.");

    const saveButton = page.getByRole("button", { name: "Save changes" });
    await saveButton.scrollIntoViewIfNeeded();

    if (isCompact) {
      const visibleAdminNavs = await page
        .locator('nav[aria-label="Admin navigation"]')
        .all();
      const mobileNav = (
        await Promise.all(
          visibleAdminNavs.map(async (navigation) => ({
            navigation,
            visible: await navigation.isVisible(),
          })),
        )
      ).find((entry) => entry.visible)?.navigation;
      const [saveBox, navigationBox] = await Promise.all([
        saveButton.boundingBox(),
        mobileNav?.boundingBox(),
      ]);

      expect(saveBox).not.toBeNull();
      expect(navigationBox).not.toBeNull();
      expect((saveBox?.y ?? 0) + (saveBox?.height ?? 0)).toBeLessThanOrEqual(
        (navigationBox?.y ?? Number.POSITIVE_INFINITY) + 1,
      );
    }

    await saveButton.click();

    await expect
      .poll(async () => {
        const { data } = await admin
          .from("profiles")
          .select("bio, city")
          .eq("id", memberId)
          .single();
        return data;
      })
      .toEqual({
        bio: "Updated safely from the responsive admin editor.\n\nSecond paragraph stays intact.",
        city: "Stockholm",
      });
    await expect(page.getByRole("button", { name: "Edit profile" })).toBeVisible();

    await page.locator('a[href*="section=media"]').click();
    await page.getByRole("button", { name: "Make main" }).click();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("profile_photos")
          .select("id")
          .eq("profile_id", memberId)
          .eq("is_primary", true)
          .single();
        return data?.id;
      })
      .toBe(photos?.[1]?.id);

    await page.locator('input[type="file"]').setInputFiles({
      name: "admin-new-main.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await expect(
      page.locator('[data-profile-photo-crop-dialog="true"]'),
    ).toBeVisible();
    await page.getByRole("button", { name: "Use photo" }).click();

    await expect
      .poll(async () => {
        const { data } = await admin
          .from("profile_photos")
          .select("id, is_primary, storage_path")
          .eq("profile_id", memberId)
          .order("created_at", { ascending: false });
        const uploaded = data?.find(
          (photo) =>
            photo.id !== photos?.[0]?.id && photo.id !== photos?.[1]?.id,
        );

        return uploaded?.is_primary ? uploaded.storage_path : null;
      })
      .not.toBeNull();

    const { data: currentPhotos, error: uploadedPhotoError } = await admin
      .from("profile_photos")
      .select("id, storage_path")
      .eq("profile_id", memberId);
    expect(uploadedPhotoError).toBeNull();
    const uploadedPhoto = currentPhotos?.find(
      (photo) => photo.id !== photos?.[0]?.id && photo.id !== photos?.[1]?.id,
    );
    uploadedStoragePath = uploadedPhoto?.storage_path ?? null;
    expect(uploadedStoragePath).toBeTruthy();

    await page.getByRole("link", { name: "← Back" }).click();
    await expect(page).toHaveURL(
      new RegExp(
        `/admin\\?view=members&type=family&q=${encodeURIComponent(memberEmail)}#member-${memberId}$`,
      ),
    );
    await expect(page.locator(`#member-${memberId}`)).toBeVisible();
  } finally {
    if (uploadedStoragePath) {
      const { error: referenceError } = await admin
        .from("profile_photos")
        .delete()
        .eq("storage_path", uploadedStoragePath);
      if (referenceError) throw new Error(referenceError.message);

      const { error } = await admin.storage
        .from("profile-photos")
        .remove([uploadedStoragePath]);
      if (error) throw new Error(error.message);
    }

    for (const id of [memberId, adminId]) {
      if (id) await deleteFixtureUser(admin, id);
    }
  }
});
