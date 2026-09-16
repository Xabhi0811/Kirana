import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

// Runs the actual migration against PostgreSQL. Only Supabase's external auth,
// storage and publication schemas are fixtures; application SQL is unchanged.
const db = new PGlite({ extensions: { pg_trgm } });
const keeper = randomUUID(),
  otherKeeper = randomUUID(),
  customer = randomUUID(),
  stranger = randomUUID(),
  admin = randomUUID(),
  category = randomUUID(),
  shop = randomUUID(),
  otherShop = randomUUID(),
  product = randomUUID(),
  otherProduct = randomUUID();
let address: string, order: string, room: string, list: string;
async function as(id: string | null) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id || "",
  ]);
  if (id) await db.exec("set role authenticated");
}
async function scalar<T>(sql: string, params: unknown[] = []) {
  return (await db.query<{ value: T }>(sql, params)).rows[0]?.value;
}
async function place(items: unknown[], request = randomUUID()) {
  return scalar<string>(
    "select public.place_order($1,$2,$3::jsonb,$4) as value",
    [shop, address, JSON.stringify(items), request],
  );
}
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage; create schema extensions;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
 alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
 create publication supabase_realtime;
 grant usage on schema public,auth,storage to anon,authenticated;
 alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
 alter default privileges in schema public grant select on tables to anon;
 grant select,insert,delete on storage.objects to authenticated; grant select on storage.objects to anon;`);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202609150001_localkart.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202609150002_er_alignment.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202609150003_feature_completion.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202609160001_remove_rate_limits.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202609160002_audit_security.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202609160003_product_name_sort.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202609160004_tracking_event_time.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const [id, role, name] of [
    [keeper, "SHOPKEEPER", "Sharma"],
    [otherKeeper, "SHOPKEEPER", "Other owner"],
    [customer, "CUSTOMER", "Aarav"],
    [stranger, "CUSTOMER", "Other customer"],
    [admin, "ADMIN", "Admin"],
  ]) {
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)",
      [id, id + "@example.test", JSON.stringify({ name, role })],
    );
  }
  assert.equal(
    await scalar("select role as value from public.users where id=$1", [admin]),
    "CUSTOMER",
  );
  await db.query("update public.users set role='ADMIN' where id=$1", [admin]);
  await db.query(
    "insert into public.categories(id,name) values($1,'Grocery')",
    [category],
  );
  await as(keeper);
  await db.query(
    "insert into public.shops(id,owner_id,category_id,name,address,latitude,longitude,delivery_radius_km) values($1,$2,$3,'Sharma General Store','Main Street',12.9784,77.6408,5) returning id",
    [shop, keeper, category],
  );
  await as(admin);
  await db.query(
    "update public.shops set approval_status='APPROVED' where id=$1",
    [shop],
  );
  await as(null);
  await db.query(
    "insert into public.shops(id,owner_id,category_id,name,address,latitude,longitude,delivery_radius_km,approval_status) values($1,$2,$3,'Gupta Store','Second Street',12.9824,77.6408,5,'APPROVED')",
    [otherShop, otherKeeper, category],
  );
  await as(keeper);
  await db.query(
    "insert into public.products(id,shop_id,category_id,name,unit,price,stock_quantity) values($1,$2,$3,'Tata Salt','1 kg',28,50)",
    [product, shop, category],
  );
  await as(otherKeeper);
  await db.query(
    "insert into public.products(id,shop_id,category_id,name,unit,price,stock_quantity) values($1,$2,$3,'Tata Salt','1 kg',30,50)",
    [otherProduct, otherShop, category],
  );
  await as(customer);
  address = await scalar<string>(
    "select public.save_address($1::jsonb) as value",
    [
      JSON.stringify({
        label: "Home",
        full_address: "12 Main Road",
        latitude: 12.9784,
        longitude: 77.6408,
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560038",
        is_default: true,
      }),
    ],
  );
});
after(async () => {
  await db.close();
});
test("public settings are admin-managed and changes are audited", async () => {
  await as(customer);
  const denied = await db.query(
    "update public.platform_settings set announcement='forged' returning id",
  );
  assert.equal(denied.rows.length, 0);
  await as(admin);
  await db.query(
    "update public.platform_settings set announcement='Shop locally' returning id",
  );
  const audit = await db.query(
    "select id from public.audit_logs where resource='platform_settings' and actor_id=$1",
    [admin],
  );
  assert.ok(audit.rows.length > 0);
  await as(null);
  await db.exec("set role anon");
  assert.equal(
    await scalar("select announcement as value from public.platform_settings"),
    "Shop locally",
  );
  await as(admin);
  await db.query("update public.platform_settings set announcement=''");
});
test("reports require admin and enforce bounded UTC date cohorts", async () => {
  await as(customer);
  await assert.rejects(
    db.query("select * from public.admin_order_report(7)"),
    /Unauthorized/,
  );
  await as(admin);
  await assert.rejects(
    db.query("select * from public.admin_order_report(91)"),
    /1 to 90/,
  );
  const report = await db.query<{
    orders: number;
    delivered_order_value: number;
  }>("select * from public.admin_order_report(7)");
  assert.equal(report.rows.length, 7);
  await as(null);
  const expected = await scalar<number>(
    "select count(*) as value from public.orders where created_at >= (((now() at time zone 'UTC')::date - 6)::timestamp at time zone 'UTC')",
  );
  assert.equal(
    report.rows.reduce((sum, r) => sum + Number(r.orders), 0),
    Number(expected),
  );
});
test("only admins can upload category images; category images are public", async () => {
  await as(customer);
  await assert.rejects(
    db.query(
      "insert into storage.objects(bucket_id,name) values('category-images',$1)",
      [customer + "/forged.png"],
    ),
    /row-level security/,
  );
  await as(admin);
  const path = admin + "/category-test.png";
  await db.query(
    "insert into storage.objects(bucket_id,name) values('category-images',$1)",
    [path],
  );
  await as(null);
  await db.exec("set role anon");
  assert.equal(
    (
      await db.query(
        "select id from storage.objects where bucket_id='category-images' and name=$1",
        [path],
      )
    ).rows.length,
    1,
  );
  await as(admin);
  await db.query(
    "delete from storage.objects where bucket_id='category-images' and name=$1",
    [path],
  );
  await as(null);
});
test("ER phone uniqueness ignores optional plus and database rejects malformed phones", async () => {
  await as(customer);
  await db.query("update public.users set phone='9876543210' where id=$1", [
    customer,
  ]);
  await as(stranger);
  await assert.rejects(
    db.query("update public.users set phone='+9876543210' where id=$1", [
      stranger,
    ]),
    /users_phone_unique/,
  );
  await assert.rejects(
    db.query("update public.users set phone='bad-number' where id=$1", [
      stranger,
    ]),
    /users_phone_format/,
  );
  await as(customer);
  await db.query("update public.users set phone=null where id=$1", [customer]);
});
test("ER constraints and foreign-key lookup indexes are installed", async () => {
  await as(null);
  const constraints = await db.query(
    "select conname from pg_constraint where conname='order_items_total_consistent'",
  );
  assert.equal(constraints.rows.length, 1);
  const indexes = await db.query(
    "select indexname from pg_indexes where schemaname='public' and indexname in ('categories_parent_idx','shops_category_idx','orders_address_idx','order_items_product_idx','complaints_user_created_idx','chat_messages_sender_idx')",
  );
  assert.equal(indexes.rows.length, 6);
});
test("snapshot line total cannot disagree with price times quantity", async () => {
  await as(null);
  await db.exec("begin");
  try {
    await as(customer);
    const temporary = await place([
      { product_id: product, quantity: 1, expected_price: 28 },
    ]);
    await as(null);
    await assert.rejects(
      db.query(
        "update public.order_items set total_price=1 where order_id=$1",
        [temporary],
      ),
      /order_items_total_consistent/,
    );
  } finally {
    await db.exec("rollback");
    await as(null);
  }
});
test("comparison distinguishes package sizes and category cycles are rejected", async () => {
  const variant = randomUUID();
  await as(otherKeeper);
  await db.query(
    "insert into public.products(id,shop_id,category_id,name,unit,price,stock_quantity) values($1,$2,$3,'Tata Salt','500 g',15,10)",
    [variant, otherShop, category],
  );
  await as(customer);
  const listings = await db.query(
    "select * from public.discover_products(12.9784,77.6408,'Tata Salt',unit_filter=>'1 kg')",
  );
  assert.equal(listings.rows.length, 2);
  await as(otherKeeper);
  await db.query("delete from public.products where id=$1", [variant]);
  await as(admin);
  const child = randomUUID();
  await db.query(
    "insert into public.categories(id,name,parent_id) values($1,'Dairy',$2)",
    [child, category],
  );
  await assert.rejects(
    db.query("update public.categories set parent_id=$1 where id=$2", [
      child,
      category,
    ]),
    /cycle/,
  );
});
test("search compares prices and filters out shops beyond their radius", async () => {
  await as(customer);
  const near = await db.query<{ price: number; shop_name: string }>(
    "select * from public.discover_products(12.9784,77.6408,'Tata Salt',sort_by=>'price')",
  );
  assert.equal(near.rows.length, 2);
  assert.equal(Number(near.rows[0].price), 28);
  const far = await db.query(
    "select * from public.discover_products(15,80,'Tata Salt')",
  );
  assert.equal(far.rows.length, 0);
  await as(otherKeeper);
  await db.query("update public.shops set status='CLOSED' where id=$1", [
    otherShop,
  ]);
  await as(customer);
  assert.equal(
    (
      await db.query(
        "select * from public.discover_products(12.9784,77.6408,'Tata Salt',open_only=>true)",
      )
    ).rows.length,
    1,
  );
});
test("ownership and privilege escalation are blocked by RLS and triggers", async () => {
  await as(stranger);
  assert.equal(
    (await db.query("select * from public.addresses")).rows.length,
    0,
  );
  await assert.rejects(
    db.query("update public.users set role='ADMIN' where id=$1", [stranger]),
    /permissions denied/i,
  );
  await as(otherKeeper);
  await db.query("update public.products set price=1 where id=$1", [product]);
  await assert.rejects(
    db.query("update public.shops set approval_status='REJECTED' where id=$1", [
      otherShop,
    ]),
    /administrators/i,
  );
  await as(keeper);
  assert.equal(
    Number(
      await scalar("select price as value from public.products where id=$1", [
        product,
      ]),
    ),
    28,
  );
});
test("list sharing creates an immutable structured message in a private chat", async () => {
  await as(customer);
  list = await scalar<string>(
    "insert into public.shopping_lists(user_id,name) values(auth.uid(),'Weekly essentials') returning id as value",
  );
  await db.query(
    "insert into public.shopping_list_items(list_id,product_id,name,quantity,unit) values($1,$2,'Tata Salt',2,'1 kg')",
    [list, product],
  );
  room = await scalar<string>("select public.open_chat($1) as value", [shop]);
  await db.query("select public.send_message($1,'PRODUCT_LIST','',$2)", [
    room,
    list,
  ]);
  await db.query(
    "update public.shopping_lists set name='Edited list' where id=$1",
    [list],
  );
  await as(stranger);
  assert.equal(
    (await db.query("select * from public.chat_messages")).rows.length,
    0,
  );
  await assert.rejects(
    db.query("select public.send_message($1,'TEXT','Intrusion')", [room]),
    /access denied/i,
  );
  await as(keeper);
  const payload = await scalar<{ name: string; items: { quantity: number }[] }>(
    "select payload as value from public.chat_messages where chat_room_id=$1",
    [room],
  );
  assert.equal(payload.name, "Weekly essentials");
  assert.equal(payload.items[0].quantity, 2);
  await db.query("select public.read_messages($1)", [room]);
  assert.equal(
    await scalar(
      "select is_read as value from public.chat_messages where chat_room_id=$1",
      [room],
    ),
    true,
  );
  await db.query(
    "select public.send_message($1,'TEXT','Available! We can prepare this.')",
    [room],
  );
});
test("orders reject cross-shop items, forged prices, invalid addresses and overselling", async () => {
  await as(customer);
  await assert.rejects(
    db.query("select public.place_order($1,$2,null,$3)", [
      shop,
      address,
      randomUUID(),
    ]),
    /Invalid cart/,
  );
  await assert.rejects(
    place([{ product_id: otherProduct, quantity: 1, expected_price: 30 }]),
    /another shop/i,
  );
  await assert.rejects(
    place([{ product_id: product, quantity: 1, expected_price: 1 }]),
    /Price changed/,
  );
  await assert.rejects(
    place([{ product_id: product, quantity: 51, expected_price: 28 }]),
    /out of stock/i,
  );
  await assert.rejects(
    db.query("select public.place_order($1,$2,$3::jsonb,$4)", [
      shop,
      randomUUID(),
      JSON.stringify([
        { product_id: product, quantity: 1, expected_price: 28 },
      ]),
      randomUUID(),
    ]),
    /Invalid address/,
  );
  assert.equal(
    await scalar(
      "select stock_quantity as value from public.products where id=$1",
      [product],
    ),
    50,
  );
  assert.equal(
    await scalar("select count(*)::integer as value from public.orders"),
    0,
  );
});
test("order placement is atomic, idempotent and stores original price snapshots", async () => {
  await as(customer);
  const request = randomUUID(),
    items = [{ product_id: product, quantity: 2, expected_price: 28 }];
  order = await place(items, request);
  assert.equal(await place(items, request), order);
  assert.equal(
    Number(
      await scalar(
        "select total_amount as value from public.orders where id=$1",
        [order],
      ),
    ),
    56,
  );
  await as(keeper);
  assert.equal(
    await scalar(
      "select stock_quantity as value from public.products where id=$1",
      [product],
    ),
    48,
  );
  await db.query("update public.products set price=35 where id=$1", [product]);
  assert.equal(
    Number(
      await scalar(
        "select unit_price as value from public.order_items where order_id=$1",
        [order],
      ),
    ),
    28,
  );
  await as(stranger);
  assert.equal((await db.query("select * from public.orders")).rows.length, 0);
  await assert.rejects(
    db.query("select public.transition_order($1,'ACCEPTED')", [order]),
    /Unauthorized/,
  );
});
test("only delivered orders may be reviewed and valid shop status transitions produce a timeline", async () => {
  await as(customer);
  await assert.rejects(
    db.query(
      "insert into public.reviews(order_id,customer_id,shop_id,rating,comment) values($1,auth.uid(),$2,5,'Great')",
      [order, shop],
    ),
    /row-level security/i,
  );
  await as(keeper);
  await assert.rejects(
    db.query("select public.transition_order($1,'DELIVERED')", [order]),
    /invalid order/,
  );
  for (const status of [
    "ACCEPTED",
    "PREPARING",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
  ])
    await db.query("select public.transition_order($1,$2)", [order, status]);
  assert.equal(
    await scalar(
      "select count(*)::integer as value from public.order_tracking where order_id=$1",
      [order],
    ),
    5,
  );
  await as(customer);
  await db.query(
    "insert into public.reviews(order_id,customer_id,shop_id,rating,comment) values($1,auth.uid(),$2,5,'Great')",
    [order, shop],
  );
  await assert.rejects(
    db.query(
      "insert into public.reviews(order_id,customer_id,shop_id,rating,comment) values($1,auth.uid(),$2,5,'Duplicate')",
      [order, shop],
    ),
    /unique/i,
  );
});
test("cancellation restores stock once and default-address switching stays unique", async () => {
  await as(customer);
  const canceled = await place([
    { product_id: product, quantity: 3, expected_price: 35 },
  ]);
  await db.query("select public.transition_order($1,'CANCELLED')", [canceled]);
  await assert.rejects(
    db.query("select public.transition_order($1,'CANCELLED')", [canceled]),
    /invalid order/,
  );
  await as(keeper);
  assert.equal(
    await scalar(
      "select stock_quantity as value from public.products where id=$1",
      [product],
    ),
    48,
  );
  await as(customer);
  await db.query("select public.save_address($1::jsonb)", [
    JSON.stringify({
      label: "Office",
      full_address: "Office Road",
      latitude: 12.9784,
      longitude: 77.6408,
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560038",
      is_default: true,
    }),
  ]);
  assert.equal(
    await scalar(
      "select count(*)::integer as value from public.addresses where is_default",
    ),
    1,
  );
});
test("application rate limits are removed while authentication remains required", async () => {
  await as(null);
  assert.equal(
    await scalar("select to_regclass('private.rate_limits') as value"),
    null,
  );
  assert.equal(
    await scalar(
      "select to_regprocedure('public.throttle_mutation()') as value",
    ),
    null,
  );
  assert.equal(
    await scalar(
      "select to_regprocedure('private.limit_action(text,integer)') as value",
    ),
    null,
  );
  await assert.rejects(
    db.query("select public.open_chat($1)", [shop]),
    /Unauthorized/,
  );
  await as(customer);
  for (let attempt = 0; attempt < 65; attempt++) {
    assert.ok(await scalar("select public.open_chat($1) as value", [shop]));
  }
});
test("admin moderation is audited and suspended users cannot mutate private data", async () => {
  await as(admin);
  assert.ok(
    Number(
      await scalar("select count(*)::integer as value from public.audit_logs"),
    ) > 0,
  );
  await db.query("update public.users set status='SUSPENDED' where id=$1", [
    stranger,
  ]);
  await as(stranger);
  await assert.rejects(
    db.query("select public.open_chat($1)", [shop]),
    /Unauthorized/,
  );
});

test("suspended status is caller-only while profile and private records stay hidden", async () => {
  await as(stranger);
  assert.equal(
    await scalar("select public.my_account_status() as value"),
    "SUSPENDED",
  );
  assert.equal((await db.query("select * from public.users")).rows.length, 0);
  for (const table of [
    "addresses",
    "shopping_lists",
    "orders",
    "chat_rooms",
    "chat_messages",
  ])
    assert.equal(
      (await db.query(`select * from public.${table}`)).rows.length,
      0,
    );
  await as(customer);
  assert.equal(
    await scalar("select public.my_account_status() as value"),
    "ACTIVE",
  );
  await as(null);
  await db.exec("set role anon");
  await assert.rejects(
    db.query("select public.my_account_status()"),
    /permission denied/,
  );
});

test("API roles have no TRUNCATE, TRIGGER or REFERENCES privileges", async () => {
  await as(null);
  for (const role of ["anon", "authenticated"])
    for (const privilege of ["TRUNCATE", "TRIGGER", "REFERENCES"])
      assert.equal(
        await scalar(
          "select bool_or(has_table_privilege($1,oid,$2)) as value from pg_class where relnamespace='public'::regnamespace and relkind='r'",
          [role, privilege],
        ),
        false,
      );
});

test("shop INSERT RETURNING works without allowing forged ownership or approval", async () => {
  await as(keeper);
  const sql =
    "insert into public.shops(owner_id,category_id,name,address,latitude,longitude,delivery_radius_km,approval_status) values($1,$2,'Audit shop','Main Road',12.97,77.64,5,$3) returning id";
  const created = await db.query(sql, [keeper, category, "PENDING"]);
  assert.equal(created.rows.length, 1);
  await assert.rejects(
    db.query(sql, [otherKeeper, category, "PENDING"]),
    /denied|row-level/,
  );
  await assert.rejects(
    db.query(sql, [keeper, category, "APPROVED"]),
    /denied|row-level/,
  );
  await as(customer);
  assert.equal(
    (
      await db.query("select * from public.shops where id=$1", [
        (created.rows[0] as { id: string }).id,
      ])
    ).rows.length,
    0,
  );
  await assert.rejects(
    db.query(sql, [customer, category, "PENDING"]),
    /row-level/,
  );
});

test("private storage rejects outsiders and forged upload paths, including admins", async () => {
  await as(customer);
  const path = `${customer}/${room}/fixture.png`;
  await db.query(
    "insert into storage.objects(bucket_id,name) values('chat-images',$1)",
    [path],
  );
  await as(otherKeeper);
  assert.equal(
    (await db.query("select * from storage.objects where name=$1", [path])).rows
      .length,
    0,
  );
  await assert.rejects(
    db.query(
      "insert into storage.objects(bucket_id,name) values('avatars',$1)",
      [`${customer}/forged.png`],
    ),
    /row-level/,
  );
  await as(admin);
  assert.equal(
    (await db.query("select * from storage.objects where name=$1", [path])).rows
      .length,
    0,
  );
  await as(keeper);
  assert.equal(
    (await db.query("select * from storage.objects where name=$1", [path])).rows
      .length,
    1,
  );
});

test("whole-database consistency regressions have zero violations", async () => {
  await as(null);
  const checks = await db.query<{ check_name: string; violations: number }>(
    await readFile(
      new URL("../supabase/tests/integrity.sql", import.meta.url),
      "utf8",
    ),
  );
  for (const check of checks.rows)
    assert.equal(check.violations, 0, check.check_name);
});

test("product name sorting is applied before pagination", async () => {
  await as(keeper);
  await db.query(
    "insert into public.products(shop_id,category_id,name,unit,price,stock_quantity) values($1,$2,'Alpha rice','1 kg',60,2),($1,$2,'Zulu tea','100 g',80,2)",
    [shop, category],
  );
  await as(customer);
  const result = await db.query<{ name: string }>(
    "select name from public.discover_products(12.9784,77.6408,sort_by=>'name')",
  );
  const names = result.rows.map((r) => r.name);
  assert.deepEqual(names, [...names].sort());
});

test("multiple transitions in one transaction retain chronological event times", async () => {
  await as(null);
  await db.exec("begin");
  try {
    await as(customer);
    const target = await place([
      { product_id: product, quantity: 1, expected_price: 35 },
    ]);
    await as(keeper);
    await db.query("select public.transition_order($1,'ACCEPTED')", [target]);
    await db.query("select public.transition_order($1,'PREPARING')", [target]);
    const history = await db.query<{ status: string }>(
      "select status from public.order_tracking where order_id=$1 order by created_at",
      [target],
    );
    assert.deepEqual(
      history.rows.map((r) => r.status),
      ["PLACED", "ACCEPTED", "PREPARING"],
    );
    assert.equal(
      await scalar(
        "select count(distinct created_at)::integer as value from public.order_tracking where order_id=$1",
        [target],
      ),
      3,
    );
  } finally {
    await db.exec("rollback");
    await as(null);
  }
});
