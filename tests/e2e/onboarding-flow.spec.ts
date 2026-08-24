import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { getSupabaseCredentials } from "./helpers/supabase-local";

async function expectNoNextErrorPage(page: Page) {
  await expect(page.locator("body")).not.toContainText("Runtime Error");
  await expect(page.locator("body")).not.toContainText("Build Error");
  await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
  await expect(page.locator("body")).not.toContainText("Application error");
}

async function expectFieldIsNotValidationRed(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((element) => {
        const style = window.getComputedStyle(element);

        return {
          borderColor: style.borderTopColor,
          backgroundColor: style.backgroundColor,
        };
      }),
    )
    .not.toEqual({
      borderColor: "rgb(217, 95, 73)",
      backgroundColor: "rgb(255, 245, 242)",
    });
}

async function createOnboardedAuPairWithoutPhoto() {
  const { url, serviceRoleKey } = getSupabaseCredentials();
  const admin = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const email = `e2e-aupair-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}@example.com`;
  const password = "TestPassword123!";

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      account_type: "au_pair",
    },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Could not create test user.");
  }

  const userId = data.user.id;

  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    email,
    account_type: "au_pair",
    onboarding_completed: true,
    first_name: "Test",
    last_name: "User",
    full_name: "Test User",
    gender: "female",
    birth_date: "2000-01-01",
    date_of_birth: "2000-01-01",
    country: "Germany",
    city: "Berlin",
    nationality: "Romanian",
    preferred_host_countries: ["Germany"],
    mother_tongue: "Romanian",
    fluent_languages: ["English"],
    basic_languages: ["German"],
    availability_start: "2026-07-01",
    availability_start_from: "2026-07-01",
    availability_start_to: "2026-08-01",
    duration: "6 months",
    duration_min_months: 6,
    duration_max_months: 12,
    bio: "I am a reliable test au pair profile.",
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    throw new Error(profileError.message);
  }

  return {
    admin,
    email,
    password,
    userId,
  };
}

async function createOnboardedFamilyWithoutPhoto() {
  const { url, serviceRoleKey } = getSupabaseCredentials();
  const admin = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const email = `e2e-family-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}@example.com`;
  const password = "TestPassword123!";

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      account_type: "family",
    },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Could not create test family user.");
  }

  const userId = data.user.id;

  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    email,
    account_type: "family",
    onboarding_completed: true,
    first_name: "Family",
    last_name: "Tester",
    full_name: "The Tester family",
    country: "United States",
    city: "Austin",
    street_address: "Main Street 12",
    phone_country_code: "+1",
    phone_number: "5125550101",
    religion: "Christianity",
    children_info: "1 child",
    availability_start: "2026-07-01",
    availability_start_from: "2026-07-01",
    availability_start_to: "2026-08-01",
    duration: "6 months",
    duration_min_months: 6,
    duration_max_months: 12,
    au_pair_allowance_amount: 500,
    au_pair_allowance_currency: "USD",
    accommodation_info: "Private room for the au pair.",
    expectations: "Help with childcare after school.",
    bio: "We are a test host family profile.",
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    throw new Error(profileError.message);
  }

  return {
    admin,
    email,
    password,
    userId,
  };
}

async function createUnonboardedFamily() {
  const { url, serviceRoleKey } = getSupabaseCredentials();
  const admin = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const email = `e2e-onboarding-family-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}@example.com`;
  const password = "TestPassword123!";

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      account_type: "family",
    },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Could not create test family user.");
  }

  const userId = data.user.id;

  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    email,
    account_type: "family",
    onboarding_completed: false,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    throw new Error(profileError.message);
  }

  return {
    admin,
    email,
    password,
    userId,
  };
}

async function createUnonboardedAuPair() {
  const { url, serviceRoleKey } = getSupabaseCredentials();
  const admin = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const email = `e2e-onboarding-aupair-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}@example.com`;
  const password = "TestPassword123!";

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      account_type: "au_pair",
    },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Could not create test au pair user.");
  }

  const userId = data.user.id;

  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    email,
    account_type: "au_pair",
    onboarding_completed: false,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    throw new Error(profileError.message);
  }

  return {
    admin,
    email,
    password,
    userId,
  };
}

