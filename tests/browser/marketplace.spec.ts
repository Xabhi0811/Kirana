import { expect, test } from "@playwright/test";

test("customer checkout requires application authentication", async ({ page }) => {
  await page.goto("/checkout");
  await expect(page).toHaveURL(/\/login/);
});

test("map location entry remains available without a database-specific client", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /DELIVERING TO/ }).click();
  await page.getByLabel("Location name").fill("Gwalior");
  await page.getByLabel("Latitude", { exact: true }).fill("26.2183");
  await page.getByLabel("Longitude", { exact: true }).fill("78.1828");
  await page.getByRole("button", { name: "Set location", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
