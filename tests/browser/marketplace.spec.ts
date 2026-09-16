import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
  secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const allowed =
  !!(url && key && secret) &&
  (/^http:\/\/(127\.0\.0\.1|localhost):/.test(url) ||
    process.env.RUN_REMOTE_TESTS === "true");
test("registration, comparison, list sharing, live chat, order, delivery and review", async ({
  browser,
}) => {
  test.skip(
    !allowed,
    "Needs an installed development Supabase schema and server-only test service key. Remote tests also require RUN_REMOTE_TESTS=true.",
  );
  test.setTimeout(180000);
  const db = createClient(url, secret, { auth: { persistSession: false } }),
    suffix = randomUUID().slice(0, 8),
    password = "Kirana" + randomUUID() + "42",
    shopName = "Sharma General Store " + suffix;
  const kc = await browser.newContext({ baseURL: "http://localhost:3100" }),
    cc = await browser.newContext({
      baseURL: "http://localhost:3100",
      geolocation: { latitude: 12.9784, longitude: 77.6408 },
      permissions: ["geolocation"],
    });
  const keeper = await kc.newPage(),
    customer = await cc.newPage();
  const ids: string[] = [];
  let category = "",
    madeCategory = false;
  async function register(page: Page, role: "CUSTOMER" | "SHOPKEEPER") {
    const email = role.toLowerCase() + "-" + suffix + "@example.com";
    await page.goto("/register");
    for (const [label, value] of [
      ["Your name", role === "CUSTOMER" ? "Aarav Rao" : "Ramesh Sharma"],
      ["Email", email],
      [
        "Phone",
        "9" +
          parseInt(suffix, 16).toString().padStart(10, "0") +
          (role === "CUSTOMER" ? "1" : "2"),
      ],
      ["Password", password],
    ])
      await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByLabel("I want to").selectOption(role);
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page).toHaveURL(/\/login/);
    const users = await db.auth.admin.listUsers({ perPage: 1000 });
    expect(users.error).toBeNull();
    const user = users.data.users.find((x) => x.email === email)!;
    expect(user).toBeDefined();
    ids.push(user.id);
    expect(
      (await db.auth.admin.updateUserById(user.id, { email_confirm: true }))
        .error,
    ).toBeNull();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(
      role === "SHOPKEEPER" ? /\/shopkeeper$/ : /\/$/,
    );
    return user.id;
  }
  async function fill(
    page: Page,
    fields: [string, string][],
    button = "Save changes",
  ) {
    for (const [label, value] of fields)
      await page
        .getByRole("dialog")
        .getByLabel(label, { exact: false })
        .fill(value);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: button, exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
  try {
    const cats = await db.from("categories").select("id").limit(1);
    expect(cats.error).toBeNull();
    category = cats.data?.[0]?.id || randomUUID();
    if (!cats.data?.length) {
      madeCategory = true;
      expect(
        (
          await db
            .from("categories")
            .insert({ id: category, name: "Grocery " + suffix })
        ).error,
      ).toBeNull();
    }
    const owner = await register(keeper, "SHOPKEEPER");
    await keeper.goto("/shopkeeper/shop");
    await keeper.getByRole("button", { name: "Add shop", exact: true }).click();
    await keeper
      .getByRole("dialog")
      .getByLabel("Category", { exact: true })
      .selectOption(category);
    await fill(keeper, [
      ["Shop name", shopName],
      ["Shop address", "12 Main Road, Indiranagar"],
      ["Latitude", "12.9784"],
      ["Longitude", "77.6408"],
    ]);
    const s = await db
      .from("shops")
      .select("id")
      .eq("owner_id", owner)
      .eq("name", shopName)
      .single();
    expect(s.error).toBeNull();
    expect(
      (
        await db
          .from("shops")
          .update({ approval_status: "APPROVED" })
          .eq("id", s.data!.id)
      ).error,
    ).toBeNull();
    await keeper.goto("/shopkeeper/products");
    for (const [name, price, unit] of [
      ["Tata Salt", "28", "1 kg"],
      ["Milk", "55", "1 L"],
    ]) {
      await keeper
        .getByRole("button", { name: "Add product", exact: true })
        .click();
      await keeper
        .getByRole("dialog")
        .getByLabel("Category", { exact: true })
        .selectOption(category);
      await fill(keeper, [
        ["Product name", name],
        ["Unit", unit],
        ["Price", price],
        ["Available stock", "50"],
      ]);
    }
    const other = randomUUID();
    expect(
      (
        await db.from("shops").insert({
          id: other,
          owner_id: owner,
          category_id: category,
          name: "Other Store " + suffix,
          address: "Second Road",
          latitude: 12.9824,
          longitude: 77.6408,
          delivery_radius_km: 5,
          approval_status: "APPROVED",
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await db.from("products").insert({
          shop_id: other,
          category_id: category,
          name: "Tata Salt",
          unit: "1 kg",
          price: 30,
          stock_quantity: 50,
        })
      ).error,
    ).toBeNull();
    await register(customer, "CUSTOMER");
    await customer.getByRole("button", { name: /DELIVERING TO/ }).click();
    await customer
      .getByRole("button", { name: "Use my current location" })
      .click();
    await expect(customer.getByRole("dialog")).not.toBeVisible();
    await customer.goto("/compare?q=Tata%20Salt");
    await expect(
      customer.getByRole("link", { name: shopName, exact: true }).first(),
    ).toBeVisible();
    await expect(
      customer
        .getByRole("link", { name: "Other Store " + suffix, exact: true })
        .first(),
    ).toBeVisible();
    await customer
      .getByRole("link", { name: shopName, exact: true })
      .first()
      .click();
    for (const name of ["Tata Salt", "Milk"])
      await customer
        .locator(".product-card")
        .filter({ has: customer.getByRole("heading", { name, exact: true }) })
        .getByRole("button", { name: "Add to cart", exact: true })
        .click();
    await customer.goto("/addresses");
    await customer
      .getByRole("button", { name: "Add address", exact: true })
      .click();
    await fill(customer, [
      ["Full address", "24 12th Cross, Indiranagar"],
      ["City", "Bengaluru"],
      ["State", "Karnataka"],
      ["PIN code", "560038"],
    ]);
    await customer.goto("/shopping-lists");
    await customer.getByRole("button", { name: "New list" }).click();
    await fill(customer, [["List name", "Weekly essentials " + suffix]]);
    for (const [name, quantity, unit] of [
      ["Tata Salt", "1", "1 kg"],
      ["Milk", "2", "1 L"],
    ]) {
      await customer
        .getByRole("button", { name: "Add item", exact: true })
        .click();
      await fill(customer, [
        ["Product name", name],
        ["Quantity", quantity],
        ["Unit", unit],
      ]);
    }
    await customer.getByRole("button", { name: "Send to shop" }).click();
    await customer
      .getByRole("dialog")
      .getByRole("button", { name: new RegExp(shopName) })
      .click();
    await expect(customer).toHaveURL(/\/chat\?room=/);
    const room = new URL(customer.url()).searchParams.get("room")!;
    await keeper.goto("/shopkeeper/chat?room=" + room);
    await expect(
      keeper.getByText("Weekly essentials " + suffix, { exact: true }),
    ).toBeVisible();
    await keeper
      .getByRole("textbox", { name: "Message", exact: true })
      .fill("Everything is available!");
    await keeper.getByRole("button", { name: "Send message" }).click();
    await expect(
      customer.getByText("Everything is available!", { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await customer.goto("/shopping-lists");
    await customer.getByRole("button", { name: "Convert to cart" }).click();
    await customer
      .getByRole("dialog")
      .getByRole("button", { name: new RegExp(shopName) })
      .click();
    await customer
      .getByRole("button", { name: "Replace cart", exact: true })
      .click();
    await expect(customer).toHaveURL(/\/cart$/);
    await customer.getByRole("link", { name: "Continue to checkout" }).click();
    await customer
      .getByRole("button", { name: "Place order", exact: true })
      .click();
    await expect(customer).toHaveURL(/\/orders\/[0-9a-f-]+/);
    await keeper.goto("/orders/" + customer.url().split("/").at(-1));
    for (const status of [
      "Accepted",
      "Preparing",
      "Out for delivery",
      "Delivered",
    ]) {
      await keeper.getByRole("button", { name: status, exact: true }).click();
      await expect(
        keeper.getByRole("heading", { name: status, exact: true }),
      ).toBeVisible();
    }
    await expect(
      customer.getByRole("heading", { name: "Delivered", exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await customer.getByRole("button", { name: "Leave a review" }).click();
    await fill(customer, [
      ["Your review", "Friendly service and everything arrived fresh."],
    ]);
    await expect(
      customer.getByText("Thanks for reviewing this order."),
    ).toBeVisible();
  } finally {
    // Only this test's unique users and their dependent records are removed.
    if (ids.length) {
      const own = await db.from("shops").select("id").in("owner_id", ids),
        shops = (own.data || []).map((x) => x.id);
      for (const [table, col] of [
        ["complaints", "user_id"],
        ["reviews", "customer_id"],
        ["chat_rooms", "customer_id"],
        ["shopping_lists", "user_id"],
        ["orders", "customer_id"],
        ["addresses", "user_id"],
      ])
        await db.from(table).delete().in(col, ids);
      if (shops.length) {
        await db.from("products").delete().in("shop_id", shops);
        await db.from("shops").delete().in("id", shops);
      }
      for (const id of ids) await db.auth.admin.deleteUser(id);
    }
    if (madeCategory) await db.from("categories").delete().eq("id", category);
    await kc.close();
    await cc.close();
  }
});