async function completeAuPairIdentityStep(page: Page) {
  await page.locator('input[name="first_name"]').fill("Ana");
  await page.locator('input[name="last_name"]').fill("Ionescu");
  await page.locator('select[name="birth_day"]').selectOption("1");
  await page.locator('select[name="birth_month"]').selectOption("1");
  await page.locator('select[name="birth_year"]').selectOption("2000");
  await page.locator('input[name="gender"][value="female"]').check();
  await page.locator('input[name="street_address"]').fill("Main Street 12");
  await page.locator('input[name="city"]').fill("Berlin");
  await page.locator('select[name="country"]').selectOption("Germany");
  await page.locator('select[name="phone_country_code"]').selectOption({ index: 1 });
  await page.locator('input[name="phone_number"]').fill("15123456789");
  await page.getByRole("button", { name: /^next$/i }).click();
  await expect(page.getByRole("heading", { name: "Match details" })).toBeVisible();
}

async function chooseOnboardingOption(
  page: Page,
  name: string,
  optionLabel: string,
  expectedValue: string,
) {
  await page.locator(`[data-pa-choice-button="${name}"]`).click();
  await page.getByRole("option", { name: optionLabel, exact: true }).click();
  await expect(page.locator(`input[name="${name}"]`)).toHaveValue(expectedValue);
}

async function openRegistrationProfile(
  page: Page,
  accountType: "family" | "au_pair",
) {
  await page.goto("/login?mode=register");
  await page.waitForLoadState("networkidle").catch(() => null);

  await page
    .getByRole("button", {
      name:
        accountType === "family"
          ? "Register for free as Family"
          : "Register for free as Au Pair",
    })
    .click();

  await expect(
    page.getByRole("heading", {
      name:
        accountType === "family"
          ? "Free family registration"
          : "Free au pair registration",
    }),
  ).toBeVisible();

  await page.locator('input[name="accepted_terms"]').check();
  await page.getByRole("button", { name: "Register with Email" }).click();

  await expect(
    page.getByRole("heading", {
      name: accountType === "family" ? "Family profile" : "Au pair profile",
    }),
  ).toBeVisible();
}

async function createAdminClient() {
  const { url, serviceRoleKey } = getSupabaseCredentials();

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function deleteUserByEmail(email: string) {
  const admin = await createAdminClient();
  const { data: matchingProfiles } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email);

  for (const profile of matchingProfiles ?? []) {
    await admin.from("profiles").delete().eq("id", profile.id);
    await admin.auth.admin.deleteUser(profile.id);
  }
}

test("profile writes normalize Caps Lock names and preserve mixed casing", async () => {
  const testUser = await createUnonboardedFamily();

  try {
    const { error: capsLockError } = await testUser.admin
      .from("profiles")
      .update({
        first_name: "ȘTEFAN",
        last_name: "O'CONNOR-SMITH",
        full_name: "THE O'CONNOR-SMITH FAMILY",
      })
      .eq("id", testUser.userId);

    expect(capsLockError).toBeNull();

    const { data: normalizedProfile, error: normalizedProfileError } =
      await testUser.admin
        .from("profiles")
        .select("first_name,last_name,full_name,auth_email_confirmed")
        .eq("id", testUser.userId)
        .single();

    expect(normalizedProfileError).toBeNull();
    expect(normalizedProfile).toMatchObject({
      first_name: "Ștefan",
      last_name: "O'Connor-Smith",
      full_name: "The O'Connor-Smith family",
      auth_email_confirmed: true,
    });

    const { error: mixedCaseError } = await testUser.admin
      .from("profiles")
      .update({
        first_name: "McDonald",
        last_name: "de la Cruz",
        full_name: "McDonald de la Cruz",
      })
      .eq("id", testUser.userId);

    expect(mixedCaseError).toBeNull();

    const { data: mixedCaseProfile, error: mixedCaseProfileError } =
      await testUser.admin
        .from("profiles")
        .select("first_name,last_name,full_name")
        .eq("id", testUser.userId)
        .single();

    expect(mixedCaseProfileError).toBeNull();
    expect(mixedCaseProfile).toMatchObject({
      first_name: "McDonald",
      last_name: "de la Cruz",
      full_name: "McDonald de la Cruz",
    });

    const { error: suspiciousCaseError } = await testUser.admin
      .from("profiles")
      .update({ first_name: "MIXed Case EXAMPLE" })
      .eq("id", testUser.userId);

    expect(suspiciousCaseError?.message).toContain(
      "Profile names must use normal capitalization",
    );
  } finally {
    await testUser.admin.from("profiles").delete().eq("id", testUser.userId);
    await testUser.admin.auth.admin.deleteUser(testUser.userId);
  }
});

