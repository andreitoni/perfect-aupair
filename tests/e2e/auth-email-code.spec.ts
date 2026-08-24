import { expect, test } from "@playwright/test";

test("email-code confirmation handles a failed network request without an unhandled error", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/auth/verify-email-code", (route) => route.abort());

  await page.goto("/check-email");
  await expect(
    page.getByRole("textbox", { name: "Confirmation code" }),
  ).toBeFocused();
  await page
    .getByRole("textbox", { name: "Email" })
    .fill("qa-network@example.com");
  await page
    .getByRole("textbox", { name: "Confirmation code" })
    .fill("123456");
  await page.getByRole("button", { name: "Confirm email" }).click();

  await expect(page.locator("#confirmation-form-error")).toContainText(
    "Please try again.",
  );
  await expect(
    page.getByRole("button", { name: "Confirm email" }),
  ).toBeEnabled();
  expect(pageErrors).toEqual([]);
});

test("email-code confirmation works when Web Storage is unavailable", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    const throwStorageError = () => {
      throw new DOMException("Storage is unavailable", "SecurityError");
    };
    const isConfirmationKey = (key: string) =>
      key === "pa_pending_confirmation_email" ||
      key.startsWith("pa_confirmation_resend_after:");

    Object.defineProperty(Storage.prototype, "getItem", {
      configurable: true,
      value(key: string) {
        if (isConfirmationKey(key)) throwStorageError();
        return originalGetItem.call(this, key);
      },
    });
    Object.defineProperty(Storage.prototype, "setItem", {
      configurable: true,
      value(key: string, value: string) {
        if (isConfirmationKey(key)) throwStorageError();
        return originalSetItem.call(this, key, value);
      },
    });
    Object.defineProperty(Storage.prototype, "removeItem", {
      configurable: true,
      value(key: string) {
        if (isConfirmationKey(key)) throwStorageError();
        return originalRemoveItem.call(this, key);
      },
    });
  });

  await page.route("**/auth/resend-confirmation-code", (route) =>
    route.fulfill({
      body: JSON.stringify({ ok: true, retryAfterSeconds: 60 }),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/auth/verify-email-code", (route) =>
    route.fulfill({
      body: JSON.stringify({
        ok: true,
        redirectTo: "/login?confirmation-storage-test=passed",
      }),
      contentType: "application/json",
      status: 200,
    }),
  );

  await page.goto("/check-email");
  await expect(
    page.getByRole("textbox", { name: "Confirmation code" }),
  ).toBeFocused();
  await page
    .getByRole("textbox", { name: "Email" })
    .fill("qa-storage@example.com");
  await page.getByRole("button", { name: "Send a new code" }).click();
  await expect(page.getByRole("status")).toContainText(
    "send a new confirmation code",
  );
  await page
    .getByRole("textbox", { name: "Confirmation code" })
    .fill("123456");
  await page.getByRole("button", { name: "Confirm email" }).click();

  await expect(page).toHaveURL(/confirmation-storage-test=passed/);
  expect(pageErrors).toEqual([]);
});
