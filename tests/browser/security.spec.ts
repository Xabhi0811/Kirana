import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
process.loadEnvFile(".env.local");
const demo = JSON.parse(readFileSync(".demo-data.json", "utf8"));
function id(key: string) {
  const h = createHash("sha256")
    .update(`localkart-full-demo:${key}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
async function direct(key: string) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await client.auth.signInWithPassword({
    email: demo.accounts.find((a: { key: string }) => a.key === key).email,
    password: demo.password,
  });
  expect(error).toBeNull();
  return client;
}
test("direct RLS: customer cannot read another customer's private entities", async () => {
  const db = await direct("customer2");
  try {
    for (const [table, column] of [
      ["users", "id"],
      ["addresses", "user_id"],
      ["shopping_lists", "user_id"],
      ["orders", "customer_id"],
      ["complaints", "user_id"],
      ["chat_rooms", "customer_id"],
    ]) {
      const result = await db
        .from(table)
        .select("*")
        .eq(column, id("customer"));
      expect(result.error, table).toBeNull();
      expect(result.data, table).toEqual([]);
    }
    const lists = await db
      .from("shopping_list_items")
      .select("*")
      .eq("list_id", id("listcustomer"));
    expect(lists.data).toEqual([]);
    const forged = await db
      .from("users")
      .update({ role: "ADMIN" })
      .eq("id", id("customer2"))
      .select();
    expect(forged.error).not.toBeNull();
    const status = await db.rpc("my_account_status");
    expect(status.data).toBe("ACTIVE");
  } finally {
    await db.auth.signOut();
  }
});
test("direct RLS: ownership forgery, shop approval and cross-shop edits are denied", async () => {
  const db = await direct("keeper2");
  try {
    const edit = await db
      .from("products")
      .update({ price: 0 })
      .eq("id", id("product0-0"))
      .select();
    expect(edit.error).toBeNull();
    expect(edit.data).toEqual([]);
    const approve = await db
      .from("shops")
      .update({ approval_status: "APPROVED" })
      .eq("id", id("shop3"))
      .select();
    expect(approve.error).not.toBeNull();
    const forged = await db.from("shops").insert({
      owner_id: id("keeper"),
      category_id: id("cat0"),
      name: "Forbidden audit shop",
      address: "Audit road",
      latitude: 12.97,
      longitude: 77.64,
    });
    expect(forged.error).not.toBeNull();
    const tables = await db.from("audit_logs").select("id");
    expect(tables.data).toEqual([]);
  } finally {
    await db.auth.signOut();
  }
});
test("direct RLS: private chat messages and signed images are participant-only", async () => {
  const owner = await direct("customer"),
    stranger = await direct("customer2"),
    admin = await direct("admin");
  try {
    const rooms = await owner.rpc("chat_summaries");
    const room = rooms.data[0].id;
    const images = await owner
      .from("chat_messages")
      .select("payload")
      .eq("chat_room_id", room)
      .eq("message_type", "IMAGE")
      .limit(1);
    expect(images.data?.length).toBe(1);
    for (const db of [stranger, admin]) {
      expect(
        (await db.from("chat_messages").select("*").eq("chat_room_id", room))
          .data,
      ).toEqual([]);
      expect(
        (
          await db.rpc("send_message", {
            room,
            kind: "TEXT",
            text_content: "Forbidden",
          })
        ).error,
      ).not.toBeNull();
      expect(
        (
          await db.storage
            .from("chat-images")
            .createSignedUrl(images.data![0].payload.path, 60)
        ).error,
      ).not.toBeNull();
    }
  } finally {
    await Promise.all([owner, stranger, admin].map((c) => c.auth.signOut()));
  }
});
test("API rejects invalid authentication, methods, origin and malformed input", async ({
  request,
}) => {
  expect(
    (
      await request.post("/api/auth/login", {
        data: { email: demo.accounts[0].email, password: "WrongPassword123!" },
      })
    ).status(),
  ).toBe(401);
  expect((await request.delete("/api/auth/login", { data: {} })).status()).toBe(
    405,
  );
  expect(
    (
      await request.post("/api/auth/login", {
        headers: { origin: "https://untrusted.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/auth/login", {
        data: "{",
        headers: { "content-type": "application/json" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/auth/register", {
        data: { name: "Test", email: "bad", password: "weak", role: "ADMIN" },
      })
    ).status(),
  ).toBe(400);
  for (const path of [
    "search/shops?lat=91&lng=77",
    "search/products?lat=12&lng=181",
    "search/shops?page=-1",
    "products/not-a-uuid?lat=12&lng=77",
  ])
    expect((await request.get("/api/" + path)).status(), path).toBe(400);
  for (const path of ["orders", "profile", "addresses", "chat", "manage/users"])
    expect((await request.get("/api/" + path)).status(), path).toBe(401);
});
test("API rejects invalid cart, upload signatures/size/bucket and forbidden management", async ({
  request,
}) => {
  const account = demo.accounts.find(
    (a: { key: string }) => a.key === "customer",
  );
  expect(
    (
      await request.post("/api/auth/login", {
        data: { email: account.email, password: demo.password },
      })
    ).status(),
  ).toBe(200);
  for (const path of ["manage/users", "manage/categories", "reports", "stats"])
    expect((await request.get("/api/" + path)).status(), path).toBe(403);
  const addresses = await (await request.get("/api/addresses")).json();
  const base = {
    notes: "",
    shop_id: id("shop0"),
    address_id: addresses[0].id,
    request_id: randomUUID(),
    items: [{ product_id: id("product0-0"), quantity: 1, expected_price: 0 }],
  };
  expect((await request.post("/api/orders", { data: base })).status()).toBe(
    400,
  );
  expect(
    (
      await request.post("/api/orders", { data: { ...base, items: [] } })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/orders", {
        data: { ...base, items: [{ ...base.items[0], quantity: -1 }] },
      })
    ).status(),
  ).toBe(400);
  for (const [bucket, buffer, status] of [
    ["avatars", Buffer.from("not really an image"), 400],
    ["avatars", Buffer.alloc(4 * 1024 * 1024 + 1), 413],
    ["category-images", Buffer.from("not really an image"), 403],
  ] as const) {
    const result = await request.post("/api/upload", {
      multipart: {
        bucket,
        file: { name: "audit.png", mimeType: "image/png", buffer },
      },
    });
    expect(result.status(), await result.text()).toBe(status);
  }
  expect((await request.post("/api/auth/logout", { data: {} })).status()).toBe(
    200,
  );
  expect((await request.get("/api/profile")).status()).toBe(401);
});
test("direct Auth refresh preserves identity and rejects a forged token", async () => {
  const db = await direct("customer");
  try {
    const refreshed = await db.auth.refreshSession();
    expect(refreshed.error).toBeNull();
    expect(refreshed.data.user?.id).toBe(id("customer"));
    expect(
      (await db.auth.getUser("invalid.expired.token")).error,
    ).not.toBeNull();
  } finally {
    await db.auth.signOut();
  }
});

test("two simultaneous buyers cannot oversell the last unit", async () => {
  const keeper = await direct("keeper"),
    customers = await Promise.all([direct("customer"), direct("customer2")]);
  let productId: string | undefined;
  try {
    const product = await keeper
      .from("products")
      .insert({
        shop_id: id("shop0"),
        category_id: id("cat0"),
        name: `Demo concurrency ${randomUUID()}`,
        unit: "1 pack",
        price: 10,
        stock_quantity: 1,
      })
      .select()
      .single();
    expect(product.error).toBeNull();
    productId = product.data.id;
    const results = await Promise.all(
      customers.map(async (db) => {
        const addresses = await db
          .from("addresses")
          .select("id")
          .eq("is_default", true)
          .single();
        return db.rpc("place_order", {
          shop: id("shop0"),
          address: addresses.data!.id,
          items: [{ product_id: productId, quantity: 1, expected_price: 10 }],
          request_id: randomUUID(),
        });
      }),
    );
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.filter((r) => r.error)).toHaveLength(1);
    expect(
      (
        await keeper
          .from("products")
          .select("stock_quantity")
          .eq("id", productId!)
          .single()
      ).data?.stock_quantity,
    ).toBe(0);
    const successful = results.find((r) => !r.error)!;
    expect(
      (
        await keeper.rpc("transition_order", {
          target: successful.data,
          next_status: "CANCELLED",
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await keeper
          .from("products")
          .select("stock_quantity")
          .eq("id", productId!)
          .single()
      ).data?.stock_quantity,
    ).toBe(1);
  } finally {
    if (productId)
      await keeper
        .from("products")
        .update({ is_active: false })
        .eq("id", productId);
    await Promise.all([keeper, ...customers].map((c) => c.auth.signOut()));
  }
});

test("JPEG upload decodes, corrupt PNG is rejected, and private signed URLs expire", async ({
  request,
}) => {
  const account = demo.accounts.find(
    (a: { key: string }) => a.key === "customer",
  );
  await request.post("/api/auth/login", {
    data: { email: account.email, password: demo.password },
  });
  const jpeg = await sharp({
    create: { width: 24, height: 24, channels: 3, background: "#1d7456" },
  })
    .jpeg()
    .toBuffer();
  const response = await request.post("/api/upload", {
    multipart: {
      bucket: "avatars",
      file: { name: "audit.jpg", mimeType: "image/jpeg", buffer: jpeg },
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  const uploaded = await response.json();
  expect((await request.get(uploaded.url)).status()).toBe(200);
  const corrupt = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  expect(
    (
      await request.post("/api/upload", {
        multipart: {
          bucket: "avatars",
          file: { name: "broken.png", mimeType: "image/png", buffer: corrupt },
        },
      })
    ).status(),
  ).toBe(400);
  const db = await direct("customer");
  try {
    const images = await db
      .from("chat_messages")
      .select("payload")
      .eq("sender_id", id("customer"))
      .eq("message_type", "IMAGE")
      .limit(1);
    const signed = await db.storage
      .from("chat-images")
      .createSignedUrl(images.data![0].payload.path, 5);
    expect(signed.error).toBeNull();
    expect((await request.get(signed.data!.signedUrl)).status()).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 6000));
    const expired = await request.get(
      signed.data!.signedUrl + "&audit=" + randomUUID(),
      { headers: { "cache-control": "no-cache" } },
    );
    expect(expired.ok()).toBe(false);
  } finally {
    expect(
      (await db.storage.from("avatars").remove([uploaded.path])).error,
    ).toBeNull();
    await db.auth.signOut();
  }
});