async function clearAuthEmailRateLimitEvents() {
  const admin = await createAdminClient();

  await admin
    .from("auth_email_request_events")
    .delete()
    .gte("created_at", "1970-01-01T00:00:00.000Z");
}

test("registration completes onboarding before sending confirmation email", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const email = `e2e-register-family-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}@example.com`;

  try {
    await deleteUserByEmail(email);
    await clearAuthEmailRateLimitEvents();
    await openRegistrationProfile(page, "family");

    await page.locator('input[name="first_name"]').fill("MARIA");
    await page.locator('input[name="last_name"]').fill("POPESCU");
    await page.locator('select[name="country"]').selectOption("Germany");
    await page.locator('select[name="religion"]').selectOption("Christianity");
    await page.locator('input[name="street_address"]').fill("Main Street 12");
    await page.locator('input[name="city"]').fill("Berlin");
    await page.locator('select[name="phone_country_code"]').selectOption("+49");
    await page.locator('input[name="phone_number"]').fill("15123456789");
    await page.getByRole("button", { name: /^next$/i }).click();

    await expect(page.getByRole("heading", { name: "Match details" })).toBeVisible();
    await page.locator('select[name="children_info"]').selectOption("2 children");
    await chooseOnboardingOption(
      page,
      "availability_start_from",
      "August 2026",
      "2026-08",
    );
    await chooseOnboardingOption(
      page,
      "availability_start_to",
      "October 2026",
      "2026-10",
    );
    await chooseOnboardingOption(
      page,
      "duration_min_months",
      "6 mo.",
      "6",
    );
    await chooseOnboardingOption(
      page,
      "duration_max_months",
      "12 mo.",
      "12",
    );
    await page.locator('input[name="au_pair_allowance_amount"]').fill("500");
    await page
      .locator('select[name="au_pair_allowance_currency"]')
      .selectOption("EUR");
    await page.getByRole("button", { name: /^next$/i }).click();

    await expect(page.getByRole("heading", { name: "Home details" })).toBeVisible();
    await page
      .locator('textarea[name="accommodation_info"]')
      .fill("Private room in our apartment with easy access to public transport.");
    await page
      .locator('textarea[name="expectations"]')
      .fill("We need help with school pickups and light childcare in the afternoons.");
    await page.getByRole("button", { name: /^next$/i }).click();

    await expect(page.getByRole("heading", { name: "Family introduction" })).toBeVisible();
    await page
      .locator('textarea[name="bio"]')
      .fill("We are a warm test family looking for an au pair for the school year.");
    await page.locator('input[name="registration_email"]').fill(email);
    await page.locator('input[name="registration_password"]').fill("TestPassword123!");
    await page.getByRole("button", { name: /^create account$/i }).click();

    await expect(page).toHaveURL(/\/check-email/, { timeout: 20_000 });
    await expectNoNextErrorPage(page);

    const admin = await createAdminClient();
    const { data: profile, error } = await admin
      .from("profiles")
      .select(
        "id,email,account_type,onboarding_completed,auth_email_confirmed,first_name,last_name,full_name,children_info,au_pair_allowance_amount,au_pair_allowance_currency",
      )
      .eq("email", email)
      .single();

    expect(error).toBeNull();
    if (!profile) {
      throw new Error("Registration profile was not created.");
    }

    expect(profile).toMatchObject({
      email,
      account_type: "family",
      onboarding_completed: true,
      auth_email_confirmed: false,
      first_name: "Maria",
      last_name: "Popescu",
      full_name: "The Popescu family",
      children_info: "2 children",
      au_pair_allowance_amount: 500,
      au_pair_allowance_currency: "EUR",
    });

    const { data: authUser, error: authUserError } =
      await admin.auth.admin.getUserById(profile.id);

    expect(authUserError).toBeNull();
    expect(authUser.user?.user_metadata).toMatchObject({
      account_type: "family",
    });
    expect(authUser.user?.user_metadata).not.toHaveProperty(
      "registration_password",
    );
    expect(authUser.user?.user_metadata).not.toHaveProperty("password");
    expect(authUser.user?.user_metadata).not.toHaveProperty("accepted_terms");

    const { error: confirmError } = await admin.auth.admin.updateUserById(
      profile.id,
      { email_confirm: true },
    );
    expect(confirmError).toBeNull();

    const { data: confirmedProfile, error: confirmedProfileError } = await admin
      .from("profiles")
      .select("auth_email_confirmed")
      .eq("id", profile.id)
      .single();

    expect(confirmedProfileError).toBeNull();
    expect(confirmedProfile?.auth_email_confirmed).toBe(true);
  } finally {
    await deleteUserByEmail(email);
  }
});

