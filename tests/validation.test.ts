import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  registerSchema,
  orderSchema,
  addressSchema,
  shopSchema,
  categorySchema,
  platformSettingsSchema,
  searchSchema,
} from "../src/lib/validation";
import { distanceKm } from "../src/lib/utils";
test("category images and platform settings reject invalid public information", () => {
  assert.equal(
    categorySchema.safeParse({
      name: "Grocery",
      description: "",
      parent_id: null,
      image_url: "https://example.com/category.png",
    }).success,
    true,
  );
  assert.equal(
    categorySchema.safeParse({
      name: "Grocery",
      description: "",
      parent_id: null,
      image_url: "not-a-url",
    }).success,
    false,
  );
  assert.equal(
    platformSettingsSchema.safeParse({
      marketplace_name: "Kirana",
      support_email: "",
      announcement: "Welcome",
    }).success,
    true,
  );
  assert.equal(
    platformSettingsSchema.safeParse({
      marketplace_name: "Kirana",
      support_email: "invalid",
      announcement: "",
    }).success,
    false,
  );
  assert.equal(
    platformSettingsSchema.safeParse({
      marketplace_name: "Kirana",
      support_email: "",
      announcement: "x".repeat(501),
    }).success,
    false,
  );
});
test("public registration cannot request the admin role", () => {
  const input = {
    name: "Customer",
    email: "customer@example.test",
    phone: "9876543210",
    password: "StrongPassword42",
    role: "ADMIN",
  };
  assert.equal(registerSchema.safeParse(input).success, false);
  assert.equal(
    registerSchema.safeParse({ ...input, role: "CUSTOMER" }).success,
    true,
  );
});
test("cart rejects duplicate products, invalid quantities and prices", () => {
  const item = { product_id: randomUUID(), quantity: 1, expected_price: 28 };
  const order = {
    shop_id: randomUUID(),
    address_id: randomUUID(),
    request_id: randomUUID(),
    notes: "",
    items: [item],
  };
  assert.equal(orderSchema.safeParse(order).success, true);
  for (const items of [
    [item, item],
    [{ ...item, quantity: 0 }],
    [{ ...item, quantity: 1.5 }],
    [{ ...item, expected_price: -1 }],
  ])
    assert.equal(orderSchema.safeParse({ ...order, items }).success, false);
});
test("location checks are accurate and address coordinates are required", () => {
  const origin = { latitude: 12.9784, longitude: 77.6408 };
  assert.equal(distanceKm(origin, origin), 0);
  assert.ok(
    Math.abs(
      distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) -
        111.195,
    ) < 0.01,
  );
  assert.equal(
    addressSchema.safeParse({
      label: "Home",
      full_address: "12 Main Road",
      ...origin,
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560038",
      is_default: true,
    }).success,
    true,
  );
  assert.equal(
    addressSchema.safeParse({ latitude: 91, longitude: 0 }).success,
    false,
  );
});
test("business hours reject impossible clock times", () => {
  assert.equal(shopSchema.shape.open_time.safeParse("25:99").success, false);
  assert.equal(shopSchema.shape.open_time.safeParse("08:30").success, true);
});
test("empty, null and boolean coordinates do not silently become zero", () => {
  for (const latitude of [null, undefined, "", " ", false, true])
    assert.equal(
      searchSchema.safeParse({ latitude, longitude: 77 }).success,
      false,
    );
  assert.equal(
    searchSchema.safeParse({ latitude: "0", longitude: "0" }).success,
    true,
  );
});
