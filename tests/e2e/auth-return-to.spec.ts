import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  authHomeHref,
  loginHref,
  safeAuthReturnTo,
  withAuthReturnTo,
} from "../../lib/auth/return-to";
import { getSupabaseCredentials } from "./helpers/supabase-local";

const PROFILE_ID = "8b416f19-2220-4c56-8ff4-542ff5d21510";
const PROFILE_HREF = "/profile/anna-berlin-a1b2c3";
const MESSAGE_HREF = `/messages?profile=${PROFILE_ID}`;
const PASSWORD = "TestPassword123!";

function responseLocation(response: {
  headers(): Record<string, string>;
}) {
  return new URL(response.headers().location, "http://localhost:3000");
}

test("auth return destinations are narrowly allowlisted", () => {
  expect(safeAuthReturnTo(PROFILE_HREF)).toBe(PROFILE_HREF);
  expect(safeAuthReturnTo(`/profile/${PROFILE_ID}`)).toBe(
    `/profile/${PROFILE_ID}`,
  );
  expect(safeAuthReturnTo(MESSAGE_HREF)).toBe(MESSAGE_HREF);
  expect(
    safeAuthReturnTo(
      "/search-aupair?country=United%20States&page=3&has_video=true",
    ),
  ).toBe("/search-aupair?country=United+States&page=3&has_video=true");
  expect(
    safeAuthReturnTo(
      "/search-family?children=2&allowanceCurrency=EUR&sort=newest",
    ),
  ).toBe(
    "/search-family?children=2&allowanceCurrency=EUR&sort=newest",
  );

  for (const unsafeHref of [
    "https://example.com/profile/person",
    "//example.com/profile/person",
    "/\\example.com/profile/person",
    "/admin",
    "/account",
    "/api/private",
    "/auth/home",
    "/onboarding",
    "/messages",
    `/messages?profile=${PROFILE_ID}&conversation=secret`,
    "/messages?profile=not-a-uuid",
    `${PROFILE_HREF}?source=private`,
    `${PROFILE_HREF}#details`,
    "/profile/%2F%2Fexample.com",
    "/search-aupair?unknown=value",
    "/search-family?page=2&page=3",
  ]) {
    expect(safeAuthReturnTo(unsafeHref), unsafeHref).toBeNull();
  }
});

test("auth link builders encode the destination without changing its meaning", () => {
  expect(authHomeHref(MESSAGE_HREF)).toBe(
    `/auth/home?returnTo=${encodeURIComponent(MESSAGE_HREF)}`,
  );
  expect(loginHref(PROFILE_HREF, "register")).toBe(
    `/login?mode=register&returnTo=${encodeURIComponent(PROFILE_HREF)}`,
  );
  expect(withAuthReturnTo("/login?auth=oauth_failed", PROFILE_HREF)).toBe(
    `/login?auth=oauth_failed&returnTo=${encodeURIComponent(PROFILE_HREF)}`,
  );
  expect(loginHref("https://example.com", "register")).toBe(
    "/login?mode=register",
  );
});

test("password login fallback preserves only a safe return destination", async ({
  request,
}) => {
  const safeResponse = await request.post("/auth/login", {
    form: {
      email: "",
      password: "",
      returnTo: MESSAGE_HREF,
    },
    maxRedirects: 0,
  });

  expect(safeResponse.status()).toBe(303);
  const safeLocation = responseLocation(safeResponse);
  expect(safeLocation.pathname).toBe("/login");
  expect(safeLocation.searchParams.get("returnTo")).toBe(MESSAGE_HREF);

  const unsafeResponse = await request.post("/auth/login", {
    form: {
      email: "",
      password: "",
      returnTo: "https://example.com/steal-session",
    },
    maxRedirects: 0,
  });

  expect(unsafeResponse.status()).toBe(303);
  const unsafeLocation = responseLocation(unsafeResponse);
  expect(unsafeLocation.pathname).toBe("/login");
  expect(unsafeLocation.searchParams.has("returnTo")).toBe(false);
  expect(unsafeLocation.origin).not.toBe("https://example.com");
});

test("auth home consumes guest intent only after onboarding and photo gates", async ({
  page,
}) => {
  const { serviceRoleKey, url } = getSupabaseCredentials();
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `qa-auth-return-to-${suffix}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: PASSWORD,
    user_metadata: { account_type: "family" },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Could not create auth return fixture.");
  }

  const userId = data.user.id;

  try {
    const { error: profileError } = await admin.from("profiles").upsert({
      id: userId,
      email,
      account_type: "family",
      onboarding_completed: false,
    });

    if (profileError) throw new Error(profileError.message);

    const loginResponse = await page.request.post("/auth/login", {
      data: {
        email,
        password: PASSWORD,
        returnTo: PROFILE_HREF,
      },
    });
    expect(loginResponse.ok()).toBe(true);

    const authHome = authHomeHref(PROFILE_HREF);
    const onboardingResponse = await page.request.get(authHome, {
      maxRedirects: 0,
    });
    const onboardingLocation = responseLocation(onboardingResponse);
    expect(onboardingLocation.pathname).toBe("/onboarding");
    expect(onboardingLocation.searchParams.get("returnTo")).toBe(PROFILE_HREF);

    const { error: onboardingError } = await admin
      .from("profiles")
      .update({
        first_name: "QA",
        last_name: "Return Family",
        full_name: "The Return Family",
        country: "Germany",
        city: "Berlin",
        onboarding_completed: true,
      })
      .eq("id", userId);

    if (onboardingError) throw new Error(onboardingError.message);

    const photoGateResponse = await page.request.get(authHome, {
      maxRedirects: 0,
    });
    const photoGateLocation = responseLocation(photoGateResponse);
    expect(photoGateLocation.pathname).toBe("/profile/photos");
    expect(photoGateLocation.searchParams.get("returnTo")).toBe(PROFILE_HREF);

    const { error: photoError } = await admin.from("profile_photos").insert({
      profile_id: userId,
      storage_path: `${userId}/auth-return-to.webp`,
      is_primary: true,
      sort_order: 0,
    });

    if (photoError) throw new Error(photoError.message);

    const readyResponse = await page.request.get(authHome, {
      maxRedirects: 0,
    });
    expect(responseLocation(readyResponse).pathname).toBe(PROFILE_HREF);
  } finally {
    await admin.from("profile_photos").delete().eq("profile_id", userId);
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  }
});

test("switching login mode keeps a safe guest intent", async ({ page }) => {
  await page.goto(`/login?returnTo=${encodeURIComponent(PROFILE_HREF)}`);
  await page.getByRole("button", { name: "Register" }).first().click();

  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === "/login" &&
      url.searchParams.get("mode") === "register" &&
      url.searchParams.get("returnTo") === PROFILE_HREF
    );
  });
});