test("au pair registration completes onboarding before confirmation email", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const email = `e2e-register-aupair-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}@example.com`;

  try {
    await deleteUserByEmail(email);
    await clearAuthEmailRateLimitEvents();
    await openRegistrationProfile(page, "au_pair");

    await completeAuPairIdentityStep(page);
    const nationalityOptions = page.locator('select[name="nationality"] option');

    await expect(nationalityOptions.nth(0)).toHaveAttribute("value", "Germany");
    await expect(
      nationalityOptions.filter({ hasText: /^Germany$/ }),
    ).toHaveCount(2);
    await page.locator('select[name="nationality"]').selectOption("Germany");
    await page
      .locator('input[name="preferred_host_countries"][value="Germany"]')
      .check();
    await page.locator('select[name="religion"]').selectOption("Christianity");
    await expect(
      page.locator('input[name="already_in_germany"]:checked'),
    ).toHaveCount(0);
    await page.locator('input[name="already_in_germany"][value="yes"]').check();
    await chooseOnboardingOption(
      page,
      "availability_start_from",
      "August 2026",
      "2026-08",
    );
    await chooseOnboardingOption(
      page,
      "availability_start_to",
      "October 2026",
      "2026-10",
    );
    await chooseOnboardingOption(
      page,
      "duration_min_months",
      "6 mo.",
      "6",
    );
    await chooseOnboardingOption(
      page,
      "duration_max_months",
      "12 mo.",
      "12",
    );
    await page.locator('input[name="smoking_status"][value="non_smoker"]').check();
    await page.getByRole("button", { name: /^next$/i }).click();

    await expect(
      page.getByRole("heading", { name: "Experience and certificates" }),
    ).toBeVisible();
    await expect(
      page.locator('input[name="has_drivers_license"]:checked'),
    ).toHaveCount(0);
    await expect(
      page.locator('input[name="has_childcare_experience"]:checked'),
    ).toHaveCount(0);
    await expect(
      page.locator('input[name="has_infant_experience"]:checked'),
    ).toHaveCount(0);
    await expect(page.locator('input[name="has_first_aid"]:checked')).toHaveCount(0);
    await expect(
      page.locator('input[name="will_care_for_elderly"]:checked'),
    ).toHaveCount(0);
    await expect(
      page.locator('input[name="will_care_for_pets"]:checked'),
    ).toHaveCount(0);
    await page.locator('input[name="has_drivers_license"][value="yes"]').check();
    await page
      .locator('input[name="has_childcare_experience"][value="yes"]')
      .check();
    await page.locator('input[name="has_infant_experience"][value="no"]').check();
    await page.locator('input[name="has_first_aid"][value="yes"]').check();
    await page.locator('input[name="will_care_for_elderly"][value="no"]').check();
    await page.locator('input[name="will_care_for_pets"][value="yes"]').check();
    await page.locator('select[name="mother_tongue"]').selectOption("German");
    await page.locator('select[name="fluent_language"]').selectOption("English");
    await page.locator('select[name="basic_language"]').selectOption("Spanish");
    await page.getByRole("button", { name: /^next$/i }).click();

    await expect(page.getByRole("heading", { name: "Introduction" })).toBeVisible();
    await expect(
      page.getByText(
        "Please complete all required fields marked with * before saving your profile.",
      ),
    ).toHaveCount(0);
    await expectFieldIsNotValidationRed(page.locator('textarea[name="bio"]'));
    await expectFieldIsNotValidationRed(page.locator('input[name="registration_email"]'));
    await expectFieldIsNotValidationRed(
      page.locator('input[name="registration_password"]'),
    );
    await page
      .locator('textarea[name="bio"]')
      .fill("I am a responsible test au pair who enjoys helping children learn.");
    await page.locator('input[name="registration_email"]').fill(email);
    await page.locator('input[name="registration_password"]').fill("TestPassword123!");
    await page.getByRole("button", { name: /^create account$/i }).click();

    await expect(page).toHaveURL(/\/check-email/, { timeout: 20_000 });
    await expectNoNextErrorPage(page);

    const admin = await createAdminClient();
    const { data: profile, error } = await admin
      .from("profiles")
      .select(
        "id,email,account_type,onboarding_completed,first_name,last_name,gender,date_of_birth,preferred_host_countries,mother_tongue,fluent_languages,basic_languages",
      )
      .eq("email", email)
      .single();

    expect(error).toBeNull();
    if (!profile) {
      throw new Error("Au pair registration profile was not created.");
    }

    expect(profile).toMatchObject({
      email,
      account_type: "au_pair",
      onboarding_completed: true,
      first_name: "Ana",
      last_name: "Ionescu",
      gender: "female",
      date_of_birth: "2000-01-01",
      preferred_host_countries: ["Germany"],
      mother_tongue: "German",
      fluent_languages: ["English"],
      basic_languages: ["Spanish"],
    });

    const { data: authUser, error: authUserError } =
      await admin.auth.admin.getUserById(profile.id);

    expect(authUserError).toBeNull();
    expect(authUser.user?.user_metadata).toMatchObject({
      account_type: "au_pair",
    });
    expect(authUser.user?.user_metadata).not.toHaveProperty(
      "registration_password",
    );
    expect(authUser.user?.user_metadata).not.toHaveProperty("password");
    expect(authUser.user?.user_metadata).not.toHaveProperty("accepted_terms");
  } finally {
    await deleteUserByEmail(email);
  }
});

