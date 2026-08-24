import { defineConfig, devices } from "@playwright/test";
import { getSupabaseCredentials } from "./tests/e2e/helpers/supabase-local";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const webServerCommand =
  process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ?? "pnpm dev";
const reuseExistingServer =
  process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER !== "false";
const adminBrowserProjectNames = [
  "chromium",
  "android-chrome",
  "samsung-internet-emulation",
  "ios-safari",
  "iphone-chrome-emulation",
  "iphone-firefox-emulation",
  "ipad-safari",
  "desktop-safari",
  "firefox",
] as const;
const configuredAdminEmails = (
  process.env.ADMIN_EMAILS ??
  process.env.ADMIN_EMAIL ??
  ""
)
  .split(",")
  .map((email) => email.trim())
  .filter(Boolean);
const adminBrowserFixtureEmails = adminBrowserProjectNames.map(
  (project) => `qa-admin-browser-${project}@example.com`,
);
const playwrightAdminEmails = Array.from(
  new Set([...configuredAdminEmails, ...adminBrowserFixtureEmails]),
).join(",");
let localServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY ?? "";

if (!localServiceRoleKey && /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::|\/)/.test(baseURL)) {
  try {
    localServiceRoleKey = getSupabaseCredentials().serviceRoleKey;
  } catch {
    // Tests that need Supabase will report the missing local stack explicitly.
  }
}
const samsungInternetUserAgent =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36";
const iphoneDevice = devices["iPhone 15"];
const iphoneChromeUserAgent = iphoneDevice.userAgent.replace(
  /Version\/[^ ]+/,
  "CriOS/148.0.7778.96",
);
const iphoneFirefoxUserAgent = iphoneDevice.userAgent.replace(
  /Version\/[^ ]+/,
  "FxiOS/150.0",
);
const mobileMessageRegressionTestMatch = /current-regressions\.spec\.ts/;
const mobileMessageRegressionGrep =
  /mobile (?:empty conversation resists viewport rubber band|composer growth keeps the latest read receipt visible|read conversation clears its unread badge when returning to the inbox)/;
const browserMatrixTestMatch =
  /(admin-browser|auth-email-code|browser-compatibility-guards|german-seo-tools|image-uploads|deleted-account-conversations|message-typing)\.spec\.ts/;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: webServerCommand,
    env: {
      ADMIN_EMAILS: playwrightAdminEmails,
      ...(localServiceRoleKey
        ? { SUPABASE_SERVICE_ROLE_KEY: localServiceRoleKey }
        : {}),
    },
    url: baseURL,
    reuseExistingServer,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "android-chrome",
      testMatch: browserMatrixTestMatch,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "samsung-internet-emulation",
      testMatch: browserMatrixTestMatch,
      use: {
        ...devices["Galaxy S24"],
        userAgent: samsungInternetUserAgent,
      },
    },
    {
      name: "ios-safari",
      testMatch: browserMatrixTestMatch,
      use: { ...iphoneDevice },
    },
    {
      name: "iphone-chrome-emulation",
      testMatch: browserMatrixTestMatch,
      use: {
        ...iphoneDevice,
        userAgent: iphoneChromeUserAgent,
      },
    },
    {
      name: "iphone-firefox-emulation",
      testMatch: browserMatrixTestMatch,
      use: {
        ...iphoneDevice,
        userAgent: iphoneFirefoxUserAgent,
      },
    },
    {
      name: "ios-safari-message-regression",
      testMatch: mobileMessageRegressionTestMatch,
      grep: mobileMessageRegressionGrep,
      use: { ...iphoneDevice },
    },
    {
      name: "iphone-chrome-message-regression",
      testMatch: mobileMessageRegressionTestMatch,
      grep: mobileMessageRegressionGrep,
      use: {
        ...iphoneDevice,
        userAgent: iphoneChromeUserAgent,
      },
    },
    {
      name: "iphone-firefox-message-regression",
      testMatch: mobileMessageRegressionTestMatch,
      grep: mobileMessageRegressionGrep,
      use: {
        ...iphoneDevice,
        userAgent: iphoneFirefoxUserAgent,
      },
    },
    {
      name: "ipad-safari",
      testMatch: browserMatrixTestMatch,
      use: { ...devices["iPad Pro 11"] },
    },
    {
      name: "desktop-safari",
      testMatch: browserMatrixTestMatch,
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "firefox",
      testMatch: browserMatrixTestMatch,
      use: { ...devices["Desktop Firefox"] },
    },
  ],
});
