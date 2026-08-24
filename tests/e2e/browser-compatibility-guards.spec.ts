import { expect, test } from "@playwright/test";

const facebookAndroidUserAgent =
  "Mozilla/5.0 (Linux; Android 16; SM-A366B) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/151.0.7922.54 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/572.0.0.38.71;IABMV/1;] FBNV/500";

test("keeps guide links crawlable and reachable in the legal footer", async ({
  page,
}) => {
  await page.goto("/login");

  const footer = page.locator("footer");
  const countryGuidesLink = footer.getByRole("link", {
    name: "Country guides",
    exact: true,
  });
  const germanyLink = footer.getByRole("link", {
    name: "Germany",
    exact: true,
  });

  await expect(countryGuidesLink).toBeVisible();
  await expect(germanyLink).toBeVisible();

  if ((page.viewportSize()?.width ?? 0) < 640) {
    await expect(countryGuidesLink).toHaveCSS("min-height", "36px");
    await expect(germanyLink).toHaveCSS("min-height", "36px");
  }
});

test("keeps mobile controls reachable above the cookie banner", async ({
  page,
}) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 640);

  await page.goto("/login");

  const banner = page.getByRole("dialog", {
    name: "Cookie choices",
    exact: true,
  });
  await expect(banner).toBeVisible();
  await expect(
    banner.getByRole("button", { name: "Adjust", exact: true }),
  ).toBeVisible();
  await expect(
    banner.getByRole("button", { name: "Accept all", exact: true }),
  ).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() =>
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--pa-cookie-consent-clearance",
          ),
        ),
      ),
    )
    .toBeGreaterThan(0);

  const measuredLayout = await page.evaluate(() => {
    const bannerElement = document.querySelector(".pa-cookie-consent-banner");
    const bannerRect = bannerElement?.getBoundingClientRect();

    return {
      bodyPaddingBottom: Number.parseFloat(
        getComputedStyle(document.body).paddingBottom,
      ),
      clearance: Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--pa-cookie-consent-clearance",
        ),
      ),
      coveredViewportHeight: bannerRect
        ? window.innerHeight - bannerRect.top
        : 0,
    };
  });

  expect(measuredLayout.clearance).toBeGreaterThan(0);
  expect(measuredLayout.bodyPaddingBottom).toBeCloseTo(
    measuredLayout.clearance,
    0,
  );
  expect(measuredLayout.clearance).toBeCloseTo(
    measuredLayout.coveredViewportHeight,
    0,
  );
});

test("protects React-owned DOM from automatic browser translation", async ({
  page,
}) => {
  await page.goto("/login");

  await expect(page.locator("html")).toHaveAttribute("translate", "no");
  await expect(page.locator("html")).toHaveClass(/\bnotranslate\b/);
  await expect(page.locator('meta[name="google"]')).toHaveAttribute(
    "content",
    "notranslate",
  );
});

test("keeps the German landing feed usable", async ({ page }) => {
  await page.goto("/de");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Lerne Au-pairs und Gastfamilien kennen",
  );

  await expect(page.locator('header details[data-i18n-skip]')).toHaveCount(0);
});

test("keeps the German au pair cost calculator usable", async ({ page }) => {
  await page.goto("/de/au-pair-kosten-deutschland");

  await expect(
    page.getByRole("heading", { name: "Au-pair-Kostenrechner Deutschland" }),
  ).toBeVisible();
  await expect(page.getByTestId("monthly-cost-total")).toContainText("350");
  await expect(page.getByTestId("stay-cost-total")).toContainText("4.200");

  await page.getByLabel("Versicherung").fill("45");
  await page.getByLabel("Fahrt zum Sprachkurs").fill("50");
  await page.getByTestId("cost-duration").fill("6");

  await expect(page.getByTestId("monthly-cost-total")).toContainText("445");
  await expect(page.getByTestId("stay-cost-total")).toContainText("2.670");
  await expect(
    page.getByText("Versicherungsschutz ist erforderlich"),
  ).toHaveCount(0);

  for (const input of await page.locator('input[type="number"]').all()) {
    await expect(input).toHaveCSS("font-size", "16px");
  }
});

test("contains the injected Facebook Android beforeunload bridge failure", async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== "chromium");

  const context = await browser.newContext({
    userAgent: facebookAndroidUserAgent,
  });
  await context.addInitScript(() => {
    window.addEventListener("beforeunload", () => {
      throw new Error("Error invoking postMessage: Java object is gone");
    });
  });
  const page = await context.newPage();

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const guardErrors: string[] = [];
    page.on("pageerror", (error) => guardErrors.push(error.message));

    await page.evaluate(async () => {
      window.dispatchEvent(new Event("error"));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(guardErrors).toEqual([]);

    const bridgeErrorEscaped = await page.evaluate(async () => {
      let escaped = false;
      const observeEscapedBridgeError = (event: ErrorEvent) => {
        if (
          event.error instanceof Error &&
          event.error.message === "Error invoking postMessage: Java object is gone"
        ) {
          escaped = true;
        }
      };

      window.addEventListener("error", observeEscapedBridgeError);
      window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      window.removeEventListener("error", observeEscapedBridgeError);

      return escaped;
    });

    expect(bridgeErrorEscaped).toBe(false);

    const unrelatedErrorRemainsObservable = await page.evaluate(() => {
      let observed = false;
      const unrelatedError = new Error("Application failure");
      const observer = (event: ErrorEvent) => {
        if (event.error === unrelatedError) observed = true;
      };

      window.addEventListener("error", observer);
      window.dispatchEvent(
        new ErrorEvent("error", {
          error: unrelatedError,
          message: unrelatedError.message,
        }),
      );
      window.removeEventListener("error", observer);

      return observed;
    });

    expect(unrelatedErrorRemainsObservable).toBe(true);
  } finally {
    await context.close();
  }
});

test("keeps normal beforeunload behavior outside Facebook Android", async ({
  page,
}) => {
  await page.goto("/");

  const applicationHandlerRan = await page.evaluate(() => {
    let ran = false;

    window.addEventListener("beforeunload", () => {
      ran = true;
    });
    window.dispatchEvent(new Event("beforeunload", { cancelable: true }));

    return ran;
  });

  expect(applicationHandlerRan).toBe(true);
});
