import { expect, test } from "@playwright/test";

test("German requirements checker works without sending user data", async ({
  page,
}) => {
  await page.goto("/de/au-pair-voraussetzungen-deutschland");

  const checker = page.getByRole("region", {
    name: "Passen die Grundvoraussetzungen?",
  });
  await expect(checker).toBeVisible();

  for (const yesOption of await checker.getByText("Ja", { exact: true }).all()) {
    await yesOption.click();
  }

  await expect(page.getByTestId("requirements-check-result")).toContainText(
    "Die grundlegenden Punkte passen zusammen.",
  );
});

test("German visa checklist can be completed interactively", async ({ page }) => {
  await page.goto("/de/au-pair-visum-deutschland");

  const checklist = page.getByRole("region", {
    name: "Au-pair-Visum: Vorbereitungscheckliste",
  });
  await expect(checklist).toBeVisible();
  await checklist.getByRole("checkbox").first().check();
  await expect(checklist).toContainText("1 von 8 Punkten abgehakt");
  await expect(
    checklist.getByRole("button", { name: "Drucken / als PDF speichern" }),
  ).toBeVisible();
});
