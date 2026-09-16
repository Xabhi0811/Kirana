import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { displayMarketplaceName } from "../../src/lib/brand";

test("Kirana branding appears on public pages without changing navigation", async ({
  page,
}) => {
  for (const route of ["/", "/login", "/register", "/shops"]) {
    await page.goto(route);
    await expect(page).toHaveTitle(/Kirana/);
    await expect(page.locator(".brand")).toHaveText("Kirana");
    await expect(page.locator("body")).not.toContainText(/LocalKart|LocalMart/);
  }
  await page.screenshot({
    path: `test-results/kirana-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("role dashboards and persisted marketplace default display the new brand", async ({
  browser,
}) => {
  test.skip(!existsSync(".demo-data.json"), "Demo credentials required");
  const demo = JSON.parse(readFileSync(".demo-data.json", "utf8"));
  for (const [key, route] of [
    ["customer", "/profile"],
    ["keeper", "/shopkeeper"],
    ["admin", "/admin/settings"],
  ]) {
    const context = await browser.newContext();
    try {
      const account = demo.accounts.find((a: { key: string }) => a.key === key);
      const login = await context.request.post("/api/auth/login", {
        data: { email: account.email, password: demo.password },
      });
      expect(login.status()).toBe(200);
      const page = await context.newPage();
      await page.goto(route);
      await expect(page).toHaveTitle(/Kirana/);
      await expect(page.locator(".brand")).toHaveText("Kirana");
      if (key === "admin") {
        const stored = await (
          await context.request.get("/api/platform-settings")
        ).json();
        await expect(
          page.getByLabel("Marketplace name", { exact: true }),
        ).toHaveValue(displayMarketplaceName(stored.marketplace_name));
      }
    } finally {
      await context.close();
    }
  }
});
