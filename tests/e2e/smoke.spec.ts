import { expect, test } from "@playwright/test";
import {
  LANGUAGE_PREFERENCE_VERSION,
  LANGUAGE_PREFERENCE_VERSION_KEY,
} from "../../lib/i18n/config";

async function expectNoNextErrorPage(page: import("@playwright/test").Page) {
  await expect(page.locator("body")).not.toContainText("Runtime Error");
  await expect(page.locator("body")).not.toContainText("Build Error");
  await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
  await expect(page.locator("body")).not.toContainText("Application error");
}

test.beforeEach(async ({ context, page, baseURL }) => {
  await context.addCookies([
    {
      name: "pa_cookie_consent",
      value: "necessary",
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
  await page.addInitScript(() => {
    window.localStorage.setItem("pa_cookie_consent", "necessary");
  });
});

test.describe("public smoke tests", () => {
  test("landing page loads without framework error", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    await expectNoNextErrorPage(page);
  });

  test("first visit defaults to English even with a legacy locale value", async ({
    context,
    page,
    baseURL,
  }) => {
    await context.addCookies([
      {
        name: "pa_locale",
        value: "es",
        url: baseURL ?? "http://localhost:3000",
      },
    ]);
    await page.addInitScript(() => {
      window.localStorage.setItem("pa_locale", "es");
    });

    await page.goto("/");

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("pa_locale")))
      .toBe("en");
  });

  test("canonical language routes control the server-rendered html language", async ({
    request,
  }) => {
    const localeCookies = `pa_locale=fr; ${LANGUAGE_PREFERENCE_VERSION_KEY}=${LANGUAGE_PREFERENCE_VERSION}`;
    const [germanResponse, englishGuideResponse, homeResponse] =
      await Promise.all([
        request.get("/de/ratgeber", {
          headers: {
            cookie: localeCookies,
            "x-pa-route-locale": "fr",
          },
        }),
        request.get("/guides/best-au-pair-website", {
          headers: {
            cookie: localeCookies,
            "x-pa-route-locale": "de",
          },
        }),
        request.get("/", {
          headers: {
            "x-pa-route-locale": "de",
          },
        }),
      ]);
    const [germanHtml, englishGuideHtml, homeHtml] = await Promise.all([
      germanResponse.text(),
      englishGuideResponse.text(),
      homeResponse.text(),
    ]);

    expect(germanResponse.ok()).toBeTruthy();
    expect(englishGuideResponse.ok()).toBeTruthy();
    expect(homeResponse.ok()).toBeTruthy();
    expect(germanHtml).toMatch(/<html[^>]+lang="de"/);
    expect(englishGuideHtml).toMatch(/<html[^>]+lang="en"/);
    expect(homeHtml).toMatch(/<html[^>]+lang="en"/);
  });

  test("language menu refreshes the current dictionary and persists it", async ({
    context,
    page,
  }) => {
    await page.goto("/");

    await page
      .locator('summary[aria-label="Current language: English"]:visible')
      .click();
    await page.getByRole("button", { name: "Deutsch", exact: true }).click();

    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(
      page.getByRole("link", { name: "Registrieren", exact: true }).first(),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("pa_locale")))
      .toBe("de");

    const localeCookie = (await context.cookies()).find(
      (cookie) => cookie.name === "pa_locale",
    );
    expect(localeCookie?.value).toBe("de");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(
      page.getByRole("link", { name: "Registrieren", exact: true }).first(),
    ).toBeVisible();
  });

  test("landing exposes the branded social preview", async ({ request }) => {
    const crawlerHeaders = {
      "user-agent": "facebookexternalhit/1.1",
    };
    const pageResponse = await request.get("/", {
      headers: crawlerHeaders,
    });
    const html = await pageResponse.text();
    const imageUrl =
      "https://perfectaupair.example/brand/perfect-aupair-social-preview-v5.jpg";

    expect(pageResponse.ok()).toBeTruthy();
    expect(html).toContain(`property="og:site_name" content="Perfect AuPair"`);
    expect(html).toContain(`property="og:image" content="${imageUrl}"`);
    expect(html).toContain('property="og:image:type" content="image/jpeg"');
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('property="og:image:height" content="630"');
    expect(html).toContain(
      'property="og:image:alt" content="Perfect AuPair — browse au pair and host family profiles"',
    );
    expect(html).toContain(`name="twitter:image" content="${imageUrl}"`);
    expect(html).toContain('"@type":"ContactPoint"');

    const imageResponse = await request.get(
      "/brand/perfect-aupair-social-preview-v5.jpg",
      { headers: crawlerHeaders },
    );
    const image = await imageResponse.body();

    expect(imageResponse.ok()).toBeTruthy();
    expect(imageResponse.headers()["content-type"]).toContain("image/jpeg");
    expect(Array.from(image.subarray(0, 3))).toEqual([255, 216, 255]);
    expect(image.byteLength).toBeGreaterThan(50_000);
  });

  test("search routes expose audience-specific social previews", async ({
    request,
  }) => {
    const crawlerHeaders = {
      "user-agent": "facebookexternalhit/1.1",
    };
    const [auPairResponse, familyResponse] = await Promise.all([
      request.get("/search-aupair", { headers: crawlerHeaders }),
      request.get("/search-family", { headers: crawlerHeaders }),
    ]);
    const [auPairHtml, familyHtml] = await Promise.all([
      auPairResponse.text(),
      familyResponse.text(),
    ]);

    expect(auPairResponse.ok()).toBeTruthy();
    expect(familyResponse.ok()).toBeTruthy();
    expect(auPairHtml).toContain(
      'property="og:image" content="https://perfectaupair.example/brand/perfect-aupair-social-preview-v5.jpg"',
    );
    expect(familyHtml).toContain(
      'property="og:image" content="https://perfectaupair.example/brand/perfect-aupair-social-preview-v5.jpg"',
    );
  });

  test("login page loads without framework error", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.getByRole("button", { name: "Register" })).toBeVisible();
    await expect(page.locator("form").getByRole("button", { name: "Log in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    await expectNoNextErrorPage(page);
  });

  test("register mode opens from URL", async ({ page }) => {
    await page.goto("/login?mode=register");
    await expect(
      page.getByRole("heading", { name: "Choose your account type" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Register for free as Family" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Free family registration" }),
    ).toBeVisible();
    await expect(page.getByText("Family identity")).toBeVisible();
    await page.getByLabel(/terms/i).check();
    await page.getByRole("button", { name: "Register with Email" }).click();
    await expect(page.getByRole("heading", { name: "Family profile" })).toBeVisible();
    await expectNoNextErrorPage(page);
  });

  test("login and register tabs keep the mobile footer stable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login?mode=login");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();

    const loginFooterTop = await page
      .locator("footer")
      .evaluate((footer) => Math.round(footer.getBoundingClientRect().top));

    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("button", { name: "Register", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Choose your account type" }),
    ).toBeVisible();

    const registerFooterTop = await page
      .locator("footer")
      .evaluate((footer) => Math.round(footer.getBoundingClientRect().top));

    expect(registerFooterTop).toBe(loginFooterTop);
    await expectNoNextErrorPage(page);
  });

  test("forgot password page loads without framework error", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByRole("heading", { name: "Forgot your password?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
    await expectNoNextErrorPage(page);
  });

  test("reset password page loads without framework error", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { name: "Set a new password" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Update password" })).toBeVisible();
    await expectNoNextErrorPage(page);
  });

  test("check-email page does not expose email query requirement", async ({ page }) => {
    await page.goto("/check-email");
    await expect(page.locator("body")).toContainText("Check your email");
    await expect(page.locator("body")).not.toContainText("@");
    await expectNoNextErrorPage(page);
  });

  test("inactive maintenance page redirects to the homepage", async ({ page }) => {
    await page.goto("/maintenance");
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("link", { name: /^Perfect AuPair/ }),
    ).toBeVisible();
    await expectNoNextErrorPage(page);
  });

  test("au pair contract guide card opens the contract guide", async ({ page }) => {
    await page.goto("/guides");
    await page.getByRole("link", { name: /Au pair contract/ }).click();
    await expect(page).toHaveURL(/\/guides\/au-pair-contract$/);
    await expect(
      page.getByRole("heading", { name: "Au pair contract template" }),
    ).toBeVisible();
  });

  for (const route of [
    "/privacy",
    "/terms",
    "/cookie-policy",
    "/contact",
    "/data-deletion",
  ]) {
    test(`${route} page loads without framework error`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("body")).toBeVisible();
      await expectNoNextErrorPage(page);
    });
  }

  test("selected language translates every editorial page", async ({
    context,
    page,
    baseURL,
  }) => {
    const germanHeadings = [
      ["/about", "Über Perfect AuPair"],
      ["/contact", "Kontakt und Support"],
      ["/cookie-policy", "Cookie-Richtlinie"],
      ["/data-deletion", "Anweisungen zum Löschen von Daten"],
      ["/privacy", "Datenschutzrichtlinie"],
      ["/safety", "Sicherheitszentrum"],
      ["/terms", "Allgemeine Geschäftsbedingungen"],
      ["/guides", "Au-pair-Guides für Familien und Au-pairs"],
      ["/guides/au-pair-contract", "Vorlage für einen Au-pair-Vertrag"],
      ["/guides/au-pair-interview", "Leitfaden für Au-pair-Interviews"],
      [
        "/guides/germany",
        "Voraussetzungen für ein Au-pair in Deutschland",
      ],
      [
        "/guides/united-kingdom",
        "Au-pair im Vereinigten Königreich: Arbeitsrechte und Leitfaden",
      ],
      [
        "/guides/united-states",
        "Au-pair in den USA: Leitfaden zum J-1-Programm",
      ],
      [
        "/guides/sweden",
        "Au-pair in Schweden: Voraussetzungen und Leitfaden",
      ],
      [
        "/guides/denmark",
        "Au-pair in Dänemark: Voraussetzungen und Leitfaden",
      ],
    ] as const;

    await context.addCookies([
      {
        name: "pa_locale",
        value: "de",
        url: baseURL ?? "http://localhost:3000",
      },
      {
        name: LANGUAGE_PREFERENCE_VERSION_KEY,
        value: LANGUAGE_PREFERENCE_VERSION,
        url: baseURL ?? "http://localhost:3000",
      },
    ]);

    for (const [route, heading] of germanHeadings) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    }

    await page.goto("/safety");
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Mit konsistenten, überprüfbaren Informationen beginnen",
      }),
    ).toBeVisible();
  });

  test("German host-family CTAs open the unfiltered au pair catalog", async ({
    page,
  }) => {
    await page.goto("/de/au-pair-finden");

    const profileLinks = page.getByRole("link", { name: "Au-pair-Profile" });
    await expect(profileLinks).toHaveAttribute("href", "/search-aupair");
    const primaryCta = page.getByRole("link", { name: "Au-pairs ansehen" });
    await expect(primaryCta).toHaveAttribute("href", "/search-aupair");
    await expect(
      page
        .locator("header")
        .getByRole("link", { name: "Au-pair finden", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('header details[data-i18n-skip]'),
    ).toHaveCount(0);
    await expect(
      page.locator('a[href*="search-aupair?country=Germany"]'),
    ).toHaveCount(0);

    await primaryCta.click();
    await expect(page).toHaveURL(/\/search-aupair$/);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBe(0);
  });

  test("/de uses the German public profile feed", async ({ page }) => {
    const response = await page.goto("/de");

    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Lerne Au-pairs und Gastfamilien kennen",
    );
    await expect(
      page.locator('header details[data-i18n-skip]'),
    ).toHaveCount(0);
  });

  for (const route of [
    "/de/ratgeber",
    "/de/au-pair-finden",
    "/de/gastfamilie-werden",
    "/de/au-pair-kosten-deutschland",
    "/de/au-pair-voraussetzungen-deutschland",
    "/de/au-pair-vertrag-deutschland",
    "/de/au-pair-visum-deutschland",
    "/de/au-pair-arbeitszeit-deutschland",
    "/de/au-pair-taschengeld-deutschland",
    "/de/au-pair-finden-oesterreich",
    "/de/au-pair-kosten-oesterreich",
    "/de/gastfamilie-werden-oesterreich",
    "/de/au-pair-finden-schweiz",
    "/de/au-pair-kosten-schweiz",
    "/de/gastfamilie-werden-schweiz",
  ]) {
    test(`${route} German guide is public and indexable`, async ({ page }) => {
      const response = await page.goto(route);

      expect(response?.ok()).toBeTruthy();
      await expect(
        page.getByRole("heading", { name: "Kostenlos bei Perfect AuPair starten" }),
      ).toBeVisible();
      await expect(
        page.locator('header details[data-i18n-skip]'),
      ).toHaveCount(0);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        `https://perfectaupair.example${route}`,
      );
      const robotsMeta = page.locator('meta[name="robots"]');
      const robotsMetaCount = await robotsMeta.count();
      expect(robotsMetaCount).toBeLessThanOrEqual(1);
      if (robotsMetaCount === 1) {
        expect(await robotsMeta.getAttribute("content")).not.toContain("noindex");
      }
      await expectNoNextErrorPage(page);
    });
  }

  for (const route of ["/robots.txt", "/sitemap.xml", "/manifest.webmanifest"]) {
    test(`${route} returns public metadata`, async ({ request }) => {
      const response = await request.get(route);

      expect(response.ok()).toBeTruthy();
      expect(await response.text()).not.toHaveLength(0);
    });
  }

  test("sitemap keeps individual profiles out of search indexes", async ({
    request,
  }) => {
    const response = await request.get("/sitemap.xml");
    const sitemap = await response.text();

    expect(response.ok()).toBeTruthy();
    expect(sitemap).toContain("https://perfectaupair.example/search-aupair");
    expect(sitemap).toContain("https://perfectaupair.example/search-family");
    expect(sitemap).toContain(
      "<lastmod>2026-08-13T00:00:00.000Z</lastmod>",
    );
    expect(sitemap).toContain("https://perfectaupair.example/de/au-pair-finden");
    expect(sitemap).toContain("https://perfectaupair.example/de/ratgeber");
    expect(sitemap).toContain(
      "https://perfectaupair.example/de/au-pair-voraussetzungen-deutschland",
    );
    expect(sitemap).toContain(
      "https://perfectaupair.example/de/au-pair-vertrag-deutschland",
    );
    expect(sitemap).toContain(
      "https://perfectaupair.example/de/au-pair-visum-deutschland",
    );
    expect(sitemap).toContain(
      "https://perfectaupair.example/de/au-pair-arbeitszeit-deutschland",
    );
    expect(sitemap).toContain(
      "https://perfectaupair.example/de/au-pair-taschengeld-deutschland",
    );
    expect(sitemap).toContain(
      "https://perfectaupair.example/de/au-pair-finden-oesterreich",
    );
    expect(sitemap).toContain(
      "https://perfectaupair.example/de/au-pair-finden-schweiz",
    );
    expect(sitemap).not.toContain("https://perfectaupair.example/profile/");
  });

  test("bad profile slug does not autocomplete to a real profile", async ({ page }) => {
    await page.goto("/profile/ana-popescu-");
    await expectNoNextErrorPage(page);

    const url = page.url();
    expect(url).not.toMatch(/\/profile\/ana-popescu-[a-z0-9]{6}$/);
  });
});

test.describe("protected routes smoke tests", () => {
  for (const route of [
    "/account",
    "/account/delete",
    "/admin",
    "/messages",
    "/saved",
    "/profile/photos",
  ]) {
    test(`${route} does not show framework error while logged out`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("body")).toBeVisible();
      await expectNoNextErrorPage(page);
    });
  }
});
