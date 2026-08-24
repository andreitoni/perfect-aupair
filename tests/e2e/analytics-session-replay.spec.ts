import { expect, test } from "@playwright/test";
import {
  isAdminAnalyticsPath,
  isAnalyticsAllowedPath,
} from "../../lib/analytics/route-privacy";
import { isSessionReplayAllowedPath } from "../../lib/analytics/session-replay-routes";
import {
  sanitizeBrowserSentryEvent,
  sanitizeSentryEvent,
} from "../../lib/monitoring/sentry-sanitize";
import {
  genericMonitoringPageTitle,
  sanitizedMonitoringPath,
} from "../../lib/privacy/safe-monitoring-url";

test.describe("session replay route privacy", () => {
  test("loads Vercel Web Analytics only after optional consent", async ({
    context,
    page,
    baseURL,
  }) => {
    const cookieUrl = baseURL ?? "http://localhost:3000";

    await context.addCookies([
      { name: "pa_cookie_consent", value: "necessary", url: cookieUrl },
    ]);
    await page.goto("/login");
    await expect(
      page.locator('script[data-sdkn^="@vercel/analytics"]'),
    ).toHaveCount(0);

    await context.addCookies([
      { name: "pa_cookie_consent", value: "all", url: cookieUrl },
    ]);
    await page.reload();
    await expect(
      page.locator('script[data-sdkn^="@vercel/analytics"]'),
    ).toHaveCount(1);
  });

  test("keeps necessary-only consent in the two-step preferences flow", async ({
    context,
    page,
  }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("button", {
        name: "Adjust",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Accept all",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Necessary only",
        exact: true,
      }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Adjust", exact: true }).click();
    await page
      .getByRole("button", { name: "Accept selected", exact: true })
      .click();

    await expect
      .poll(async () => {
        const consentCookie = (await context.cookies()).find(
          (cookie) => cookie.name === "pa_cookie_consent",
        );
        return consentCookie?.value;
      })
      .toBe("necessary");
    await expect(
      page.locator('script[data-sdkn^="@vercel/analytics"]'),
    ).toHaveCount(0);
  });

  test("keeps consent usable when an embedded browser denies localStorage", async ({
    context,
    page,
  }) => {
    await page.addInitScript(() => {
      const originalSetItem = Storage.prototype.setItem;

      Storage.prototype.setItem = function setItem(key, value) {
        if (key === "pa_cookie_consent") {
          throw new DOMException("Access is denied", "SecurityError");
        }

        return originalSetItem.call(this, key, value);
      };
    });
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    await page.goto("/login");
    await page
      .getByRole("button", { name: "Accept all", exact: true })
      .first()
      .click();

    await expect
      .poll(async () => {
        const consentCookie = (await context.cookies()).find(
          (cookie) => cookie.name === "pa_cookie_consent",
        );
        return consentCookie?.value;
      })
      .toBe("all");
    expect(
      pageErrors.filter((error) =>
        /localStorage|Access is denied/i.test(error.message),
      ),
    ).toEqual([]);
  });

  test("fails closed without crashing when a browser denies consent cookies", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    await page.goto("/login");
    await page.evaluate(() => {
      Object.defineProperty(Document.prototype, "cookie", {
        configurable: true,
        get() {
          throw new DOMException("Cookie access is denied", "SecurityError");
        },
        set() {
          // Simulate an embedded browser that silently rejects cookie writes.
        },
      });
    });
    await page
      .getByRole("button", { name: "Accept all", exact: true })
      .first()
      .click();

    await expect
      .poll(() =>
        page.evaluate(() => window.localStorage.getItem("pa_cookie_consent")),
      )
      .toBe("necessary");
    expect(
      pageErrors.filter((error) =>
        /cookie|SecurityError|Access is denied/i.test(error.message),
      ),
    ).toEqual([]);
  });

  test("keeps static monitoring routes distinct from dynamic content", () => {
    expect(sanitizedMonitoringPath("/profile/photos?step=required")).toBe(
      "/profile/photos",
    );
    expect(sanitizedMonitoringPath("/profile/public-name-secret")).toBe(
      "/profile/[id]",
    );
    expect(sanitizedMonitoringPath("/stories/new")).toBe("/stories/new");
    expect(sanitizedMonitoringPath("/stories/story-secret")).toBe(
      "/stories/[id]",
    );
    expect(genericMonitoringPageTitle("/profile/public-name-secret")).toBe(
      "Profile",
    );
    expect(genericMonitoringPageTitle("/profile/photos")).toBe(
      "Profile media",
    );
  });

  test("allows replay everywhere except private routes", () => {
    for (const pathname of [
      "/",
      "/about",
      "/account",
      "/account/delete",
      "/auth/callback",
      "/check-email",
      "/contact",
      "/cookie-policy",
      "/data-deletion",
      "/forgot-password",
      "/guides",
      "/guides/germany",
      "/guides/au-pair-interview/",
      "/login",
      "/maintenance",
      "/messages-private",
      "/notifications/saved",
      "/onboarding",
      "/privacy",
      "/profile/photos",
      "/profile/public-slug",
      "/report",
      "/reset-password",
      "/safety",
      "/saved",
      "/search-aupair",
      "/search-family",
      "/stories/story-id",
      "/terms",
    ]) {
      expect(isSessionReplayAllowedPath(pathname), pathname).toBe(true);
    }

    for (const pathname of [
      "/messages",
      "/messages/",
      "/messages/conversation-id",
      "/admin",
      "/admin/",
      "/admin/conversations-archive",
      "/admin/logins",
      "/admin/profiles/profile-id",
      "/admin/conversations",
      "/admin/conversations/",
      "/admin/conversations/conversation-id",
    ]) {
      expect(isSessionReplayAllowedPath(pathname), pathname).toBe(false);
    }

    expect(isSessionReplayAllowedPath(null)).toBe(false);
    expect(isSessionReplayAllowedPath("guides")).toBe(false);
  });

  test("excludes the complete admin route tree from every analytics path", () => {
    for (const pathname of [
      "/admin",
      "/admin/",
      "/admin?view=system",
      "/admin/logins",
      "/admin/profiles/profile-id",
      "/admin/conversations/conversation-id",
    ]) {
      expect(isAdminAnalyticsPath(pathname), pathname).toBe(true);
      expect(isAnalyticsAllowedPath(pathname), pathname).toBe(false);
    }

    for (const pathname of ["/", "/admin-help", "/administration", "/login"]) {
      expect(isAdminAnalyticsPath(pathname), pathname).toBe(false);
      expect(isAnalyticsAllowedPath(pathname), pathname).toBe(true);
    }
  });

  test("drops admin errors and transactions before Sentry delivery", () => {
    expect(
      sanitizeSentryEvent({
        request: { url: "https://perfectaupair.example/admin?view=system" },
      }),
    ).toBeNull();
    expect(
      sanitizeSentryEvent({ transaction: "GET /admin/profiles/profile-id" }),
    ).toBeNull();
    expect(
      sanitizeSentryEvent({ transaction: "Page Render (/admin/logins)" }),
    ).toBeNull();
    expect(
      sanitizeSentryEvent({
        breadcrumbs: [{ data: { to: "/admin/profiles/profile-id" } }],
        transaction: "navigation",
      }),
    ).toBeNull();
    expect(
      sanitizeBrowserSentryEvent(
        { transaction: "navigation" },
        "Mozilla/5.0 Chrome/150.0.0.0",
        "/admin/logins",
      ),
    ).toBeNull();
    expect(
      sanitizeSentryEvent({
        request: { url: "https://perfectaupair.example/login" },
      }),
    ).not.toBeNull();
  });

  test("redacts Sentry URLs, identifiers, private request data, and IP headers", () => {
    const conversationId = "7f6de8ad-74bd-4db3-9ee8-7375cafe0961";
    const event = sanitizeSentryEvent({
      request: {
        url: "https://perfectaupair.example/profile/private-slug?token=secret",
        query_string: `conversation=${conversationId}`,
        cookies: { session: "secret" },
        data: { message_body: "private" },
        headers: {
          "next-url": `/messages?conversation=${conversationId}`,
          "x-forwarded-for": "203.0.113.10",
          "x-vercel-ip-city": "Berlin",
          "user-agent": "Test browser",
        },
      },
      transaction: "GET /profile/private-slug?token=secret",
      breadcrumbs: [
        {
          data: {
            from: `/messages?conversation=${conversationId}`,
            to: "/profile/private-slug?source=notification",
          },
        },
      ],
      exception: {
        values: [
          {
            value: `Could not load ${conversationId} for person@example.com`,
          },
        ],
      },
    });

    expect(event).not.toBeNull();
    if (!event) throw new Error("Expected a sanitized Sentry event");

    expect(event.request?.url).toBe(
      "https://perfectaupair.example/profile/[id]",
    );
    expect(event.request).not.toHaveProperty("query_string");
    expect(event.request).not.toHaveProperty("cookies");
    expect(event.request).not.toHaveProperty("data");
    expect(event.request?.headers).toEqual({ "user-agent": "Test browser" });
    expect(event.transaction).toBe("GET /profile/[id]");
    expect(event.breadcrumbs?.[0]?.data).toEqual({
      from: "/messages",
      to: "/profile/[id]",
    });
    expect(event.exception?.values?.[0]?.value).toBe(
      "Could not load [redacted-id] for [redacted-email]",
    );
    expect(
      sanitizeSentryEvent({ transaction: "GET /profile/[id]" })?.transaction,
    ).toBe("GET /profile/[id]");
    expect(
      sanitizeSentryEvent({
        transaction: "https://perfectaupair.example/profile/[id]",
      })?.transaction,
    ).toBe("https://perfectaupair.example/profile/[id]");
  });

  test("drops only the injected Huawei Browser translation request error", () => {
    const huaweiTranslationError = {
      exception: {
        values: [
          {
            value:
              "Failed to execute 'send' on 'XMLHttpRequest': Failed to load 'https://searchaggr-dra.dt.dbankcloud.com/search/api/v1/webtranslation_detect'.",
            stacktrace: {
              frames: [
                { function: "ajax" },
                { function: "Object.checkLanguage" },
              ],
            },
          },
        ],
      },
    };

    expect(sanitizeSentryEvent(huaweiTranslationError)).toBeNull();
    expect(
      sanitizeSentryEvent({
        ...huaweiTranslationError,
        exception: {
          values: [
            {
              ...huaweiTranslationError.exception.values[0],
              value:
                "Failed to load 'https://attacker.example/https://searchaggr-dra.dt.dbankcloud.com/search/api/v1/webtranslation_detect'.",
            },
          ],
        },
      }),
    ).not.toBeNull();
    expect(
      sanitizeSentryEvent({
        ...huaweiTranslationError,
        exception: {
          values: [
            {
              ...huaweiTranslationError.exception.values[0],
              value:
                "Failed to load 'https://searchaggr-dra.dt.dbankcloud.com.attacker.example/search/api/v1/webtranslation_detect'.",
            },
          ],
        },
      }),
    ).not.toBeNull();
    expect(
      sanitizeSentryEvent({
        ...huaweiTranslationError,
        exception: {
          values: [
            {
              ...huaweiTranslationError.exception.values[0],
              stacktrace: { frames: [{ function: "appRequest" }] },
            },
          ],
        },
      }),
    ).not.toBeNull();
    expect(
      sanitizeSentryEvent({
        exception: {
          values: [
            {
              value:
                "Failed to execute 'send' on 'XMLHttpRequest': Failed to load 'https://perfectaupair.example/api/example'.",
              stacktrace: {
                frames: [
                  { function: "ajax" },
                  { function: "Object.checkLanguage" },
                ],
              },
            },
          ],
        },
      }),
    ).not.toBeNull();
  });

  test("drops only the injected Facebook Android navigation bridge error", () => {
    const facebookBridgeError = {
      exception: {
        values: [
          {
            value: "Error invoking postMessage: Java object is gone",
            stacktrace: {
              frames: [
                {
                  filename:
                    "app://navigation_performance_logger_android:1:10034",
                  function: "sendDataToNative",
                },
                {
                  filename:
                    "app://navigation_performance_logger_android:1:13584",
                  function: "sendBeforeUnloadMessage",
                },
              ],
            },
          },
        ],
      },
    };

    expect(sanitizeSentryEvent(facebookBridgeError)).toBeNull();
    expect(
      sanitizeSentryEvent({
        ...facebookBridgeError,
        exception: {
          values: [
            {
              ...facebookBridgeError.exception.values[0],
              stacktrace: {
                frames: [
                  {
                    filename: "components/messages/bridge.ts",
                    function: "sendDataToNative",
                  },
                  {
                    filename: "components/messages/bridge.ts",
                    function: "sendBeforeUnloadMessage",
                  },
                ],
              },
            },
          ],
        },
      }),
    ).not.toBeNull();
    expect(
      sanitizeSentryEvent({
        exception: {
          values: [
            {
              value:
                "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.",
            },
          ],
        },
      }),
    ).not.toBeNull();
  });

  test("drops only ResizeObserver notifications without an app stack", () => {
    const observerNotification = {
      exception: {
        values: [
          {
            value: "ResizeObserver loop limit exceeded",
            stacktrace: { frames: [{ filename: "app:///" }] },
          },
        ],
      },
    };

    expect(sanitizeSentryEvent(observerNotification)).toBeNull();
    expect(
      sanitizeSentryEvent({
        exception: {
          values: [
            {
              value: "ResizeObserver loop limit exceeded",
              stacktrace: {
                frames: [{ filename: "components/profile/ProfileCard.tsx" }],
              },
            },
          ],
        },
      }),
    ).not.toBeNull();
  });

  test("drops only stackless Safari message-navigation load interruptions", () => {
    const safariMessagesInterruption = {
      transaction: "https://perfectaupair.example/messages",
      exception: {
        values: [{ value: "Load failed" }],
      },
    };
    const mobileSafariUserAgent =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1";

    expect(
      sanitizeBrowserSentryEvent(
        safariMessagesInterruption,
        mobileSafariUserAgent,
      ),
    ).toBeNull();
    expect(
      sanitizeSentryEvent({
        ...safariMessagesInterruption,
        contexts: { browser: { name: "Safari" } },
      }),
    ).toBeNull();
    expect(
      sanitizeBrowserSentryEvent(
        {
          ...safariMessagesInterruption,
          transaction: "GET /messages?conversation=private-id",
        },
        mobileSafariUserAgent,
      ),
    ).toBeNull();
    expect(
      sanitizeBrowserSentryEvent(
        {
          ...safariMessagesInterruption,
          transaction: "https://perfectaupair.example/search-family",
        },
        mobileSafariUserAgent,
      ),
    ).not.toBeNull();
    expect(
      sanitizeBrowserSentryEvent(
        safariMessagesInterruption,
        "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/150.0.0.0 Mobile Safari/537.36",
      ),
    ).not.toBeNull();
    expect(
      sanitizeBrowserSentryEvent(
        {
          ...safariMessagesInterruption,
          exception: {
            values: [
              {
                value: "Load failed",
                stacktrace: { frames: [{ function: "loadConversation" }] },
              },
            ],
          },
        },
        mobileSafariUserAgent,
      ),
    ).not.toBeNull();
  });

  test("drops only Safari public-profile React DOM removal noise", () => {
    const reactDomRemoval = {
      contexts: { browser: { name: "Mobile Safari" } },
      transaction: "https://perfectaupair.example/profile/[id]",
      exception: {
        values: [
          {
            value: "The object can not be found here.",
            stacktrace: {
              frames: [
                {
                  filename:
                    "node_modules/next/dist/compiled/react-dom/react-dom-client.production.js",
                  function: "commitDeletionEffectsOnFiber",
                },
                {
                  filename: "[native code]",
                  function: "removeChild",
                },
              ],
            },
          },
        ],
      },
    };

    expect(sanitizeSentryEvent(reactDomRemoval)).toBeNull();
    expect(
      sanitizeSentryEvent({
        ...reactDomRemoval,
        contexts: { browser: { name: "Chrome" } },
      }),
    ).not.toBeNull();
    expect(
      sanitizeSentryEvent({
        ...reactDomRemoval,
        exception: {
          values: [
            {
              ...reactDomRemoval.exception.values[0],
              stacktrace: {
                frames: [
                  ...reactDomRemoval.exception.values[0].stacktrace.frames,
                  {
                    filename: "components/profile/ProfilePhotoLightbox.tsx",
                    function: "closeLightbox",
                  },
                ],
              },
            },
          ],
        },
      }),
    ).not.toBeNull();
    expect(
      sanitizeSentryEvent({
        ...reactDomRemoval,
        transaction: "https://perfectaupair.example/messages",
      }),
    ).not.toBeNull();
  });

  test("non-message entry routes keep provider masking defaults", async ({
    page,
  }) => {
    await page.goto("/login");

    expect(
      await page.locator("body").getAttribute("data-clarity-unmask"),
    ).toBeNull();
    expect(await page.locator("body").getAttribute("data-clarity-mask")).toBeNull();
    expect(await page.locator("body").getAttribute("data-hj-suppress")).toBeNull();
    await expect(
      page.locator(
        '[data-clarity-mask="true"] input[autocomplete="current-password"]',
      ),
    ).toHaveCount(1);
  });

  test("public legal routes keep provider masking defaults", async ({ page }) => {
    await page.goto("/privacy");

    expect(
      await page.locator("body").getAttribute("data-clarity-unmask"),
    ).toBeNull();
    expect(await page.locator("body").getAttribute("data-clarity-mask")).toBeNull();
    expect(await page.locator("body").getAttribute("data-hj-suppress")).toBeNull();
  });

  test("client navigation between non-message routes remains visible", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Log in", exact: true }).first().click();
    await expect(page).toHaveURL(/\/login/);

    expect(
      await page.locator("body").getAttribute("data-clarity-unmask"),
    ).toBeNull();
    expect(await page.locator("body").getAttribute("data-clarity-mask")).toBeNull();
    expect(await page.locator("body").getAttribute("data-hj-suppress")).toBeNull();
  });
});
