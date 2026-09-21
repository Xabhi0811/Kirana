import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import {
  Address,
  ChatMessage,
  ChatRoom,
  Order,
  Product,
  Shop,
  User,
  distanceKm,
} from "../src/lib/models";

const objectId = () => new mongoose.Types.ObjectId();

test("MongoDB models validate user credentials and Google identities", () => {
  const user = new User({ name: "Aarav Rao", email: "aarav@example.test", password_hash: "hashed-password" });
  assert.equal(user.validateSync(), undefined);
  assert.equal(user.role, "CUSTOMER");
  assert.equal(user.status, "ACTIVE");

  const googleUser = new User({ name: "Google User", email: "google@example.test", google_id: "google-account-id" });
  assert.equal(googleUser.validateSync(), undefined);
  assert.ok(User.schema.indexes().some(([keys, options]) => keys.google_id === 1 && options.unique === true));
});

test("MongoDB models enforce valid locations and marketplace indexes", () => {
  const shop = new Shop({ owner_id: objectId(), category_id: objectId(), name: "Kirana Store", address: "Main Street, Gwalior", latitude: 26.2183, longitude: 78.1828, delivery_radius_km: 5 });
  assert.equal(shop.validateSync(), undefined);

  const invalidAddress = new Address({ user_id: objectId(), label: "Home", full_address: "Main Street", latitude: 100, longitude: 78.1828, city: "Gwalior", state: "Madhya Pradesh", pincode: "474001" });
  assert.ok(invalidAddress.validateSync()?.errors.latitude);
  assert.ok(Shop.schema.indexes().some(([keys]) => keys.owner_id === 1));
  assert.ok(Product.schema.indexes().some(([keys]) => keys.shop_id === 1));
});

test("orders and chat retain MongoDB ownership and participant indexes", () => {
  const customerId = objectId();
  const shopId = objectId();
  const order = new Order({ customer_id: customerId, shop_id: shopId, delivery_address: { address: "Main Street" }, total_amount: 250, request_key: "idempotency-key" });
  assert.equal(order.validateSync(), undefined);
  assert.ok(Order.schema.indexes().some(([keys, options]) => keys.customer_id === 1 && keys.request_key === 1 && options.unique === true));
  assert.ok(ChatRoom.schema.indexes().some(([keys, options]) => keys.customer_id === 1 && keys.shop_id === 1 && options.unique === true));
  assert.ok(ChatMessage.schema.indexes().some(([keys]) => keys.chat_room_id === 1));
});

test("nearby-shop distance calculations use the MongoDB application model", () => {
  assert.equal(distanceKm(26.2183, 78.1828, 26.2183, 78.1828), 0);
  const distance = distanceKm(26.2183, 78.1828, 26.2283, 78.1828);
  assert.ok(distance > 1 && distance < 1.2);
});