test("family edit profile saves changed start and duration fields", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const testUser = await createOnboardedFamilyWithoutPhoto();

  try {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(testUser.email);
    await page.locator('input[name="password"]').fill(testUser.password);
    await page.locator("form").getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/profile\/photos/, { timeout: 15_000 });

    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "Your family profile" })).toBeVisible();
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByRole("heading", { name: "Match details" })).toBeVisible();

    await chooseOnboardingOption(
      page,
      "availability_start_to",
      "December 2026",
      "2026-12",
    );
    await chooseOnboardingOption(
      page,
      "availability_start_from",
      "September 2026",
      "2026-09",
    );
    await chooseOnboardingOption(
      page,
      "duration_min_months",
      "7 mo.",
      "7",
    );
    await chooseOnboardingOption(
      page,
      "duration_max_months",
      "13 mo.",
      "13",
    );

    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByRole("heading", { name: "Home details" })).toBeVisible();
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByRole("heading", { name: "Family introduction" })).toBeVisible();
    await page.getByRole("button", { name: "Save profile" }).click();

    await expect(page).toHaveURL(/\/profile\/photos/, { timeout: 20_000 });

    const { data: profile, error } = await testUser.admin
      .from("profiles")
      .select(
        "availability_start, availability_start_from, availability_start_to, duration, duration_min_months, duration_max_months",
      )
      .eq("id", testUser.userId)
      .single();

    expect(error).toBeNull();
    expect(profile).toMatchObject({
      availability_start: "Sep 2026 - Dec 2026",
      availability_start_from: "2026-09-01",
      availability_start_to: "2026-12-01",
      duration: "7-13 months",
      duration_min_months: 7,
      duration_max_months: 13,
    });
  } finally {
    await testUser.admin.from("profiles").delete().eq("id", testUser.userId);
    await testUser.admin.auth.admin.deleteUser(testUser.userId);
  }
});

