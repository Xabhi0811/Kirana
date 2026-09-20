import mongoose from "mongoose";
import { hash } from "bcryptjs";
import { createHash } from "node:crypto";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI can supply environment directly. */
}

const uri = process.env.MONGODB_URI;
const password = process.env.SEED_PASSWORD;
if (!uri) throw new Error("Set MONGODB_URI in .env.local");
if (!password || password.length < 10)
  throw new Error("Set SEED_PASSWORD of at least 10 characters in .env.local");

import {
  User,
  Category,
  Address,
  Shop,
  Product,
  ProductImage,
  ShoppingList,
  ShoppingListItem,
  Order,
  OrderItem,
  OrderTracking,
  Review,
  Complaint,
  ChatRoom,
  ChatMessage,
  PlatformSettings,
} from "../../src/lib/models";

// ---- Deterministic ID generation ----
function uid(name: string): string {
  const bytes = createHash("sha256")
    .update("localkart-dev:" + name)
    .digest()
    .subarray(0, 12);
  return Buffer.from(bytes).toString("hex").padEnd(24, "0");
}

function oid(name: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(uid(name));
}

const shopNames = [
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

function generateOrderNumber(): string {
  const hex = [...Array(6)]
    .map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return "LK-" + hex;
}

async function main() {
  await mongoose.connect(uri!);
  console.log("Connected to MongoDB");

  const hashed = await hash(password!, 12);

  // Create users
  let phoneSeq = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function createUser(email: string, name: string, role: any) {
    const phone = "98000000" + String(++phoneSeq).padStart(2, "0");
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      await User.updateOne({ _id: existing._id }, { role, phone });
      return existing;
    }
    return User.create({
      name,
      email: email.toLowerCase(),
      phone,
      role,
      password_hash: hashed,
    });
  }

  const keepers = [];
  const keeperNames = [
    "Ramesh Sharma",
    "Kavya Rao",
    "Suresh Gupta",
    "Anil Verma",
    "Meera Nair",
  ];
  for (let i = 0; i < 5; i++) {
    keepers.push(
      await createUser(
        `shopkeeper${i + 1}@localkart.test`,
        keeperNames[i],
        "SHOPKEEPER",
      ),
    );
  }

  const customers = [
    await createUser("aarav@localkart.test", "Aarav Rao", "CUSTOMER"),
    await createUser("isha@localkart.test", "Isha Patel", "CUSTOMER"),
  ];

  await createUser("admin@localkart.test", "Marketplace Admin", "ADMIN");

  // Create categories
  for (let i = 0; i < categoryNames.length; i++) {
    await Category.findOneAndUpdate(
      { name: categoryNames[i] },
      {
        _id: oid("category-" + i),
        name: categoryNames[i],
        description: "Local " + categoryNames[i].toLowerCase(),
        parent_id: i === 1 || i === 7 ? oid("category-0") : null,
      },
      { upsert: true, new: true },
    );
  }

  // Create shops
  for (let i = 0; i < shopNames.length; i++) {
    const isGwalior = i < 5;
    const addrText = isGwalior
      ? `${10 + i} City Center Road, Gwalior`
      : `${12 + i} Main Road, Indiranagar, Bengaluru`;
    const lat = isGwalior ? 26.2124 + (i - 2) * 0.005 : 12.9784 + (i - 5) * 0.003;
    const lng = isGwalior ? 78.1772 + (i - 2) * 0.004 : 77.6408 + (i - 5) * 0.001;
    const city = isGwalior ? "Gwalior" : "Bengaluru";
    const state = isGwalior ? "Madhya Pradesh" : "Karnataka";
    const pincode = isGwalior ? "474011" : "560038";

    const shopAddr = await Address.findOneAndUpdate(
      { _id: oid("shop-address-" + i) },
      {
        _id: oid("shop-address-" + i),
        user_id: keepers[i % 5]._id,
        label: "Shop",
        full_address: addrText,
        latitude: lat,
        longitude: lng,
        city,
        state,
        pincode,
        is_default: false,
      },
      { upsert: true, new: true },
    );

    await Shop.findOneAndUpdate(
      { _id: oid("shop-" + i) },
      {
        _id: oid("shop-" + i),
        owner_id: keepers[i % 5]._id,
        category_id: oid("category-0"),
        name: shopNames[i],
        description: [
          "Everyday essentials from your trusted neighbourhood shop.",
          "Fresh produce, dairy and a friendly face.",
          "Your favourite groceries, all in one place.",
        ][i % 3],
        address_id: shopAddr._id,
        address: addrText,
        latitude: lat,
        longitude: lng,
        delivery_radius_km: i === 9 ? 1 : 10,
        open_time: "08:00",
        close_time: "21:00",
        status: i === 7 ? "CLOSED" : "OPEN",
        approval_status: i === 8 ? "PENDING" : "APPROVED",
        phone: "9876543210",
      },
      { upsert: true, new: true },
    );
  }

  // Create products & product images
  for (let i = 0; i < shopNames.length; i++) {
    for (let j = 0; j < catalog.length; j++) {
      const [name, brand, unit, price, cat] = catalog[j];
      const prod = await Product.findOneAndUpdate(
        { _id: oid(`product-${i}-${j}`) },
        {
          _id: oid(`product-${i}-${j}`),
          shop_id: oid("shop-" + i),
          category_id: oid("category-" + cat),
          name,
          brand,
          unit,
          description: `${name} ${unit}, available at your neighbourhood shop.`,
          price: (price as number) + (i === 2 ? -1 : i % 4),
          stock_quantity: i === 3 && j === 0 ? 0 : 50 + i * 3,
          is_active: true,
        },
        { upsert: true, new: true },
      );

      await ProductImage.findOneAndUpdate(
        { product_id: prod._id, is_primary: true },
        {
          _id: oid(`product-image-${i}-${j}`),
          product_id: prod._id,
          image_url: `/product-placeholder.png`,
          is_primary: true,
        },
        { upsert: true, new: true },
      );
    }
  }

  // Create addresses for customers
  for (let ci = 0; ci < customers.length; ci++) {
    const c = customers[ci];
    let addr = await Address.findOne({ user_id: c._id, label: "Home" });
    if (!addr) {
      addr = await Address.create({
        user_id: c._id,
        label: "Home",
        full_address: `${24 + ci} 12th Cross, Indiranagar`,
        latitude: 12.9784,
        longitude: 77.6408,
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560038",
        is_default: true,
      });
    }

    // Shopping lists
    let list = await ShoppingList.findOne({ _id: oid("list-" + ci) });
    if (!list) {
      list = await ShoppingList.create({
        _id: oid("list-" + ci),
        user_id: c._id,
        name: ci ? "Sunday breakfast" : "Monthly essentials",
      });
    }

    // Shopping list items
    const items = catalog.slice(0, ci ? 3 : 6);
    for (let j = 0; j < items.length; j++) {
      const [name, , unit] = items[j];
      await ShoppingListItem.findOneAndUpdate(
        { _id: oid(`list-item-${ci}-${j}`) },
        {
          _id: oid(`list-item-${ci}-${j}`),
          list_id: list._id,
          product_id: oid(`product-0-${j}`),
          name,
          unit,
          quantity: j === 1 ? 2 : 1,
        },
        { upsert: true, new: true },
      );
    }

    // Chat rooms and messages
    let room = await ChatRoom.findOne({
      customer_id: c._id,
      shop_id: oid("shop-0"),
    });
    if (!room) {
      room = await ChatRoom.create({
        customer_id: c._id,
        shop_id: oid("shop-0"),
      });
    }

    const msgCount = await ChatMessage.countDocuments({ chat_room_id: room._id });
    if (msgCount === 0) {
      await ChatMessage.create({
        chat_room_id: room._id,
        sender_id: c._id,
        message: "Hi! Could you prepare these for me?",
        message_type: "PRODUCT_LIST",
        payload: {
          id: list._id.toString(),
          name: list.name,
          items: items.map(([name, , unit], j) => ({
            name,
            quantity: j === 1 ? 2 : 1,
            unit,
            product_id: oid(`product-0-${j}`).toString(),
          })),
        },
      });
      await ChatMessage.create({
        chat_room_id: room._id,
        sender_id: keepers[0]._id,
        message: "Of course! Everything is available. Happy to help.",
        message_type: "TEXT",
        payload: {},
      });
    }

    // Orders
    for (let n = 0; n < 2; n++) {
      const requestKey = uid(`order-request-${ci}-${n}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let order: any = await Order.findOne({
        customer_id: c._id,
        request_key: requestKey,
      });
      if (!order) {
        const total = 28 + 55 * 2; // 1 salt + 2 milk
        order = await Order.create({
          order_number: generateOrderNumber(),
          customer_id: c._id,
          shop_id: oid("shop-0"),
          address_id: addr._id,
          delivery_address: {
            label: addr.label,
            full_address: addr.full_address,
            latitude: addr.latitude,
            longitude: addr.longitude,
            city: addr.city,
            state: addr.state,
            pincode: addr.pincode,
          },
          total_amount: total,
          notes: "Please call at the gate.",
          request_key: requestKey,
        });
        await OrderItem.create({
          order_id: order._id,
          product_id: oid("product-0-0"),
          product_name: "Tata Salt 1 kg",
          unit_price: 28,
          quantity: 1,
          total_price: 28,
        });
        await OrderItem.create({
          order_id: order._id,
          product_id: oid("product-0-1"),
          product_name: "Milk 1 L",
          unit_price: 55,
          quantity: 2,
          total_price: 110,
        });
        await OrderTracking.create({
          order_id: order._id,
          status: "PLACED",
          updated_by: c._id,
        });
      }

      // Transition orders
      const stages = [
        "PLACED",
        "ACCEPTED",
        "PREPARING",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
      ];
      const end = n === 0 ? 4 : 3;
      const currentIdx = stages.indexOf(order.status);
      for (let step = currentIdx + 1; step <= end; step++) {
        order.status = stages[step] as typeof order.status;
        await order.save();
        await OrderTracking.create({
          order_id: order._id,
          status: stages[step],
          updated_by: keepers[0]._id,
        });
      }

      // Reviews for delivered orders
      if (n === 0 && order.status === "DELIVERED") {
        const existing = await Review.findOne({ order_id: order._id });
        if (!existing) {
          await Review.create({
            order_id: order._id,
            customer_id: c._id,
            shop_id: oid("shop-0"),
            rating: ci ? 4 : 5,
            comment: "Friendly service and everything arrived fresh.",
          });
        }
      }
    }

    // Complaints
    await Complaint.findOneAndUpdate(
      { user_id: c._id, subject: "Delivery inquiry" },
      {
        _id: oid("complaint-" + ci),
        user_id: c._id,
        shop_id: oid("shop-0"),
        order_id: null,
        subject: "Delivery inquiry",
        description: "Checked on order delivery status, shop responded promptly.",
        status: ci === 0 ? "RESOLVED" : "OPEN",
      },
      { upsert: true, new: true },
    );
  }

  // Create platform settings
  const settingsCount = await PlatformSettings.countDocuments();
  if (settingsCount === 0) {
    await PlatformSettings.create({});
  }

  console.log(
    "Seeded 5 shopkeepers, 10 shops, 8 categories, 60 products, 2 customers, 4 orders, reviews, chats and shopping lists.",
  );
  console.log(
    "Development logins: shopkeeper1@localkart.test, aarav@localkart.test, admin@localkart.test. Use your configured SEED_PASSWORD.",
  );
  await mongoose.disconnect();
}

void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
