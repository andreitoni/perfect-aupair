import { expect, test } from "@playwright/test";

const instagramIosUserAgent =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.0.0";

test("contains only the injected Meta iOS native bridge failure", async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== "chromium");

  const context = await browser.newContext({ userAgent: instagramIosUserAgent });
  const page = await context.newPage();

  try {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator("#pa-in-app-browser-bridge-error-guard"),
    ).toHaveCount(1);

    const result = await page.evaluate(() => {
      const observed: string[] = [];
      const observer = (event: ErrorEvent) => observed.push(event.message);
      window.addEventListener("error", observer);

      const injectedError = new Error(
        "undefined is not an object (evaluating 'window.webkit.messageHandlers')",
      );
      Object.defineProperty(injectedError, "stack", {
        value: "sendPageHideMessage@app:///:1:120",
      });
      const injectedEvent = new ErrorEvent("error", {
        cancelable: true,
        error: injectedError,
        filename: "app:///:1",
        message: injectedError.message,
      });
      window.dispatchEvent(injectedEvent);

      const applicationError = new Error(injectedError.message);
      const applicationEvent = new ErrorEvent("error", {
        cancelable: true,
        error: applicationError,
        filename: "https://perfectaupair.example/_next/static/app.js",
        message: applicationError.message,
      });
      window.dispatchEvent(applicationEvent);

      window.removeEventListener("error", observer);

      return {
        applicationDefaultPrevented: applicationEvent.defaultPrevented,
        injectedDefaultPrevented: injectedEvent.defaultPrevented,
        observed,
      };
    });

    expect(result.injectedDefaultPrevented).toBe(true);
    expect(result.applicationDefaultPrevented).toBe(false);
    expect(result.observed).toEqual([
      "undefined is not an object (evaluating 'window.webkit.messageHandlers')",
    ]);
  } finally {
    await context.close();
  }
});

test("keeps the same error observable outside a Meta iOS browser", async ({
  page,
}) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(
    page.locator("#pa-in-app-browser-bridge-error-guard"),
  ).toHaveCount(1);

  const result = await page.evaluate(() => {
    let observed = false;
    const observer = () => {
      observed = true;
    };
    window.addEventListener("error", observer);

    const error = new Error(
      "undefined is not an object (evaluating 'window.webkit.messageHandlers')",
    );
    Object.defineProperty(error, "stack", {
      value: "sendPageHideMessage@app:///:1:120",
    });
    const event = new ErrorEvent("error", {
      cancelable: true,
      error,
      filename: "app:///:1",
      message: error.message,
    });
    window.dispatchEvent(event);
    window.removeEventListener("error", observer);

    return { defaultPrevented: event.defaultPrevented, observed };
  });

  expect(result).toEqual({ defaultPrevented: false, observed: true });
});
