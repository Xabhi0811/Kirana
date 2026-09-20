// Development fixture provisioning only. Never run against production.
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";
process.loadEnvFile(".env.local");
if (process.env.NODE_ENV === "production")
  throw new Error("Demo seeding is disabled in production mode.");
if (!process.argv.includes("--allow-remote"))
  throw new Error("Explicit development opt-in required: --allow-remote");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!process.argv.includes(`--project=${new URL(url).hostname.split(".")[0]}`))
  throw new Error(
    "Confirm the DEVELOPMENT target explicitly with --project=<Supabase project reference>. Never seed production.",
  );
const connection = new URL(process.env.DIRECT_URL!);
if (
  decodeURIComponent(connection.username) !==
  `postgres.${new URL(url).hostname.split(".")[0]}`
)
  throw new Error("Project mismatch");
const credentialsPath = ".demo-data.json";
const password = existsSync(credentialsPath)
  ? JSON.parse(readFileSync(credentialsPath, "utf8")).password
  : `Demo${randomBytes(18).toString("hex")}42!`;
function id(value: string) {
  const h = createHash("sha256")
    .update(`localkart-full-demo:${value}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const db = new Client({
  connectionString: process.env.DIRECT_URL,
  ssl: {
    rejectUnauthorized: true,
    ca: readFileSync(process.env.SUPABASE_DB_CA_FILE!, "utf8"),
  },
  connectionTimeoutMillis: 15000,
});
const users = [
  {
    key: "admin",
    email: "demo.admin@localkart.test",
    name: "Demo Admin",
    role: "ADMIN",
  },
  {
    key: "keeper",
    email: "demo.shopkeeper@localkart.test",
    name: "Demo Shopkeeper",
    role: "SHOPKEEPER",
  },
  {
    key: "keeper2",
    email: "demo.shopkeeper2@localkart.test",
    name: "Demo Second Shopkeeper",
    role: "SHOPKEEPER",
  },
  {
    key: "customer",
    email: "demo.customer@localkart.test",
    name: "Demo Customer",
    role: "CUSTOMER",
  },
  {
    key: "customer2",
    email: "demo.customer2@localkart.test",
    name: "Demo Second Customer",
    role: "CUSTOMER",
  },
  {
    key: "suspended",
    email: "demo.suspended@localkart.test",
    name: "Demo Suspended Customer",
    role: "CUSTOMER",
  },
];
async function as(key: string | null) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    key ? id(key) : "",
  ]);
}
async function rpc(sql: string, values: unknown[]) {
  return (await db.query(sql, values)).rows[0].result;
}
async function main() {
  await db.connect();
  await db.query("begin");
  try {
    await db.query(
      "select pg_advisory_xact_lock(hashtextextended('localkart-full-demo',0))",
    );
    for (const [i, u] of users.entries()) {
      const existing = await db.query(
        "select id from auth.users where email=$1",
        [u.email],
      );
      if (existing.rows.length && existing.rows[0].id !== id(u.key))
        throw new Error("Demo email collision; no changes made");
      await db.query(
        "insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change) values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),$4,$5,now(),now(),'','','','') on conflict(id) do nothing",
        [
          id(u.key),
          u.email,
          password,
          { provider: "email", providers: ["email"] },
          {
            name: u.name,
            phone: `970000000${i}`,
            role: u.role === "ADMIN" ? "CUSTOMER" : u.role,
          },
        ],
      );
      await db.query(
        "insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) values($1,$2,$3,'email',now(),now()) on conflict(provider_id,provider) do nothing",
        [
          id(u.key),
          id(u.key),
          {
            sub: id(u.key),
            email: u.email,
            email_verified: true,
            phone_verified: false,
          },
        ],
      );
      await as(null);
      await db.query(
        "update public.users set role=$2,status=$3 where id=$1 and (role is distinct from $2 or status is distinct from $3)",
        [id(u.key), u.role, u.key === "suspended" ? "SUSPENDED" : "ACTIVE"],
      );
    }
    await as("admin");
    const cats = [
      "Grocery",
      "Dairy",
      "Bakery",
      "Stationery",
      "Flowers",
      "Household",
      "Personal Care",
      "Snacks",
    ];
    for (const [i, name] of cats.entries())
      await db.query(
        "insert into public.categories(id,name,description,parent_id) values($1,$2,$3,$4) on conflict(id) do nothing",
        [
          id(`cat${i}`),
          `Demo ${name}`,
          `Demo ${name} products`,
          i === 1 || i === 7 ? id("cat0") : null,
        ],
      );
    const shopStates = [
      ["OPEN", "APPROVED"],
      ["OPEN", "APPROVED"],
      ["CLOSED", "APPROVED"],
      ["OPEN", "PENDING"],
      ["OPEN", "REJECTED"],
      ["OPEN", "SUSPENDED"],
      ["INACTIVE", "APPROVED"],
      ["OPEN", "APPROVED"],
    ];
    const catalog = [
      ["Tata Salt", "Tata", "1 kg", 28, 0],
      ["Milk", "Nandini", "1 L", 55, 1],
      ["Brown Bread", "Britannia", "400 g", 45, 2],
      ["Notebook", "Classmate", "1 item", 60, 3],
      ["Roses", "Local", "1 bunch", 120, 4],
      ["Dish Soap", "Local", "500 mL", 65, 5],
      ["Shampoo", "Local", "200 mL", 110, 6],
      ["Chips", "Local", "100 g", 20, 7],
      ["Tata Salt", "Tata", "500 g", 16, 0],
    ] as const;
    for (const [i, [status, approval]] of shopStates.entries()) {
      await db.query(
        "insert into public.shops(id,owner_id,category_id,name,description,address,latitude,longitude,delivery_radius_km,status,approval_status,phone,email) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) on conflict(id) do nothing",
        [
          id(`shop${i}`),
          id(i % 2 ? "keeper2" : "keeper"),
          id("cat0"),
          `Demo ${["Neighbour Store", "Fresh Mart", "Closed Store", "Pending Store", "Rejected Store", "Suspended Store", "Inactive Store", "Faraway Store"][i]}`,
          "Demo marketplace shop",
          `${20 + i} Main Road, Indiranagar, Bengaluru`,
          12.9784 + (i === 7 ? 0.2 : i * 0.002),
          77.6408,
          i === 7 ? 1 : 5,
          status,
          approval,
          `960000000${i}`,
          "demo.shopkeeper@localkart.test",
        ],
      );
      for (const [j, [name, brand, unit, price, cat]] of catalog.entries())
        await db.query(
          "insert into public.products(id,shop_id,category_id,name,brand,unit,price,stock_quantity,is_active,description) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(id) do nothing",
          [
            id(`product${i}-${j}`),
            id(`shop${i}`),
            id(`cat${cat}`),
            name,
            brand,
            unit,
            price + i,
            j === 7 ? 0 : 200,
            j !== 6,
            `Demo ${name} ${unit}`,
          ],
        );
    }
    await db.query(
      "insert into public.products(id,shop_id,category_id,name,brand,unit,price,stock_quantity,is_active,description) values($1,$2,$3,'Demo low-stock lentils','Local','500 g',65,2,true,'Only two packs remain; low-stock checkout fixture') on conflict(id) do nothing",
      [id("lowstock"), id("shop0"), id("cat0")],
    );
    await db.query(
      "insert into public.shopping_lists(id,user_id,name) values($1,$2,'Demo Empty List') on conflict(id) do nothing",
      [id("emptylist"), id("customer")],
    );
    for (const label of ["Home", "Office"])
      await db.query(
        "insert into public.addresses(id,user_id,label,full_address,latitude,longitude,city,state,pincode,is_default) values($1,$2,$3,'12th Cross, Indiranagar',12.9784,77.6408,'Bengaluru','Karnataka','560038',$4) on conflict(id) do nothing",
        [
          id(`suspended-${label}`),
          id("suspended"),
          `Demo ${label}`,
          label === "Home",
        ],
      );
    for (const key of ["customer", "customer2"]) {
      await as(key);
      for (const [n, label] of ["Home", "Office"].entries()) {
        const existing = await db.query(
          "select id from public.addresses where user_id=$1 and label=$2",
          [id(key), `Demo ${label}`],
        );
        if (existing.rows.length) continue;
        await rpc("select public.save_address($1,$2) as result", [
          {
            label: `Demo ${label}`,
            full_address: `Demo ${label}, 12th Cross, Indiranagar`,
            latitude: 12.9784,
            longitude: 77.6408,
            city: "Bengaluru",
            state: "Karnataka",
            pincode: "560038",
            is_default: n === 0,
          },
          existing.rows[0]?.id || null,
        ]);
      }
      const address = (
        await db.query(
          "select id from public.addresses where user_id=$1 and is_default",
          [id(key)],
        )
      ).rows[0].id;
      await db.query(
        "insert into public.shopping_lists(id,user_id,name) values($1,$2,$3) on conflict(id) do nothing",
        [id(`list${key}`), id(key), "Demo Weekly Essentials"],
      );
      for (let n = 0; n < 4; n++)
        await db.query(
          "insert into public.shopping_list_items(id,list_id,product_id,name,quantity,unit) values($1,$2,$3,$4,$5,$6) on conflict(id) do nothing",
          [
            id(`item${key}${n}`),
            id(`list${key}`),
            n === 3 ? null : id(`product0-${n}`),
            n === 3 ? "Unmatched demo item" : catalog[n][0],
            n === 1 ? 2 : 1,
            n === 3 ? "1 item" : catalog[n][2],
          ],
        );
      const room = await rpc("select public.open_chat($1) as result", [
        id("shop0"),
      ]);
      if (
        !(
          await db.query(
            "select id from public.chat_messages where chat_room_id=$1 limit 1",
            [room],
          )
        ).rows.length
      ) {
        for (const [kind, ref, text] of [
          ["TEXT", null, "Hello! Is my shopping list available?"],
          ["PRODUCT", id("product0-0"), "Please add salt"],
          ["PRODUCT_LIST", id(`list${key}`), "My weekly list"],
        ])
          await rpc("select public.send_message($1,$2,$3,$4) as result", [
            room,
            kind,
            text,
            ref,
          ]);
        await as("keeper");
        await rpc("select public.send_message($1,'TEXT',$2) as result", [
          room,
          "Welcome! We can prepare your groceries.",
        ]);
      }
      for (const [n, target] of [
        "PLACED",
        "ACCEPTED",
        "PREPARING",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "CANCELLED",
      ].entries()) {
        await as(key);
        const order = await rpc(
          "select public.place_order($1,$2,$3,$4,$5) as result",
          [
            id("shop0"),
            address,
            JSON.stringify([
              { product_id: id("product0-0"), quantity: 1, expected_price: 28 },
              { product_id: id("product0-1"), quantity: 2, expected_price: 55 },
            ]),
            id(`request${key}${n}`),
            "Demo order: please call at the gate",
          ],
        );
        const current = (
          await db.query("select status from public.orders where id=$1", [
            order,
          ])
        ).rows[0].status;
        await as("keeper");
        const stages = [
          "PLACED",
          "ACCEPTED",
          "PREPARING",
          "OUT_FOR_DELIVERY",
          "DELIVERED",
        ];
        if (target === "CANCELLED" && current !== "CANCELLED")
          await rpc("select public.transition_order($1,$2,$3) as result", [
            order,
            "CANCELLED",
            "Demo cancellation",
          ]);
        else if (target !== "CANCELLED")
          for (
            let s = stages.indexOf(current) + 1;
            s <= stages.indexOf(target);
            s++
          )
            await rpc("select public.transition_order($1,$2,$3) as result", [
              order,
              stages[s],
              `Demo ${stages[s]}`,
            ]);
        // Repair only this deterministic demo order's legacy transaction-time
        // ties. Keep all real-user history and already distinct event times.
        await db.query(
          `with tied as (select created_at from public.order_tracking where order_id=$1 group by created_at having count(*)>1), ranked as (select t.id,t.created_at,row_number() over(partition by t.created_at order by array_position(array['PLACED','ACCEPTED','PREPARING','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'],t.status))-1 as n from public.order_tracking t join tied using(created_at) where t.order_id=$1) update public.order_tracking t set created_at=r.created_at+r.n*interval '1 microsecond' from ranked r where t.id=r.id and r.n>0`,
          [order],
        );
        await as(key);
        if (target === "DELIVERED") {
          await db.query(
            "insert into public.reviews(id,order_id,customer_id,shop_id,rating,comment) values($1,$2,$3,$4,$5,$6) on conflict(order_id) do nothing",
            [
              id(`review${key}`),
              order,
              id(key),
              id("shop0"),
              key === "customer" ? 5 : 4,
              "Demo review: friendly service and fresh products.",
            ],
          );
          if (
            !(
              await db.query(
                "select id from public.chat_messages where chat_room_id=$1 and message_type='ORDER'",
                [room],
              )
            ).rows.length
          )
            await rpc(
              "select public.send_message($1,'ORDER',$2,$3) as result",
              [room, "My delivered order", order],
            );
        }
        if (n < 3)
          await db.query(
            "insert into public.complaints(id,order_id,user_id,shop_id,subject,description,status) values($1,$2,$3,$4,$5,$6,$7) on conflict(id) do nothing",
            [
              id(`complaint${key}${n}`),
              order,
              id(key),
              id("shop0"),
              `Demo ${["delivery question", "missing item", "resolved issue"][n]}`,
              "Demo support ticket for testing",
              ["OPEN", "IN_PROGRESS", "RESOLVED"][n],
            ],
          );
      }
    }
    await as("admin");
    await db.query(
      "update public.platform_settings set announcement='Demo marketplace: explore sample shops, orders and chat.' where id='00000000-0000-0000-0000-000000000001' and announcement=''",
    );
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
  writeFileSync(
    credentialsPath,
    JSON.stringify(
      {
        password,
        accounts: users,
        location: {
          label: "Indiranagar, Bengaluru",
          latitude: 12.9784,
          longitude: 77.6408,
        },
      },
      null,
      2,
    ),
  );
  // Verify credentials through the actual Auth API, not just database records.
  for (const u of users.filter((u) => u.key !== "suspended")) {
    const client = createClient(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const result = await client.auth.signInWithPassword({
      email: u.email,
      password,
    });
    if (result.error)
      throw new Error(
        `Demo Auth verification failed for ${u.key}: ${result.error.code}`,
      );
    await client.auth.signOut();
  }
  await seedArtwork();
  // Retain fallback linking for any additional demo-only audit records.
  // Only demo-owned records are updated; existing artwork is retained.
  await as("admin");
  for (const [bucket, owner] of [
    ["avatars", "customer"],
    ["category-images", "admin"],
    ["shop-images", "keeper"],
    ["product-images", "keeper"],
  ]) {
    const asset = await db.query(
      "select name from storage.objects where bucket_id=$1 and name like $2 order by created_at desc limit 1",
      [bucket, `${id(owner)}/%`],
    );
    if (!asset.rows.length) continue;
    const imageUrl = `${url}/storage/v1/object/public/${bucket}/${asset.rows[0].name}`;
    if (bucket === "avatars")
      await db.query(
        "update public.users set avatar_url=$1 where id=$2 and avatar_url is null",
        [imageUrl, id("customer")],
      );
    if (bucket === "category-images")
      await db.query(
        "update public.categories set image_url=$1 where id=any($2::uuid[]) and image_url is null",
        [imageUrl, Array.from({ length: 8 }, (_, i) => id(`cat${i}`))],
      );
    if (bucket === "shop-images")
      await db.query(
        "update public.shops set logo_url=$1 where owner_id in ($2,$3) and logo_url is null",
        [imageUrl, id("keeper"), id("keeper2")],
      );
    if (bucket === "product-images")
      await db.query(
        "update public.products set image_url=$1 where shop_id in (select id from public.shops where owner_id in ($2,$3)) and image_url is null",
        [imageUrl, id("keeper"), id("keeper2")],
      );
  }
  const counts: Record<string, number> = {};
  for (const table of [
    "users",
    "categories",
    "shops",
    "products",
    "addresses",
    "shopping_lists",
    "shopping_list_items",
    "orders",
    "order_items",
    "order_tracking",
    "reviews",
    "complaints",
    "chat_rooms",
    "chat_messages",
    "audit_logs",
    "platform_settings",
  ])
    counts[table] = Number(
      (await db.query(`select count(*) from public.${table}`)).rows[0].count,
    );
  console.log(
    JSON.stringify({ counts, credentials: credentialsPath, verifiedLogins: 5 }),
  );
}
async function seedArtwork() {
  // Original vector packaging/storefront illustrations, rasterized for the
  // application's PNG-only upload policy. No external copyrighted photos.
  const labels = [
    "Salt",
    "Milk",
    "Brown Bread",
    "Notebook",
    "Fresh Roses",
    "Dish Soap",
    "Shampoo",
    "Chips",
    "Salt 500g",
  ];
  for (const key of ["admin", "keeper", "keeper2", "customer", "customer2"]) {
    const client = createClient(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const account = users.find((u) => u.key === key)!;
    const signed = await client.auth.signInWithPassword({
      email: account.email,
      password,
    });
    if (signed.error) throw new Error(`Artwork login failed: ${key}`);
    try {
      const assets =
        key === "admin"
          ? Array.from({ length: 8 }, (_, i) => ({
              bucket: "category-images",
              name: `category-${i}`,
              label: [
                "Grocery",
                "Dairy",
                "Bakery",
                "Stationery",
                "Flowers",
                "Household",
                "Personal Care",
                "Snacks",
              ][i],
            }))
          : key.startsWith("keeper")
            ? [
                {
                  bucket: "shop-images",
                  name: "store",
                  label: "Neighbourhood Store",
                },
                ...labels.map((label, i) => ({
                  bucket: "product-images",
                  name: `product-${i}`,
                  label,
                })),
              ]
            : [
                { bucket: "avatars", name: "avatar", label: account.name },
                {
                  bucket: "chat-images",
                  name: "basket",
                  label: "Weekly essentials",
                },
              ];
      for (const asset of assets) {
        const room =
          asset.bucket === "chat-images"
            ? (await client.rpc("chat_summaries")).data?.[0]?.id
            : null;
        if (asset.bucket === "chat-images" && !room)
          throw new Error("Missing demo chat room");
        const path = room
          ? `${id(key)}/${room}/demo-v2-basket.png`
          : `${id(key)}/demo-v2/${asset.name}.png`;
        const exists = await db.query(
          "select 1 from storage.objects where bucket_id=$1 and name=$2",
          [asset.bucket, path],
        );
        if (!exists.rows.length) {
          const storefront = asset.bucket === "shop-images";
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#f6f2e8"/><ellipse cx="320" cy="397" rx="190" ry="22" fill="#ded7c9"/><rect x="${storefront ? 115 : 210}" y="100" width="${storefront ? 410 : 220}" height="290" rx="20" fill="#1d7456"/><rect x="${storefront ? 100 : 225}" y="${storefront ? 110 : 150}" width="${storefront ? 440 : 190}" height="${storefront ? 65 : 165}" rx="8" fill="#fff8e7"/>${storefront ? '<path d="M110 115h420v45H110z" fill="#ed8157"/><rect x="260" y="240" width="120" height="150" fill="#fff8e7"/>' : '<circle cx="320" cy="208" r="36" fill="#ed8157"/><path d="M302 208l13 13 25-28" fill="none" stroke="white" stroke-width="7"/>'}<text x="320" y="${storefront ? 210 : 276}" text-anchor="middle" font-family="sans-serif" font-size="22" fill="${storefront ? "white" : "#164b38"}">${asset.label}</text><text x="320" y="355" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#fff8e7">KIRANA · DEMO</text><text x="320" y="447" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#647067">Illustration for testing · not a product photograph</text></svg>`;
          const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
          const upload = await client.storage
            .from(asset.bucket)
            .upload(path, buffer, { contentType: "image/png" });
          if (upload.error)
            throw new Error(
              `Artwork upload failed: ${asset.bucket}: ${upload.error.message}`,
            );
        }
        const imageUrl = client.storage.from(asset.bucket).getPublicUrl(path)
          .data.publicUrl;
        if (room) {
          const message = await db.query(
            "select id from public.chat_messages where chat_room_id=$1 and message_type='IMAGE' and payload->>'path'=$2",
            [room, path],
          );
          if (!message.rows.length) {
            const sent = await client.rpc("send_message", {
              room,
              kind: "IMAGE",
              text_content: "Demo weekly basket illustration",
              image_path: path,
            });
            if (sent.error)
              throw new Error(
                `Demo image message failed: ${sent.error.message}`,
              );
          }
        }
        if (asset.bucket === "avatars")
          await db.query(
            "update public.users set avatar_url=$1 where id=$2 and avatar_url is distinct from $1",
            [imageUrl, id(key)],
          );
        if (asset.bucket === "category-images")
          await db.query(
            "update public.categories set image_url=$1 where id=$2 and image_url is distinct from $1",
            [imageUrl, id(`cat${asset.name.split("-")[1]}`)],
          );
        if (asset.bucket === "shop-images")
          await db.query(
            "update public.shops set logo_url=$1 where id=any($2::uuid[]) and logo_url is distinct from $1",
            [
              imageUrl,
              Array.from({ length: 4 }, (_, i) =>
                id(`shop${i * 2 + (key === "keeper2" ? 1 : 0)}`),
              ),
            ],
          );
        if (asset.bucket === "product-images")
          await db.query(
            "update public.products set image_url=$1 where id=any($2::uuid[]) and image_url is distinct from $1",
            [
              imageUrl,
              Array.from({ length: 4 }, (_, i) =>
                id(
                  `product${i * 2 + (key === "keeper2" ? 1 : 0)}-${asset.name.split("-")[1]}`,
                ),
              ),
            ],
          );
      }
    } finally {
      await client.auth.signOut();
    }
  }
}
void main()
  .catch((error) => {
    console.error("Demo setup failed:", error.code || error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
