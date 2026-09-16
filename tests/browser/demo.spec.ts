import { test, expect, type BrowserContext } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
const hasDemo = existsSync(".demo-data.json");
const demo = hasDemo
  ? JSON.parse(readFileSync(".demo-data.json", "utf8"))
  : { accounts: [] };
test.beforeEach(() => test.skip(!hasDemo, "Run npm run seed:demo first."));
test("demo category artwork renders from hosted storage", async ({ page }) => {
  await page.goto("/");
  const image = page.getByRole("img", { name: "Demo Grocery", exact: true });
  await image.scrollIntoViewIfNeeded();
  const source = await image.evaluate((node) =>
    JSON.parse(getComputedStyle(node).backgroundImage.slice(4, -1)),
  );
  expect(
    await page.evaluate(
      (source) =>
        new Promise<boolean>((resolve) => {
          const asset = new Image();
          asset.onload = () => resolve(asset.naturalWidth > 0);
          asset.onerror = () => resolve(false);
          asset.src = source;
        }),
      source,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/demo-home.png", fullPage: true });
});
function id(value: string) {
  const h = createHash("sha256")
    .update(`localkart-full-demo:${value}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
async function login(ctx: BrowserContext, key: string) {
  const account = demo.accounts.find((u: { key: string }) => u.key === key);
  const response = await ctx.request.post("/api/auth/login", {
    data: { email: account.email, password: demo.password },
  });
  expect(response.status(), await response.text()).toBe(200);
  expect((await response.json()).role).toBe(account.role);
}
async function get(ctx: BrowserContext, path: string) {
  const r = await ctx.request.get("/api/" + path);
  expect(r.status(), `${path}: ${await r.text()}`).toBe(200);
  return r.json();
}
async function post(
  ctx: BrowserContext,
  path: string,
  data: unknown,
  status = 200,
) {
  const r = await ctx.request.post("/api/" + path, { data });
  expect(r.status(), `${path}: ${await r.text()}`).toBe(status);
  return r.json();
}
test("live public search, comparison and restricted shop visibility", async ({
  context,
}) => {
  const shops = await get(
    context,
    "search/shops?lat=12.9784&lng=77.6408&open_only=true",
  );
  expect(shops.map((s: { id: string }) => s.id)).toContain(id("shop0"));
  for (let n = 2; n < 8; n++)
    expect(shops.map((s: { id: string }) => s.id)).not.toContain(
      id(`shop${n}`),
    );
  const products = await get(
    context,
    "search/products?lat=12.9784&lng=77.6408&q=Tata%20Salt&unit=1%20kg&brand=Tata&sort=price",
  );
  expect(products.length).toBeGreaterThanOrEqual(2);
  expect(
    products.every((p: { unit: string }) => p.unit === "1 kg"),
  ).toBeTruthy();
  await get(context, `shops/${id("shop0")}?lat=12.9784&lng=77.6408`);
  await get(context, `products/${id("product0-0")}?lat=12.9784&lng=77.6408`);
  await get(context, `shop-reviews/${id("shop0")}`);
  expect((await context.request.get("/api/orders")).status()).toBe(401);
});
test("live customer CRUD, checkout, fulfilment, reviews, support and chat", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const customer = await browser.newContext(),
    keeper = await browser.newContext(),
    admin = await browser.newContext();
  try {
    await login(customer, "customer");
    await login(keeper, "keeper");
    await login(admin, "admin");
    const address = (await get(customer, "addresses"))[0];
    for (const path of [
      "profile",
      "lists",
      "orders",
      "reviews",
      "complaints",
      "chat",
    ])
      await get(customer, path);
    const resolved = await post(
      customer,
      `lists/${id("listcustomer")}/resolve`,
      { shop_id: id("shop0"), latitude: 12.9784, longitude: 77.6408 },
    );
    expect(resolved.products.length).toBe(3);
    expect(resolved.missing).toContain("Unmatched demo item");
    const list = await post(customer, "lists", {
      name: "Demo API audit temporary list",
    });
    const item = await post(customer, "list-items", {
      list_id: list.id,
      product_id: id("product0-0"),
      name: "Tata Salt",
      unit: "1 kg",
      quantity: 1,
    });
    await post(customer, `lists/${list.id}`, {
      name: "Demo API audit renamed list",
    });
    expect(
      (await customer.request.delete(`/api/list-items/${item.id}`)).status(),
    ).toBe(200);
    expect(
      (await customer.request.delete(`/api/lists/${list.id}`)).status(),
    ).toBe(200);
    const orderInput = {
      shop_id: id("shop0"),
      address_id: address.id,
      request_id: randomUUID(),
      notes: "Demo API audit order",
      items: [
        { product_id: id("product0-0"), quantity: 1, expected_price: 28 },
      ],
    };
    const order = await post(customer, "orders", orderInput, 201);
    expect((await post(customer, "orders", orderInput, 201)).id).toBe(order.id);
    for (const status of [
      "ACCEPTED",
      "PREPARING",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ])
      await post(keeper, `orders/${order.id}`, {
        status,
        note: "Demo audit transition",
      });
    expect((await get(customer, `orders/${order.id}`)).status).toBe(
      "DELIVERED",
    );
    await post(customer, "reviews", {
      order_id: order.id,
      shop_id: id("shop0"),
      rating: 5,
      comment: "Demo audit verified review",
    });
    const ticket = await post(customer, "complaints", {
      order_id: order.id,
      shop_id: id("shop0"),
      subject: "Demo audit support ticket",
      description: "Testing customer support resolution",
    });
    await post(admin, `complaints/${ticket.id}`, { status: "RESOLVED" });
    const room = await post(customer, "chat", { shop_id: id("shop0") });
    for (const [message_type, reference_id] of [
      ["TEXT", null],
      ["PRODUCT", id("product0-0")],
      ["PRODUCT_LIST", id("listcustomer")],
      ["ORDER", order.id],
    ])
      await post(
        customer,
        `chat/${room.id}/messages`,
        { message_type, message: "Demo audit message", reference_id },
        201,
      );
    await post(keeper, `chat/${room.id}/read`, {});
    expect(
      (await get(keeper, `chat/${room.id}/messages`)).length,
    ).toBeGreaterThan(0);
    const imagePage = await customer.newPage();
    await imagePage.goto("/");
    const png = await imagePage.screenshot();
    await imagePage.close();
    for (const [ctx, bucket] of [
      [customer, "avatars"],
      [keeper, "shop-images"],
      [keeper, "product-images"],
      [admin, "category-images"],
      [customer, "chat-images"],
    ] as const) {
      const response = await ctx.request.post("/api/upload", {
        multipart: {
          bucket,
          room: room.id,
          file: { name: "demo-audit.png", mimeType: "image/png", buffer: png },
        },
      });
      expect(response.status(), await response.text()).toBe(200);
      const image = await response.json();
      if (bucket === "chat-images")
        await post(
          customer,
          `chat/${room.id}/messages`,
          {
            message_type: "IMAGE",
            message: "Demo audit image",
            image_path: image.path,
          },
          201,
        );
      else expect((await ctx.request.get(image.url)).status()).toBe(200);
    }
    const cancelled = await post(
      customer,
      "orders",
      { ...orderInput, request_id: randomUUID() },
      201,
    );
    await post(customer, `orders/${cancelled.id}`, {
      status: "CANCELLED",
      note: "Demo audit cancellation",
    });
    expect((await get(customer, `orders/${cancelled.id}`)).status).toBe(
      "CANCELLED",
    );
  } finally {
    await customer.close();
    await keeper.close();
    await admin.close();
  }
});
test("live role screens, reports, access controls and logout", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const routes = {
    customer: [
      "/profile",
      "/addresses",
      "/shopping-lists",
      "/cart",
      "/checkout",
      "/orders",
      "/reviews",
      "/complaints",
      "/chat",
    ],
    keeper: [
      "/shopkeeper",
      "/shopkeeper/shop",
      "/shopkeeper/products",
      "/shopkeeper/inventory",
      "/shopkeeper/orders",
      "/shopkeeper/reviews",
      "/shopkeeper/chat",
      "/shopkeeper/settings",
    ],
    admin: [
      "/admin",
      "/admin/shops",
      "/admin/products",
      "/admin/categories",
      "/admin/users",
      "/admin/reviews",
      "/admin/complaints",
      "/admin/settings",
      "/admin/reports",
    ],
  };
  for (const [key, paths] of Object.entries(routes)) {
    const ctx = await browser.newContext();
    try {
      await login(ctx, key);
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("response", (response) => {
        if (response.url().includes("/api/") && response.status() >= 400)
          errors.push(
            `${response.status()} ${new URL(response.url()).pathname}`,
          );
      });
      for (const path of paths) {
        await page.goto(path);
        await expect(page.locator("h1").first()).toBeVisible();
        expect(new URL(page.url()).pathname).toBe(path);
        await page.waitForTimeout(250);
      }
      await page.screenshot({
        path: `test-results/demo-${key}.png`,
        fullPage: true,
      });
      expect(errors).toEqual([]);
      if (key === "customer")
        expect((await ctx.request.get("/api/manage/users")).status()).toBe(403);
      if (key !== "customer") {
        for (const p of ["stats", "manage/shops", "manage/products"])
          await get(ctx, p);
      }
      if (key === "admin") {
        for (const p of [
          "manage/categories",
          "manage/users",
          "manage/audit_logs",
          "reports?days=30",
        ])
          await get(ctx, p);
      }
      await post(ctx, "auth/logout", {});
      expect((await ctx.request.get("/api/profile")).status()).toBe(401);
    } finally {
      await ctx.close();
    }
  }
});
test("suspended-account login returns a clear forbidden response", async ({
  browser,
}) => {
  const suspended = await browser.newContext();
  try {
    const account = demo.accounts.find(
      (u: { key: string }) => u.key === "suspended",
    );
    expect(
      (
        await suspended.request.post("/api/auth/login", {
          data: { email: account.email, password: demo.password },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await suspended.close();
  }
});
test("live browser cart checkout and two-participant chat", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const customer = await browser.newContext(),
    keeper = await browser.newContext();
  try {
    await login(customer, "customer");
    await login(keeper, "keeper");
    await customer.addInitScript(
      ({ owner }) => {
        if (!localStorage.getItem("localkart"))
          localStorage.setItem(
            "localkart",
            JSON.stringify({
              state: {
                owner,
                location: {
                  label: "Indiranagar",
                  latitude: 12.9784,
                  longitude: 77.6408,
                },
                items: [],
                shopId: null,
                shopName: "",
              },
              version: 0,
            }),
          );
      },
      { owner: id("customer") },
    );
    const buyer = await customer.newPage();
    await buyer.goto(`/products/${id("product0-0")}`);
    await buyer
      .getByRole("button", { name: "Add to cart", exact: true })
      .click();
    await buyer.goto("/cart");
    await buyer
      .getByRole("button", { name: "Add one Tata Salt", exact: true })
      .click();
    await expect(buyer.locator(".qty span")).toHaveText("2");
    await buyer.reload();
    await expect(buyer.locator(".qty span")).toHaveText("2");
    await buyer
      .getByRole("button", { name: "Remove one Tata Salt", exact: true })
      .click();
    await buyer
      .getByRole("button", { name: "Remove one Tata Salt", exact: true })
      .click();
    await expect(
      buyer.getByText("Your bag is waiting", { exact: true }),
    ).toBeVisible();
    await buyer.goto(`/products/${id("product0-0")}`);
    await buyer
      .getByRole("button", { name: "Add to cart", exact: true })
      .click();
    await buyer.goto("/cart");
    await expect(
      buyer.getByText("Tata Salt", { exact: true }).first(),
    ).toBeVisible();
    await buyer.getByRole("link", { name: "Continue to checkout" }).click();
    await buyer
      .getByRole("button", { name: "Place order", exact: true })
      .click();
    await expect(buyer).toHaveURL(/\/orders\/[0-9a-f-]+$/);
    const room = await post(customer, "chat", { shop_id: id("shop0") });
    const seller = await keeper.newPage();
    seller.on("websocket", (socket) =>
      socket.on("framereceived", (frame) => {
        try {
          const raw = JSON.parse(String(frame.payload));
          const data = Array.isArray(raw)
            ? { event: raw[3], payload: raw[4] }
            : raw;
          if (data.event === "system")
            console.log("Realtime system:", JSON.stringify(data.payload));
          if (data.event === "postgres_changes")
            console.log("Realtime change received");
        } catch {
          /* Binary protocol frames are not logged. */
        }
      }),
    );
    await buyer.goto(`/chat?room=${room.id}`);
    await seller.goto(`/shopkeeper/chat?room=${room.id}`);
    await expect(buyer.getByText("Live chat", { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(seller.getByText("Live chat", { exact: true })).toBeVisible({
      timeout: 15000,
    });
    const sharedImage = seller
      .getByRole("img", { name: "Shared by a chat participant" })
      .last();
    await expect(sharedImage).toBeVisible();
    await expect
      .poll(() =>
        sharedImage.evaluate(
          (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
        ),
      )
      .toBe(true);
    const message = `Demo realtime check ${randomUUID()}`;
    await buyer.getByLabel("Message", { exact: true }).fill(message);
    await buyer.getByRole("button", { name: "Send message" }).click();
    await expect(buyer.getByText(message, { exact: true })).toBeVisible();
    expect(
      (await get(keeper, `chat/${room.id}/messages`)).some(
        (m: { message: string }) => m.message === message,
      ),
    ).toBeTruthy();
    const deliveryStart = Date.now();
    try {
      await expect(seller.getByText(message, { exact: true })).toBeVisible({
        timeout: 10000,
      });
    } catch {
      await expect(seller.getByText(message, { exact: true })).toBeVisible({
        timeout: 20000,
      });
      console.log(
        `Chat polling fallback delivered after ${Date.now() - deliveryStart} ms; instant delivery check failed.`,
      );
      await seller.screenshot({
        path: "test-results/demo-chat-polling-fallback.png",
        fullPage: true,
      });
      throw new Error(
        "Realtime delivery exceeded 10 seconds; polling fallback eventually delivered the persisted message.",
      );
    }
    await buyer.screenshot({
      path: "test-results/demo-live-chat.png",
      fullPage: true,
    });
    const savedMessages = await get(customer, `chat/${room.id}/messages`);
    const imageMessage = savedMessages.find(
      (m: { message_type: string; sender_id: string }) =>
        m.message_type === "IMAGE" && m.sender_id === id("customer"),
    );
    const orders = await get(customer, "orders");
    for (const [kind, reference, imagePath] of [
      ["PRODUCT", id("product0-0"), undefined],
      ["PRODUCT_LIST", id("listcustomer"), undefined],
      ["ORDER", orders[0].id, undefined],
      ["IMAGE", undefined, imageMessage.payload.path],
    ]) {
      const marker = `Realtime ${kind} ${randomUUID()}`;
      await post(
        customer,
        `chat/${room.id}/messages`,
        {
          message_type: kind,
          message: marker,
          reference_id: reference,
          image_path: imagePath,
        },
        201,
      );
      await expect(seller.getByText(marker, { exact: true })).toBeVisible({
        timeout: 5000,
      });
    }
    await seller.reload();
    await expect(seller.getByText("Live chat", { exact: true })).toBeVisible();
    const reply = `Reconnected seller ${randomUUID()}`;
    await seller.getByLabel("Message", { exact: true }).fill(reply);
    await seller.getByRole("button", { name: "Send message" }).click();
    await expect(buyer.getByText(reply, { exact: true })).toBeVisible({
      timeout: 5000,
    });
  } finally {
    await customer.close();
    await keeper.close();
  }
});
test("live profile, address and management CRUD", async ({ browser }) => {
  test.setTimeout(120000);
  const customer = await browser.newContext(),
    keeper = await browser.newContext(),
    admin = await browser.newContext();
  try {
    await login(customer, "customer");
    await login(keeper, "keeper");
    await login(admin, "admin");
    const profile = await get(customer, "profile");
    await post(customer, "profile", {
      name: profile.name,
      phone: profile.phone,
      avatar_url: profile.avatar_url,
    });
    const address = await post(customer, "addresses", {
      label: "Demo audit temporary address",
      full_address: "Demo audit Main Road",
      latitude: 12.9784,
      longitude: 77.6408,
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560038",
      is_default: false,
    });
    expect(
      (await customer.request.delete(`/api/addresses/${address.id}`)).status(),
    ).toBe(200);
    const suffix = randomUUID().slice(0, 8);
    const category = await post(admin, "manage/categories", {
      name: `Demo Audit Category ${suffix}`,
      description: "Demo CRUD test",
      parent_id: null,
      image_url: null,
    });
    await post(admin, `manage/categories/${category.id}`, {
      name: `Demo Audit Renamed ${suffix}`,
      description: "Demo category edit",
      parent_id: null,
      image_url: null,
    });
    expect(
      (
        await admin.request.delete(`/api/manage/categories/${category.id}`)
      ).status(),
    ).toBe(200);
    const product = {
      shop_id: id("shop0"),
      category_id: id("cat0"),
      name: `Demo Audit Product ${suffix}`,
      description: "Demo product CRUD",
      brand: "Demo",
      unit: "1 item",
      price: 35,
      stock_quantity: 10,
      is_active: true,
      image_url: null,
    };
    const created = await post(keeper, "manage/products", product);
    await post(keeper, `manage/products/${created.id}`, {
      ...product,
      price: 36,
      stock_quantity: 9,
    });
    expect(
      (
        await keeper.request.delete(`/api/manage/products/${created.id}`)
      ).status(),
    ).toBe(200);
    const shop = {
      category_id: id("cat0"),
      name: `Demo Audit Shop ${suffix}`,
      description: "Demo shop CRUD",
      address: "Demo 12 Main Road, Indiranagar",
      latitude: 12.9784,
      longitude: 77.6408,
      delivery_radius_km: 5,
      open_time: "08:00",
      close_time: "21:00",
      status: "OPEN",
      phone: "9600000099",
      email: "demo.shopkeeper@localkart.test",
      logo_url: null,
    };
    const createdShop = await post(keeper, "manage/shops", shop);
    for (const approval_status of [
      "REJECTED",
      "SUSPENDED",
      "PENDING",
      "APPROVED",
    ]) {
      const changed = await post(admin, `manage/shops/${createdShop.id}`, {
        approval_status,
      });
      expect(changed.approval_status).toBe(approval_status);
    }
    await post(keeper, `manage/shops/${createdShop.id}`, {
      ...shop,
      status: "CLOSED",
    });
    const page = await keeper.newPage();
    await page.goto("/shopkeeper/shop");
    await expect(page.getByText(shop.name, { exact: true })).toBeVisible();
  } finally {
    await customer.close();
    await keeper.close();
    await admin.close();
  }
});

test("admin settings, user suspension and audit trail persist", async ({
  browser,
}) => {
  const admin = await browser.newContext(),
    customer = await browser.newContext();
  let settings: Record<string, unknown> | undefined;
  try {
    await login(admin, "admin");
    await login(customer, "customer2");
    settings = await get(admin, "platform-settings");
    const marker = `Demo audit announcement ${randomUUID()}`;
    await post(admin, "platform-settings", {
      ...settings,
      announcement: marker,
    });
    expect((await get(customer, "platform-settings")).announcement).toBe(
      marker,
    );
    await post(admin, `manage/users/${id("customer2")}`, {
      status: "SUSPENDED",
    });
    expect((await customer.request.get("/api/profile")).status()).toBe(403);
    await post(admin, `manage/users/${id("customer2")}`, { status: "ACTIVE" });
    expect((await get(customer, "profile")).status).toBe("ACTIVE");
    expect(
      (
        await admin.request.post(`/api/manage/users/${id("admin")}`, {
          data: { status: "SUSPENDED" },
        })
      ).status(),
    ).toBe(400);
    const logs = await get(admin, "manage/audit_logs");
    expect(
      logs.some(
        (l: { resource: string; actor_id: string }) =>
          l.resource === "users" && l.actor_id === id("admin"),
      ),
    ).toBe(true);
  } finally {
    await post(admin, `manage/users/${id("customer2")}`, { status: "ACTIVE" });
    if (settings) await post(admin, "platform-settings", settings);
    await admin.close();
    await customer.close();
  }
});

test("mock browser geolocation drives real nearby catalogue requests", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 12.9784, longitude: 77.6408 });
  await page.goto("/");
  await page.getByRole("button", { name: /DELIVERING TO/ }).click();
  await page.getByRole("button", { name: "Use my current location" }).click();
  await expect(
    page.getByRole("button", { name: /DELIVERING TO/ }),
  ).toContainText("Current location");
  await page.goto("/shops");
  await expect(
    page.getByText("Demo Neighbour Store", { exact: true }),
  ).toBeVisible();
});
