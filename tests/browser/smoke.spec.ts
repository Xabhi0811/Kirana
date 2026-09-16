import { test, expect } from "@playwright/test";
test("category images and public announcements render from API data", async ({
  page,
}) => {
  await page.route("**/api/categories", (r) =>
    r.fulfill({
      json: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          name: "Fresh Dairy",
          parent_id: null,
          image_url: "https://example.com/dairy.png",
        },
      ],
    }),
  );
  await page.route("**/api/platform-settings", (r) =>
    r.fulfill({
      json: {
        marketplace_name: "Kirana",
        support_email: "support@example.com",
        announcement: "Welcome neighbours",
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: "Fresh Dairy", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Marketplace information")).toContainText(
    "Welcome neighbours",
  );
  await expect(
    page.getByRole("link", { name: "Contact marketplace support" }),
  ).toHaveAttribute("href", "mailto:support@example.com");
});
test("shop details expose the published map location and contact information", async ({
  page,
}) => {
  const id = "00000000-0000-4000-8000-000000000002";
  await page.route("**/api/shops/**", (r) =>
    r.fulfill({
      json: {
        id,
        name: "Neighbour Shop",
        description: "Local groceries",
        address: "Main Street",
        phone: "9876543210",
        email: "shop@example.com",
        latitude: 12.9784,
        longitude: 77.6408,
        delivery_radius_km: 5,
        open_time: "08:00",
        close_time: "21:00",
        status: "OPEN",
        distance: 1,
        rating: 4,
      },
    }),
  );
  await page.route("**/api/search/products?**", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/shop-reviews/**", (r) => r.fulfill({ json: [] }));
  await page.goto("/");
  await page.getByRole("button", { name: /DELIVERING TO/ }).click();
  await page.getByLabel("Location name").fill("Indiranagar");
  await page.getByLabel("Latitude", { exact: true }).fill("12.9784");
  await page.getByLabel("Longitude", { exact: true }).fill("77.6408");
  await page.getByRole("button", { name: "Set location", exact: true }).click();
  await page.goto("/shops/" + id);
  await expect(
    page.getByRole("heading", { name: "Neighbour Shop" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /View shop on map/ }),
  ).toHaveAttribute("href", /openstreetmap.org.*mlat=12.9784.*mlon=77.6408/);
  await expect(
    page.getByRole("link", { name: "shop@example.com" }),
  ).toHaveAttribute("href", "mailto:shop@example.com");
});
test("home, discovery and navigation render without overflow", async ({
  page,
  isMobile,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Good things are closer than you think.",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/home-${isMobile ? "mobile" : "desktop"}.png`,
    fullPage: true,
  });
  await page
    .getByRole("textbox", { name: "Search products or shops" })
    .fill("Tata Salt");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/search\?q=Tata\+Salt/);
  await expect(
    page.getByRole("textbox", { name: "Search", exact: true }),
  ).toHaveValue("Tata Salt");
  if (isMobile) {
    await page.getByRole("button", { name: "Toggle menu" }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page
      .getByRole("link", { name: "Shopping lists", exact: true })
      .click();
    await expect(page).toHaveURL(/\/login/);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
test("manual location rejects invalid coordinates and cart has a real empty state", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /DELIVERING TO/ }).click();
  await page.getByLabel("Location name").fill("Indiranagar");
  await page.getByLabel("Latitude", { exact: true }).fill("91");
  await page.getByLabel("Longitude", { exact: true }).fill("77.6408");
  await page.getByRole("button", { name: "Set location", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("valid coordinates");
  await page.getByLabel("Latitude", { exact: true }).fill("12.9784");
  await page.getByRole("button", { name: "Set location", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/cart");
  await expect(
    page.getByRole("heading", { name: "Your bag is waiting" }),
  ).toBeVisible();
});
test("registration validates inputs and excludes admin role", async ({
  page,
}) => {
  await page.goto("/register");
  await expect(page.getByLabel("I want to")).toHaveValue("CUSTOMER");
  await expect(page.getByLabel("I want to").locator("option")).toHaveCount(3);
  await page.getByLabel("Your name").fill("Aarav");
  await page.getByLabel("Email", { exact: true }).fill("aarav@example.test");
  await page.getByLabel("Phone", { exact: true }).fill("9876543210");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByText(/Too small|10 characters/).last()).toBeVisible();
});
