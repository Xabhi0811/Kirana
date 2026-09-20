import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI can supply environment directly. */
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_PASSWORD;
if (!url || !key || !service || !password || password.length < 10)
  throw new Error(
    "Set Supabase URL, public key, server-only service-role key and a SEED_PASSWORD of at least 10 characters.",
  );
if (
  !/^http:\/\/(localhost|127\.0\.0\.1):/.test(url) &&
  !process.argv.includes("--allow-remote")
)
  throw new Error(
    "Remote development seeding requires: npm run seed -- --allow-remote. Do not seed a production project.",
  );
const db = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});
function uid(name: string) {
  const bytes = createHash("sha256")
    .update("localkart-dev:" + name)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function check<T extends { data: unknown; error: { message: string } | null }>(
  result: T,
): NonNullable<T["data"]> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("Expected data was not returned.");
  return result.data as NonNullable<T["data"]>;
}
const names = [
  "Sharma General Store",
  "Namma Fresh Mart",
  "Gupta Provision Store",
  "Verma Supermarket",
  "Green Basket",
  "Corner Dairy",
  "Daily Needs",
  "The Local Pantry",
  "Fresh & Friendly",
  "Neighbourhood Mart",
];
const categoryNames = [
  "Grocery",
  "Dairy",
  "Bakery",
  "Stationery",
  "Flowers",
  "Household",
  "Personal care",
  "Snacks",
];
const catalog = [
  ["Tata Salt", "Tata", "1 kg", 28, 0],
  ["Milk", "Nandini", "1 L", 55, 1],
  ["Brown Bread", "Britannia", "400 g", 45, 2],
  ["Sugar", "Local", "1 kg", 42, 0],
  ["Aashirvaad Atta", "Aashirvaad", "5 kg", 260, 0],
  ["Notebook", "Classmate", "1 item", 60, 3],
] as const;
let demoPhoneSequence = 0;
async function user(email: string, name: string, role: string) {
  const phone = "98000000" + String(++demoPhoneSequence).padStart(2, "0");
  const existing = check(
    await db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ).users.find((x) => x.email === email);
  let id = existing?.id;
  if (!id) {
    const data = check(
      await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
          phone,
          role: role === "ADMIN" ? "CUSTOMER" : role,
        },
      }),
    );
    id = data.user!.id;
  }
  check(await db.from("users").update({ role, phone }).eq("id", id));
  const client = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  check(await client.auth.signInWithPassword({ email, password: password! }));
  return { id, client };
}
async function main() {
  const keepers: Awaited<ReturnType<typeof user>>[] = [];
  for (let i = 0; i < 5; i++)
    keepers.push(
      await user(
        `shopkeeper${i + 1}@localkart.test`,
        [
          "Ramesh Sharma",
          "Kavya Rao",
          "Suresh Gupta",
          "Anil Verma",
          "Meera Nair",
        ][i],
        "SHOPKEEPER",
      ),
    );
  const customers = [
    await user("aarav@localkart.test", "Aarav Rao", "CUSTOMER"),
    await user("isha@localkart.test", "Isha Patel", "CUSTOMER"),
  ];
  await user("admin@localkart.test", "Marketplace Admin", "ADMIN");
  check(
    await db.from("categories").upsert(
      categoryNames.map((name, i) => ({
        id: uid("category-" + i),
        name,
        description: "Local " + name.toLowerCase(),
        parent_id: i === 1 || i === 7 ? uid("category-0") : null,
      })),
    ),
  );
  check(
    await db.from("shops").upsert(
      names.map((name, i) => ({
        id: uid("shop-" + i),
        owner_id: keepers[i % 5].id,
        category_id: uid("category-0"),
        name,
        description: [
          "Everyday essentials from your trusted neighbourhood shop.",
          "Fresh produce, dairy and a friendly face.",
          "Your favourite groceries, all in one place.",
        ][i % 3],
        address: `${12 + i} Main Road, Indiranagar, Bengaluru`,
        latitude: 12.9784 + i * 0.003,
        longitude: 77.6408 + i * 0.001,
        delivery_radius_km: i === 9 ? 1 : 5,
        open_time: "08:00",
        close_time: "21:00",
        status: i === 7 ? "CLOSED" : "OPEN",
        approval_status: i === 8 ? "PENDING" : "APPROVED",
        phone: "9876543210",
      })),
    ),
  );
  check(
    await db.from("products").upsert(
      names.flatMap((_, i) =>
        catalog.map(([name, brand, unit, price, cat], j) => ({
          id: uid(`product-${i}-${j}`),
          shop_id: uid("shop-" + i),
          category_id: uid("category-" + cat),
          name,
          brand,
          unit,
          description: `${name} ${unit}, available at your neighbourhood shop.`,
          price: price + (i === 2 ? -1 : i % 4),
          stock_quantity: i === 3 && j === 0 ? 0 : 50 + i * 3,
          is_active: true,
        })),
      ),
    ),
  );
  for (const [ci, c] of customers.entries()) {
    const existing = check(
      await c.client.from("addresses").select("id").eq("label", "Home"),
    ).at(0);
    const address = check(
      await c.client.rpc("save_address", {
        target: existing?.id || null,
        input: {
          label: "Home",
          full_address: `${24 + ci} 12th Cross, Indiranagar`,
          latitude: 12.9784,
          longitude: 77.6408,
          city: "Bengaluru",
          state: "Karnataka",
          pincode: "560038",
          is_default: true,
        },
      }),
    );
    const listId = uid("list-" + ci);
    check(
      await db.from("shopping_lists").upsert({
        id: listId,
        user_id: c.id,
        name: ci ? "Sunday breakfast" : "Monthly essentials",
      }),
    );
    check(
      await db.from("shopping_list_items").upsert(
        catalog.slice(0, ci ? 3 : 6).map(([name, , unit], j) => ({
          id: uid(`list-item-${ci}-${j}`),
          list_id: listId,
          product_id: uid(`product-0-${j}`),
          name,
          unit,
          quantity: j === 1 ? 2 : 1,
        })),
      ),
    );
    const room = check(
      await c.client.rpc("open_chat", { shop: uid("shop-0") }),
    );
    const already = check(
      await c.client
        .from("chat_messages")
        .select("id")
        .eq("chat_room_id", room)
        .limit(1),
    );
    if (!already.length) {
      check(
        await c.client.rpc("send_message", {
          room,
          kind: "PRODUCT_LIST",
          reference_id: listId,
          text_content: "Hi! Could you prepare these for me?",
        }),
      );
      check(
        await keepers[0].client.rpc("send_message", {
          room,
          kind: "TEXT",
          text_content: "Of course! Everything is available. Happy to help.",
        }),
      );
    }
    for (let n = 0; n < 2; n++) {
      const order = check(
        await c.client.rpc("place_order", {
          shop: uid("shop-0"),
          address,
          request_id: uid(`order-request-${ci}-${n}`),
          items: [
            { product_id: uid("product-0-0"), quantity: 1, expected_price: 28 },
            { product_id: uid("product-0-1"), quantity: 2, expected_price: 55 },
          ],
          order_notes: "Please call at the gate.",
        }),
      );
      const current = check(
        await c.client.from("orders").select("status").eq("id", order).single(),
      );
      const stages = [
        "PLACED",
        "ACCEPTED",
        "PREPARING",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
      ];
      const end = n === 0 ? 4 : 3;
      for (let step = stages.indexOf(current.status) + 1; step <= end; step++)
        check(
          await keepers[0].client.rpc("transition_order", {
            target: order,
            next_status: stages[step],
          }),
        );
      if (n === 0) {
        const review = check(
          await c.client.from("reviews").select("id").eq("order_id", order),
        );
        if (!review.length)
          check(
            await c.client.from("reviews").insert({
              order_id: order,
              customer_id: c.id,
              shop_id: uid("shop-0"),
              rating: ci ? 4 : 5,
              comment: "Friendly service and everything arrived fresh.",
            }),
          );
      }
    }
  }
  console.log(
    "Seeded 5 shopkeepers, 10 shops, 8 categories, 60 products, 2 customers, 4 orders, reviews, chats and shopping lists.",
  );
  console.log(
    "Development logins: shopkeeper1@localkart.test, aarav@localkart.test, admin@localkart.test. Use your configured SEED_PASSWORD.",
  );
}
void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