test("onboarding field validation clears after correcting street address", async ({
  page,
}) => {
  const testUser = await createUnonboardedFamily();

  try {
    await page.goto("/login");

    await page.getByLabel(/email/i).fill(testUser.email);
    await page.getByLabel(/password/i).fill(testUser.password);
    await page.locator("form").getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
    await expectNoNextErrorPage(page);

    const firstName = page.locator('input[name="first_name"]');
    await firstName.fill("MIXed Case EXAMPLE");
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(
      page.getByText(
        "Use normal capitalization for names (for example, Maria or McDonald).",
      ),
    ).toBeVisible();

    const validFields = [
      ["first_name", "李"],
      ["last_name", "O’Connor-Smith"],
      ["city", "São Paulo"],
      ["phone_number", "712345678"],
    ] as const;

    for (const [name, value] of validFields) {
      const field = page.locator(`input[name="${name}"]`);
      await field.fill(value);
      await expect(field).toHaveValue(value);
      await expect
        .poll(() =>
          field.evaluate((input) => ({
            customError: input.validity.customError,
            patternMismatch: input.validity.patternMismatch,
          })),
        )
        .toEqual({
          customError: false,
          patternMismatch: false,
        });
    }

    const street = page.locator('input[name="street_address"]');
    await street.fill("a");
    await page.getByRole("button", { name: /^next$/i }).click();

    await expect
      .poll(() => street.evaluate((input) => input.validity.patternMismatch))
      .toBe(true);

    await street.fill("ab");

    await expect
      .poll(() => street.evaluate((input) => input.validity.patternMismatch))
      .toBe(false);

    await street.fill("<script>");

    await expect(street).toHaveValue("ab");

    await street.evaluate((input) => {
      input.value = "<script>";
    });

    await expect
      .poll(() => street.evaluate((input) => input.validity.patternMismatch))
      .toBe(true);

    await street.fill("गली नं. ५/क - 東京");

    await expect
      .poll(() => street.evaluate((input) => input.validity.patternMismatch))
      .toBe(false);

    await expect(page.locator("body")).not.toContainText(
      "Street and house number must be 2-100 characters",
    );
    await expect
      .poll(() =>
        street.evaluate((input) => ({
          customError: input.validity.customError,
          patternMismatch: input.validity.patternMismatch,
          valid: input.checkValidity(),
          validationMessage: input.validationMessage,
        })),
      )
      .toEqual({
        customError: false,
        patternMismatch: false,
        valid: true,
        validationMessage: "",
      });
  } finally {
    await testUser.admin.from("profiles").delete().eq("id", testUser.userId);
    await testUser.admin.auth.admin.deleteUser(testUser.userId);
  }
});

test("au pair onboarding limits preferred host countries", async ({
  page,
}) => {
  const testUser = await createUnonboardedAuPair();

  try {
    await page.goto("/login");

    await page.getByLabel(/email/i).fill(testUser.email);
    await page.getByLabel(/password/i).fill(testUser.password);
    await page.locator("form").getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
    await expectNoNextErrorPage(page);
    await completeAuPairIdentityStep(page);

    const preferredCountries = page.locator(
      'input[name="preferred_host_countries"]',
    );

    await expect.poll(() => preferredCountries.count()).toBeGreaterThan(6);

    for (let index = 0; index < 6; index += 1) {
      await preferredCountries.nth(index).check();
    }

    await preferredCountries.nth(6).click();

    await expect(page.locator("body")).toContainText(
      "Choose up to 6 countries where you would like to be an au pair.",
    );
    await expect
      .poll(() =>
        preferredCountries.evaluateAll(
          (inputs) =>
            inputs.filter((input) => (input as HTMLInputElement).checked)
              .length,
        ),
      )
      .toBe(6);
    await expect(preferredCountries.nth(6)).not.toBeChecked();
  } finally {
    await testUser.admin.from("profiles").delete().eq("id", testUser.userId);
    await testUser.admin.auth.admin.deleteUser(testUser.userId);
  }
});

