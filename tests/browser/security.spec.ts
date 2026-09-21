import { expect, test } from "@playwright/test";

test("protected customer, shopkeeper, and admin pages require a Kirana session", async ({ page }) => {
  for (const path of ["/account", "/shopkeeper", "/admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("registration does not offer privileged roles", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByLabel("I want to").locator("option")).toHaveCount(3);
  await expect(page.getByLabel("I want to")).not.toContainText("ADMIN");
});