test("onboarded au pair must upload a photo before accessing the app", async ({
  page,
}) => {
  const testUser = await createOnboardedAuPairWithoutPhoto();

  try {
    await page.goto("/login");

    await page.getByLabel(/email/i).fill(testUser.email);
    await page.getByLabel(/password/i).fill(testUser.password);
    await page.locator("form").getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL(/\/profile\/photos/, { timeout: 15_000 });
    await expectNoNextErrorPage(page);

    await page.goto("/messages");
    await expect(page).toHaveURL(/\/profile\/photos/, { timeout: 15_000 });
    await expectNoNextErrorPage(page);

    await page
      .locator('input[type="file"][accept*="image"]')
      .setInputFiles(join(process.cwd(), "tests/fixtures/profile-photo.png"));
    await page
      .getByRole("dialog", { name: "Adjust your photo" })
      .getByRole("button", { name: "Use photo" })
      .click();

    await expect
      .poll(async () => {
        const { count } = await testUser.admin
          .from("profile_photos")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", testUser.userId);

        return count ?? 0;
      }, { timeout: 15_000 })
      .toBe(1);

    await page.getByRole("button", { name: /continue/i }).click();

    await expect(page).toHaveURL(/\/search-family/, { timeout: 15_000 });
    await expectNoNextErrorPage(page);
  } finally {
    const { data: photos } = await testUser.admin
      .from("profile_photos")
      .select("storage_path")
      .eq("profile_id", testUser.userId);

    const storagePaths = photos?.map((photo) => photo.storage_path) ?? [];

    if (storagePaths.length > 0) {
      await testUser.admin.storage.from("profile-photos").remove(storagePaths);
    }

    await testUser.admin.from("profile_photos").delete().eq("profile_id", testUser.userId);
    await testUser.admin.from("profiles").delete().eq("id", testUser.userId);
    await testUser.admin.auth.admin.deleteUser(testUser.userId);
  }
});

test("onboarded family must upload a photo before accessing the app", async ({
  page,
}) => {
  const testUser = await createOnboardedFamilyWithoutPhoto();

  try {
    await page.goto("/login");

    await page.getByLabel(/email/i).fill(testUser.email);
    await page.getByLabel(/password/i).fill(testUser.password);
    await page.locator("form").getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL(/\/profile\/photos/, { timeout: 15_000 });
    await expectNoNextErrorPage(page);

    await page.goto("/search-aupair");
    await expect(page).toHaveURL(/\/profile\/photos/, { timeout: 15_000 });
    await expectNoNextErrorPage(page);

    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Skip for now" })).toHaveCount(0);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("body")).toContainText(
      "Please upload at least one photo to continue.",
    );

    await page
      .locator('input[type="file"][accept*="image"]')
      .setInputFiles(join(process.cwd(), "tests/fixtures/profile-photo.png"));
    await page
      .getByRole("dialog", { name: "Adjust your photo" })
      .getByRole("button", { name: "Use photo" })
      .click();

    await expect
      .poll(async () => {
        const { count } = await testUser.admin
          .from("profile_photos")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", testUser.userId);

        return count ?? 0;
      }, { timeout: 15_000 })
      .toBe(1);

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/search-aupair/, { timeout: 15_000 });
    await expectNoNextErrorPage(page);
  } finally {
    const { data: photos } = await testUser.admin
      .from("profile_photos")
      .select("storage_path")
      .eq("profile_id", testUser.userId);

    const storagePaths = photos?.map((photo) => photo.storage_path) ?? [];

    if (storagePaths.length > 0) {
      await testUser.admin.storage.from("profile-photos").remove(storagePaths);
    }

    await testUser.admin.from("profile_photos").delete().eq("profile_id", testUser.userId);
    await testUser.admin.from("profiles").delete().eq("id", testUser.userId);
    await testUser.admin.auth.admin.deleteUser(testUser.userId);
  }
});
