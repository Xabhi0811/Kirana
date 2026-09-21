import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
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
  AuditLog,
  PlatformSettings,
  distanceKm,
  categoryContains,
  ensurePlatformSettings,
} from "@/lib/models";
import type { IUser } from "@/lib/models";
import * as v from "@/lib/validation";
import type { Profile, Role } from "@/lib/types";
import {
  hashPassword,
  verifyPassword,
  setAuthCookie,
  getAuthUserId,
  clearAuthCookie,
} from "@/lib/auth-utils";
import {
  isDuplicateKeyError,
  mongoErrorMessage,
} from "@/lib/service-errors";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

type Context = { params: Promise<{ path: string[] }> };
class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

async function limitedBody(
  request: NextRequest,
  max: number,
): Promise<ArrayBuffer> {
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new HttpError("Request too large. Images must be under 4 MB.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

async function jsonBody(request: NextRequest) {
  return z
    .record(z.string(), z.unknown())
    .parse(
      JSON.parse(
        new TextDecoder().decode(await limitedBody(request, 100 * 1024)),
      ),
    );
}

const ok = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

function toId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id) && new mongoose.Types.ObjectId(id).toString() === id;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function docToPlain(doc: any): Record<string, any> {
  if (!doc) return doc;
  const raw = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const obj: Record<string, any> = { ...raw };
  if (obj._id) {
    obj.id = String(obj._id);
    delete obj._id;
  }
  delete obj.__v;
  delete obj.password_hash;
  return obj;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function docsToPlain(docs: any[]): Record<string, any>[] {
  return (docs || []).map(docToPlain);
}

async function actor(roles?: Role[]): Promise<Profile> {
  const userId = await getAuthUserId();
  if (!userId) throw new HttpError("Please sign in to continue.", 401);
  const user = await User.findById(userId)
    .select("name email phone role avatar_url status")
    .lean();
  if (!user) throw new HttpError("Please sign in to continue.", 401);
  if (user.status === "SUSPENDED")
    throw new HttpError(
      "Your account is suspended. Contact customer support.",
      403,
    );
  const p: Profile = {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    avatar_url: user.avatar_url,
    status: user.status,
  };
  if (p.status !== "ACTIVE" || (roles && !roles.includes(p.role)))
    throw new HttpError("You do not have access to this page.", 403);
  return p;
}

function search(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  return v.searchSchema.parse({
    latitude: p.get("lat"),
    longitude: p.get("lng"),
    q: p.get("q") || "",
    category: p.get("category") || null,
    in_stock: p.get("in_stock") === "true",
    open_only: p.get("open_only") === "true",
    sort_by: p.get("sort") || "distance",
    page: p.get("page") || 0,
    shop: p.get("shop") || null,
    unit: p.get("unit") || null,
    brand: p.get("brand") || null,
  });
}

// ---- Discovery helpers ----

async function ownsShop(userId: string, shopId: string): Promise<boolean> {
  const shop = await Shop.findOne({
    _id: toId(shopId),
    owner_id: toId(userId),
    approval_status: { $ne: "SUSPENDED" },
  })
    .select("_id")
    .lean();
  return !!shop;
}

async function shopVisible(shopId: string): Promise<boolean> {
  const shop = await Shop.findOne({
    _id: toId(shopId),
    approval_status: "APPROVED",
    status: { $ne: "INACTIVE" },
  })
    .select("owner_id")
    .lean();
  if (!shop) return false;
  const owner = await User.findOne({
    _id: shop.owner_id,
    status: "ACTIVE",
  })
    .select("_id")
    .lean();
  return !!owner;
}

async function inChat(userId: string, roomId: string): Promise<boolean> {
  const room = await ChatRoom.findById(roomId).lean();
  if (!room) return false;
  if (room.customer_id.toString() === userId) return true;
  return ownsShop(userId, room.shop_id.toString());
}

async function canReadOrder(userId: string, orderId: string, userRole: string): Promise<boolean> {
  const order = await Order.findById(orderId).select("customer_id shop_id").lean();
  if (!order) return false;
  if (order.customer_id.toString() === userId) return true;
  if (userRole === "ADMIN") return true;
  return ownsShop(userId, order.shop_id.toString());
}

async function discoverShops(params: {
  lat: number;
  lng: number;
  q?: string;
  category?: string | null;
  open_only?: boolean;
  sort_by?: string;
  page?: number;
  shop?: string | null;
}) {
  const { lat, lng, q = "", category = null, open_only = false, sort_by = "distance", page = 0 } = params;
  const shopFilter = params.shop;
  
  // Build query
  const query: Record<string, unknown> = {
    approval_status: "APPROVED",
    status: { $ne: "INACTIVE" },
    latitude: { $gte: lat - 50.0 / 111, $lte: lat + 50.0 / 111 },
  };
  if (shopFilter) query._id = toId(shopFilter);
  if (q) query.name = { $regex: q.slice(0, 100), $options: "i" };
  if (open_only) query.status = "OPEN";

  const shops = await Shop.find(query).lean();

  // Filter by active owner
  const ownerIds = [...new Set(shops.map((s) => s.owner_id.toString()))];
  const activeOwners = new Set(
    (
      await User.find({ _id: { $in: ownerIds.map(toId) }, status: "ACTIVE" })
        .select("_id")
        .lean()
    ).map((u) => u._id.toString()),
  );

  let results = shops.filter((s) => activeOwners.has(s.owner_id.toString()));

  // Category filter (with hierarchy)
  if (category) {
    const filtered = [];
    for (const s of results) {
      if (await categoryContains(category, s.category_id.toString())) {
        filtered.push(s);
      }
    }
    results = filtered;
  }

  // Compute distance, rating, product_count
  const enriched = await Promise.all(
    results.map(async (s) => {
      const d = distanceKm(lat, lng, s.latitude, s.longitude);
      if (d > Number(s.delivery_radius_km)) return null;
      const reviews = await Review.find({ shop_id: s._id }).select("rating").lean();
      const r = reviews.length > 0
        ? Math.round((reviews.reduce((sum, rv) => sum + rv.rating, 0) / reviews.length) * 100) / 100
        : 0;
      const pc = await Product.countDocuments({ shop_id: s._id, is_active: true });
      return {
        id: s._id.toString(),
        name: s.name,
        description: s.description,
        logo_url: s.logo_url,
        category_id: s.category_id.toString(),
        address: s.address,
        latitude: s.latitude,
        longitude: s.longitude,
        delivery_radius_km: Number(s.delivery_radius_km),
        status: s.status,
        open_time: s.open_time,
        close_time: s.close_time,
        distance: d,
        rating: r,
        product_count: pc,
      };
    }),
  );

  let sorted = enriched.filter(Boolean) as NonNullable<(typeof enriched)[0]>[];
  if (sort_by === "rating") sorted.sort((a, b) => (b!.rating - a!.rating) || (a!.distance - b!.distance));
  else if (sort_by === "name") sorted.sort((a, b) => a!.name.localeCompare(b!.name) || (a!.distance - b!.distance));
  else sorted.sort((a, b) => (a!.distance - b!.distance));

  const start = Math.max(0, Math.min(page, 10000)) * 24;
  return sorted.slice(start, start + 24);
}

async function discoverProducts(params: {
  lat: number;
  lng: number;
  q?: string;
  category?: string | null;
  in_stock?: boolean;
  open_only?: boolean;
  sort_by?: string;
  page?: number;
  shop?: string | null;
  unit_filter?: string | null;
  brand_filter?: string | null;
}) {
  const { lat, lng, q = "", category = null, in_stock = false, open_only = false, sort_by = "price", page = 0 } = params;
  const shopFilter = params.shop;

  // First get eligible shops
  const shopQuery: Record<string, unknown> = {
    approval_status: "APPROVED",
    status: { $ne: "INACTIVE" },
    latitude: { $gte: lat - 50.0 / 111, $lte: lat + 50.0 / 111 },
  };
  if (shopFilter) shopQuery._id = toId(shopFilter);
  if (open_only) shopQuery.status = "OPEN";

  const shops = await Shop.find(shopQuery).lean();
  const ownerIds = [...new Set(shops.map((s) => s.owner_id.toString()))];
  const activeOwners = new Set(
    (
      await User.find({ _id: { $in: ownerIds.map(toId) }, status: "ACTIVE" })
        .select("_id")
        .lean()
    ).map((u) => u._id.toString()),
  );

  const eligibleShops = shops.filter((s) => {
    if (!activeOwners.has(s.owner_id.toString())) return false;
    const d = distanceKm(lat, lng, s.latitude, s.longitude);
    return d <= Number(s.delivery_radius_km);
  });

  const shopMap = new Map(eligibleShops.map((s) => [s._id.toString(), s]));
  const shopIds = eligibleShops.map((s) => s._id);

  // Build product query
  const prodQuery: Record<string, unknown> = {
    shop_id: { $in: shopIds },
    is_active: true,
  };
  if (q) prodQuery.name = { $regex: q.slice(0, 100), $options: "i" };
  if (in_stock) prodQuery.stock_quantity = { $gt: 0 };
  if (params.unit_filter) prodQuery.unit = { $regex: `^${params.unit_filter}$`, $options: "i" };
  if (params.brand_filter) prodQuery.brand = { $regex: `^${params.brand_filter}$`, $options: "i" };

  let products = await Product.find(prodQuery).lean();

  // Category filter
  if (category) {
    const filtered = [];
    for (const p of products) {
      if (await categoryContains(category, p.category_id.toString())) {
        filtered.push(p);
      }
    }
    products = filtered;
  }

  // Get shop ratings
  const ratingMap = new Map<string, number>();
  for (const sid of shopIds) {
    const reviews = await Review.find({ shop_id: sid }).select("rating").lean();
    ratingMap.set(
      sid.toString(),
      reviews.length > 0
        ? Math.round((reviews.reduce((sum, rv) => sum + rv.rating, 0) / reviews.length) * 100) / 100
        : 0,
    );
  }

  const enriched = products.map((p) => {
    const s = shopMap.get(p.shop_id.toString())!;
    const d = distanceKm(lat, lng, s.latitude, s.longitude);
    return {
      id: p._id.toString(),
      shop_id: p.shop_id.toString(),
      category_id: p.category_id.toString(),
      name: p.name,
      description: p.description,
      brand: p.brand,
      unit: p.unit,
      price: Number(p.price),
      stock_quantity: p.stock_quantity,
      image_url: p.image_url,
      shop_name: s.name,
      shop_status: s.status,
      distance: d,
      rating: ratingMap.get(s._id.toString()) || 0,
    };
  });

  if (sort_by === "price") enriched.sort((a, b) => a.price - b.price || a.distance - b.distance);
  else if (sort_by === "rating") enriched.sort((a, b) => b.rating - a.rating || a.distance - b.distance);
  else if (sort_by === "name") enriched.sort((a, b) => a.name.localeCompare(b.name) || a.distance - b.distance);
  else enriched.sort((a, b) => a.distance - b.distance);

  const start = Math.max(0, Math.min(page, 10000)) * 24;
  return enriched.slice(start, start + 24);
}

// ---- Audit logging helper ----
async function auditLog(
  actorId: string,
  resource: string,
  resourceId: string,
  action: string,
  changes?: Record<string, unknown>,
) {
  try {
    await AuditLog.create({
      actor_id: toId(actorId),
      resource,
      resource_id: toId(resourceId),
      action,
      changes: changes || null,
    });
  } catch {
    // Audit logging should not block operations
  }
}

// ---- Main handler ----

async function execute(request: NextRequest, context: Context) {
  await connectDB();
  const path = (await context.params).path,
    [resource, target, action] = path,
    method = request.method;
  if (path.length > 3) throw new HttpError("Endpoint not found.", 404);
  if (method !== "GET" && method !== "POST") {
    const deletion =
      method === "DELETE" &&
      (( ["addresses", "lists", "list-items", "reviews"].includes(resource) &&
        !!target &&
        !action) ||
        (resource === "manage" &&
          ["products", "categories"].includes(target) &&
          !!action));
    const patch =
      method === "PATCH" && resource === "platform-settings" && !target;
    if (!deletion && !patch) throw new HttpError("Method not allowed.", 405);
  }

  if (method === "GET") {
    const page = z.coerce
        .number()
        .int()
        .min(0)
        .max(10000)
        .parse(request.nextUrl.searchParams.get("page") || 0),
      start = page * 24;

    if (resource === "categories") {
      const cats = await Category.find()
        .sort({ name: 1 })
        .skip(start)
        .limit(100)
      return ok(docsToPlain(cats));
    }

    if (resource === "platform-settings") {
      const settings = await ensurePlatformSettings();
      return ok({
        marketplace_name: settings.marketplace_name,
        support_email: settings.support_email,
        announcement: settings.announcement,
        updated_at: settings.updated_at,
      });
    }

    if (resource === "search") {
      if (
        !request.nextUrl.searchParams.has("lat") ||
        !request.nextUrl.searchParams.has("lng")
      )
        throw new HttpError(
          "Set your location to find shops that deliver to you.",
        );
      const s = search(request);
      if (target === "shops") {
        return ok(
          await discoverShops({
            lat: s.latitude,
            lng: s.longitude,
            q: s.q,
            category: s.category,
            open_only: s.open_only,
            sort_by: s.sort_by,
            page: s.page,
          }),
        );
      }
      return ok(
        await discoverProducts({
          lat: s.latitude,
          lng: s.longitude,
          q: s.q,
          category: s.category,
          in_stock: s.in_stock,
          open_only: s.open_only,
          sort_by: s.sort_by,
          page: s.page,
          shop: s.shop,
          unit_filter: s.unit,
          brand_filter: s.brand,
        }),
      );
    }

    if (resource === "shops" && target) {
      if (!isValidObjectId(target)) throw new HttpError("Invalid shop ID.", 400);
      const s = search(request);
      const shop = await Shop.findById(target).lean();
      if (!shop) throw new HttpError("The requested record was not found.", 404);
      const activeOwner = await User.findOne({
        _id: shop.owner_id,
        status: "ACTIVE",
      }).lean();
      if (
        !activeOwner ||
        shop.approval_status !== "APPROVED" ||
        shop.status === "INACTIVE"
      )
        throw new HttpError("The requested record was not found.", 404);
      const results = await discoverShops({
        lat: s.latitude,
        lng: s.longitude,
        shop: target,
      });
      const match = results?.[0];
      if (!match)
        throw new HttpError(
          "This shop does not deliver to your selected location.",
          403,
        );
      return ok({ ...docToPlain(shop), ...match });
    }

    if (resource === "products" && target) {
      if (!isValidObjectId(target)) throw new HttpError("Invalid product ID.", 400);
      const s = search(request);
      const p = await Product.findById(target).lean();
      if (!p) throw new HttpError("The requested record was not found.", 404);
      const results = await discoverShops({
        lat: s.latitude,
        lng: s.longitude,
        shop: p.shop_id.toString(),
      });
      const eligibleShop = results?.[0];
      if (!eligibleShop || !p.is_active)
        throw new HttpError(
          "This product is unavailable at your location.",
          404,
        );
      return ok({
        ...docToPlain(p),
        shop_name: eligibleShop.name,
        shop_status: eligibleShop.status,
        distance: eligibleShop.distance,
        rating: eligibleShop.rating,
      });
    }

    if (resource === "shop-reviews") {
      if (!isValidObjectId(target)) throw new HttpError("Invalid shop ID.", 400);
      const reviews = await Review.find({ shop_id: toId(target) })
        .sort({ created_at: -1 })
        .skip(start)
        .limit(24)
        .lean();
      return ok(docsToPlain(reviews));
    }

    const p = await actor();
    if (resource === "profile") return ok(p);

    if (resource === "addresses") {
      const addrs = await Address.find({ user_id: toId(p.id) })
        .sort({ is_default: -1 })
        .lean();
      return ok(docsToPlain(addrs));
    }

    if (resource === "lists") {
      const lists = await ShoppingList.find({ user_id: toId(p.id) })
        .sort({ updated_at: -1 })
        .skip(start)
        .limit(24)
        .lean();
      const result = await Promise.all(
        lists.map(async (list) => {
          const items = await ShoppingListItem.find({ list_id: list._id }).lean();
          return {
            ...docToPlain(list),
            shopping_list_items: docsToPlain(items),
          };
        }),
      );
      return ok(result);
    }

    if (resource === "orders") {
      if (target) {
        if (!isValidObjectId(target)) throw new HttpError("Invalid order ID.", 400);
        const order = await Order.findById(target).lean();
        if (!order) throw new HttpError("The requested record was not found.", 404);
        const shop = await Shop.findById(order.shop_id).select("name").lean();
        const orderItems = await OrderItem.find({ order_id: order._id }).lean();
        const tracking = await OrderTracking.find({ order_id: order._id }).lean();
        return ok({
          ...docToPlain(order),
          shops: { name: shop?.name || "Unknown" },
          order_items: docsToPlain(orderItems),
          order_tracking: docsToPlain(tracking),
        });
      }
      const orders = await Order.find({
        $or: [
          { customer_id: toId(p.id) },
          ...(p.role === "ADMIN" ? [{}] : []),
        ],
      })
        .sort({ created_at: -1 })
        .skip(start)
        .limit(24)
        .lean();

      // For shopkeepers, also include orders to their shops
      let finalOrders = orders;
      if (p.role === "SHOPKEEPER") {
        const shopIds = (
          await Shop.find({ owner_id: toId(p.id) })
            .select("_id")
            .lean()
        ).map((s) => s._id);
        finalOrders = await Order.find({
          $or: [
            { customer_id: toId(p.id) },
            { shop_id: { $in: shopIds } },
          ],
        })
          .sort({ created_at: -1 })
          .skip(start)
          .limit(24)
          .lean();
      }

      const result = await Promise.all(
        finalOrders.map(async (order) => {
          const shop = await Shop.findById(order.shop_id).select("name").lean();
          const orderItems = await OrderItem.find({ order_id: order._id }).lean();
          const tracking = await OrderTracking.find({ order_id: order._id }).lean();
          return {
            ...docToPlain(order),
            shops: { name: shop?.name || "Unknown" },
            order_items: docsToPlain(orderItems),
            order_tracking: docsToPlain(tracking),
          };
        }),
      );
      return ok(result);
    }

    if (resource === "chat") {
      if (target && action === "messages") {
        if (!isValidObjectId(target)) throw new HttpError("Invalid room ID.", 400);
        if (!(await inChat(p.id, target)))
          throw new HttpError("Private chat access denied.", 403);
        const messages = await ChatMessage.find({ chat_room_id: toId(target) })
          .sort({ created_at: -1 })
          .skip(page * 50)
          .limit(50)
          .lean();
        return ok(docsToPlain(messages));
      }
      // Chat summaries
      const rooms = await ChatRoom.find({
        $or: [
          { customer_id: toId(p.id) },
          ...(p.role === "SHOPKEEPER"
            ? [
                {
                  shop_id: {
                    $in: (
                      await Shop.find({ owner_id: toId(p.id) })
                        .select("_id")
                        .lean()
                    ).map((s) => s._id),
                  },
                },
              ]
            : []),
        ],
      })
        .sort({ updated_at: -1 })
        .limit(100)
        .lean();

      const summaries = await Promise.all(
        rooms.map(async (r) => {
          const shop = await Shop.findById(r.shop_id).select("name").lean();
          const customer = await User.findById(r.customer_id).select("name").lean();
          const unread = await ChatMessage.countDocuments({
            chat_room_id: r._id,
            sender_id: { $ne: toId(p.id) },
            is_read: false,
          });
          return {
            id: r._id.toString(),
            shop_id: r.shop_id.toString(),
            shop_name: shop?.name || "Unknown",
            customer_name: customer?.name || "Unknown",
            unread,
            updated_at: r.updated_at,
          };
        }),
      );
      return ok(summaries);
    }

    if (resource === "reviews") {
      let query: Record<string, unknown> = {};
      if (p.role === "CUSTOMER") query = { customer_id: toId(p.id) };
      if (p.role === "SHOPKEEPER") {
        const shopIds = (
          await Shop.find({ owner_id: toId(p.id) }).select("_id").lean()
        ).map((s) => s._id);
        query = { shop_id: { $in: shopIds } };
      }
      const reviews = await Review.find(query)
        .sort({ created_at: -1 })
        .skip(start)
        .limit(24)
      return ok(docsToPlain(reviews));
    }

    if (resource === "complaints") {
      const query: Record<string, unknown> =
        p.role === "ADMIN" ? {} : { user_id: toId(p.id) };
      const complaints = await Complaint.find(query)
        .sort({ created_at: -1 })
        .skip(start)
        .limit(24)
        .lean();
      return ok(docsToPlain(complaints));
    }

    if (resource === "stats") {
      await actor(["SHOPKEEPER", "ADMIN"]);
      if (p.role === "ADMIN") {
        const [customers, shopkeepers, shopCount, pendingShops, productCount, orderCount, completedOrders, openComplaints, orderValue] =
          await Promise.all([
            User.countDocuments({ role: "CUSTOMER" }),
            User.countDocuments({ role: "SHOPKEEPER" }),
            Shop.countDocuments(),
            Shop.countDocuments({ approval_status: "PENDING" }),
            Product.countDocuments({ is_active: true }),
            Order.countDocuments(),
            Order.countDocuments({ status: "DELIVERED" }),
            Complaint.countDocuments({ status: { $ne: "RESOLVED" } }),
            Order.aggregate([
              { $match: { status: "DELIVERED" } },
              { $group: { _id: null, total: { $sum: "$total_amount" } } },
            ]),
          ]);
        return ok({
          Customers: customers,
          Shopkeepers: shopkeepers,
          Shops: shopCount,
          "Pending shops": pendingShops,
          Products: productCount,
          Orders: orderCount,
          "Completed orders": completedOrders,
          "Open complaints": openComplaints,
          "Order value": orderValue[0]?.total || 0,
        });
      }
      // Shopkeeper stats
      const shopIds = (
        await Shop.find({ owner_id: toId(p.id) }).select("_id").lean()
      ).map((s) => s._id);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [todayOrders, pendingOrders, completedOrders, productCount, lowStock, unreadChats, avgRating] =
        await Promise.all([
          Order.countDocuments({ shop_id: { $in: shopIds }, created_at: { $gte: today } }),
          Order.countDocuments({ shop_id: { $in: shopIds }, status: "PLACED" }),
          Order.countDocuments({ shop_id: { $in: shopIds }, status: "DELIVERED" }),
          Product.countDocuments({ shop_id: { $in: shopIds }, is_active: true }),
          Product.countDocuments({ shop_id: { $in: shopIds }, stock_quantity: { $lt: 5 }, is_active: true }),
          ChatMessage.countDocuments({
            chat_room_id: {
              $in: (
                await ChatRoom.find({ shop_id: { $in: shopIds } })
                  .select("_id")
                  .lean()
              ).map((r) => r._id),
            },
            sender_id: { $ne: toId(p.id) },
            is_read: false,
          }),
          Review.aggregate([
            { $match: { shop_id: { $in: shopIds } } },
            { $group: { _id: null, avg: { $avg: "$rating" } } },
          ]),
        ]);
      return ok({
        "Today's orders": todayOrders,
        "Pending orders": pendingOrders,
        "Completed orders": completedOrders,
        Products: productCount,
        "Low stock": lowStock,
        "Unread chats": unreadChats,
        Rating: avgRating[0]?.avg || 0,
      });
    }

    if (resource === "reports") {
      await actor(["ADMIN"]);
      const days = z.coerce
        .number()
        .int()
        .min(1)
        .max(90)
        .parse(request.nextUrl.searchParams.get("days") || 30);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - (days - 1));
      startDate.setHours(0, 0, 0, 0);

      const orders = await Order.find({ created_at: { $gte: startDate } })
        .select("status total_amount created_at")
        .lean();

      const dayMap = new Map<string, { orders: number; delivered: number; cancelled: number; delivered_order_value: number }>();
      for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dayMap.set(d.toISOString().slice(0, 10), { orders: 0, delivered: 0, cancelled: 0, delivered_order_value: 0 });
      }
      for (const o of orders) {
        const day = o.created_at.toISOString().slice(0, 10);
        const entry = dayMap.get(day);
        if (entry) {
          entry.orders++;
          if (o.status === "DELIVERED") {
            entry.delivered++;
            entry.delivered_order_value += Number(o.total_amount);
          }
          if (o.status === "CANCELLED") entry.cancelled++;
        }
      }
      const report = [...dayMap.entries()]
        .map(([day, data]) => ({ day, ...data }))
        .sort((a, b) => b.day.localeCompare(a.day));
      return ok(report);
    }

    if (resource === "manage") {
      await actor(["SHOPKEEPER", "ADMIN"]);
      if (
        !["shops", "products", "users", "categories", "audit_logs"].includes(target)
      )
        throw new HttpError("Not found", 404);
      if (
        ["users", "categories", "audit_logs"].includes(target) &&
        p.role !== "ADMIN"
      )
        throw new HttpError("Administrator access required.", 403);

      if (target === "shops") {
        const query: Record<string, unknown> =
          p.role === "SHOPKEEPER" ? { owner_id: toId(p.id) } : {};
        const shops = await Shop.find(query)
          .sort({ created_at: -1 })
          .skip(start)
          .limit(24)
          .lean();
        return ok(docsToPlain(shops));
      }
      if (target === "products") {
        let query: Record<string, unknown> = {};
        if (p.role === "SHOPKEEPER") {
          const shopIds = (
            await Shop.find({ owner_id: toId(p.id) }).select("_id").lean()
          ).map((s) => s._id);
          query = { shop_id: { $in: shopIds } };
        }
        const products = await Product.find(query)
          .sort({ created_at: -1 })
          .skip(start)
          .limit(24)
          .lean();
        return ok(docsToPlain(products));
      }
      if (target === "users") {
        const users = await User.find()
          .select("-password_hash")
          .sort({ created_at: -1 })
          .skip(start)
          .limit(24)
          .lean();
        return ok(docsToPlain(users));
      }
      if (target === "categories") {
        const cats = await Category.find()
          .sort({ name: 1 })
          .skip(start)
          .limit(24)
          .lean();
        return ok(docsToPlain(cats));
      }
      if (target === "audit_logs") {
        const logs = await AuditLog.find()
          .sort({ created_at: -1 })
          .skip(start)
          .limit(24)
          .lean();
        return ok(docsToPlain(logs));
      }
    }
    throw new HttpError("Page not found.", 404);
  }

  // Cookie authenticated mutations require a same-origin request.
  const origin = request.headers.get("origin");
  const allowed = [
    request.nextUrl.origin,
    process.env.NEXT_PUBLIC_SITE_URL,
  ].filter(Boolean);
  if (
    (origin && !allowed.includes(origin)) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new HttpError("Request origin denied.", 403);

  // ---- AUTH ENDPOINTS ----
  if (resource === "auth") {
    if (method !== "POST") throw new HttpError("Method not allowed.", 405);
    const body = await jsonBody(request);

    if (target === "register") {
      const data = v.registerSchema.parse(body);
      const existing = await User.findOne({ email: data.email.toLowerCase() })
        .select("_id")
        .lean();
      if (existing)
        throw new HttpError(
          "An account with this email already exists. Try signing in instead.",
          409,
        );
      const hashed = await hashPassword(data.password);
      const user = await User.create({
        name: data.name,
        email: data.email.toLowerCase(),
        phone: data.phone,
        role: data.role,
        password_hash: hashed,
      });
      await setAuthCookie(user._id.toString());
      return ok({
        success: true,
        message: "Account created successfully.",
      });
    }

    if (target === "login") {
      const data = z
        .object({ email: z.email(), password: z.string().min(1).max(128) })
        .parse(body);
      const user = await User.findOne({ email: data.email.toLowerCase() }).lean();
      if (!user)
        throw new HttpError(
          "Incorrect email or password. Check your credentials and try again.",
          401,
        );
      if (!user.password_hash) {
        throw new HttpError(
          "This account is signed in with Google. Please use Continue with Google to sign in.",
          400,
        );
      }
      const valid = await verifyPassword(data.password, user.password_hash);
      if (!valid)
        throw new HttpError(
          "Incorrect email or password. Check your credentials and try again.",
          401,
        );
      if (user.status !== "ACTIVE")
        throw new HttpError(
          "Your account is suspended. Contact customer support.",
          403,
        );
      await setAuthCookie(user._id.toString());
      const profile: Profile = {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar_url: user.avatar_url,
        status: user.status,
      };
      return ok(profile);
    }

    if (target === "logout") {
      await clearAuthCookie();
      return ok({ success: true });
    }

    if (target === "reset-password") {
      const p = await actor();
      const { password } = z
        .object({ password: v.registerSchema.shape.password })
        .parse(body);
      const hashed = await hashPassword(password);
      await User.findByIdAndUpdate(p.id, { password_hash: hashed });
      return ok({ success: true });
    }

    if (target === "update-email") {
      const p = await actor();
      const { email } = z.object({ email: z.email() }).parse(body);
      const existing = await User.findOne({ email: email.toLowerCase(), _id: { $ne: toId(p.id) } })
        .select("_id")
        .lean();
      if (existing)
        throw new HttpError("An account with this email already exists.", 409);
      await User.findByIdAndUpdate(p.id, { email: email.toLowerCase() });
      return ok({ message: "Email updated successfully." });
    }

    throw new HttpError("Not found", 404);
  }

  const p = await actor();

  // ---- PLATFORM SETTINGS ----
  if (resource === "platform-settings") {
    await actor(["ADMIN"]);
    if (request.method !== "POST" && request.method !== "PATCH")
      throw new HttpError("Method not allowed.", 405);
    const data = v.platformSettingsSchema.parse(await jsonBody(request));
    let settings = await PlatformSettings.findOne();
    if (!settings) {
      settings = await PlatformSettings.create(data);
    } else {
      Object.assign(settings, data, { updated_at: new Date() });
      await settings.save();
    }
    return ok(docToPlain(settings.toObject()));
  }

  // ---- FILE UPLOAD ----
  if (resource === "upload") {
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
      throw new HttpError("Select an image to upload.");
    const form = await new Response(
        await limitedBody(request, 4.25 * 1024 * 1024),
        { headers: { "Content-Type": request.headers.get("content-type")! } },
      ).formData(),
      file = form.get("file"),
      bucket = form.get("bucket");
    if (file instanceof File && file.size > 4 * 1024 * 1024)
      throw new HttpError("Select an image under 4 MB.", 413);
    if (!(file instanceof File) || file.size < 12)
      throw new HttpError("Select an image under 4 MB.");
    if (
      ![
        "avatars",
        "shop-images",
        "product-images",
        "chat-images",
        "category-images",
      ].includes(String(bucket))
    )
      throw new HttpError("Invalid upload destination.");
    if (bucket === "category-images" && p.role !== "ADMIN")
      throw new HttpError("Administrator access required.", 403);
    if (
      ["shop-images", "product-images"].includes(String(bucket)) &&
      p.role !== "SHOPKEEPER"
    )
      throw new HttpError("Shopkeeper access required.", 403);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
        (x, i) => bytes[i] === x,
      ),
      jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
      webp =
        String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
        String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    const mime = png
      ? "image/png"
      : jpeg
        ? "image/jpeg"
        : webp
          ? "image/webp"
          : null;
    if (!mime || mime !== file.type)
      throw new HttpError(
        "Only valid JPEG, PNG and WebP images are supported.",
      );
    try {
      await sharp(bytes, {
        limitInputPixels: 25000000,
        failOn: "error",
      }).stats();
    } catch {
      throw new HttpError(
        "The image is damaged or too large to decode. Choose another image.",
      );
    }
    const ext = png ? "png" : jpeg ? "jpg" : "webp";
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const dir = join(process.cwd(), "public", "uploads", String(bucket), p.id);
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, fileName);
    await writeFile(filePath, bytes);
    const publicUrl = `/uploads/${bucket}/${p.id}/${fileName}`;
    return ok({
      path: `${p.id}/${fileName}`,
      url: bucket === "chat-images" ? null : publicUrl,
    });
  }

  const body = method === "DELETE" ? {} : await jsonBody(request);
  if (target && resource !== "manage") {
    if (!isValidObjectId(target)) throw new HttpError("Invalid ID.", 400);
  }

  // ---- PROFILE ----
  if (resource === "profile") {
    const data = v.profileSchema.parse(body);
    const photo = data.profile_image || data.avatar_url || null;
    const updated = await User.findByIdAndUpdate(
      p.id,
      { name: data.name, phone: data.phone, avatar_url: photo, profile_image: photo },
      { new: true },
    )
      .select("-password_hash")
      .lean();
    if (!updated) throw new HttpError("Profile not found.", 404);
    return ok(docToPlain(updated));
  }

  // ---- ADDRESSES ----
  if (resource === "addresses") {
    if (method === "DELETE") {
      await Address.deleteOne({ _id: toId(target), user_id: toId(p.id) });
      return ok([]);
    }
    const data = v.addressSchema.parse(body);
    if (data.is_default) {
      await Address.updateMany({ user_id: toId(p.id) }, { is_default: false });
    }
    if (target) {
      const addr = await Address.findOneAndUpdate(
        { _id: toId(target), user_id: toId(p.id) },
        data,
        { new: true },
      ).lean();
      if (!addr) throw new HttpError("Address not found.", 404);
      return ok({ id: addr._id.toString() });
    }
    const addr = await Address.create({ ...data, user_id: toId(p.id) });
    return ok({ id: addr._id.toString() });
  }

  // ---- SHOPPING LISTS ----
  if (resource === "lists") {
    if (action === "resolve") {
      const input = z
        .object({
          shop_id: z.string(),
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
        })
        .parse(body);
      const list = await ShoppingList.findOne({
        _id: toId(target),
        user_id: toId(p.id),
      }).lean();
      if (!list) throw new HttpError("Shopping list not found.", 404);
      const items = await ShoppingListItem.find({ list_id: list._id }).lean();
      if (items.length > 100)
        throw new HttpError("Convert lists of at most 100 items at a time.");
      const found = new Map<string, Record<string, unknown> & { quantity: number }>();
      const missing: string[] = [];
      for (const item of items) {
        const results = await discoverProducts({
          lat: input.latitude,
          lng: input.longitude,
          q: item.name,
          shop: input.shop_id,
          open_only: true,
          in_stock: true,
        });
        const product = results.find(
          (x) =>
            x.stock_quantity >= item.quantity &&
            (x.id === item.product_id?.toString() ||
              (x.name.toLowerCase() === item.name.toLowerCase() &&
                (item.unit === "item" ||
                  x.unit.toLowerCase() === item.unit.toLowerCase()))),
        );
        if (product) {
          const quantity =
            (found.get(product.id)?.quantity || 0) + item.quantity;
          if (quantity > product.stock_quantity || quantity > 999)
            missing.push(item.name);
          else found.set(product.id, { ...product, quantity });
        } else missing.push(item.name);
      }
      return ok({ products: [...found.values()], missing });
    }
    if (method === "DELETE") {
      await ShoppingListItem.deleteMany({ list_id: toId(target) });
      await ShoppingList.deleteOne({ _id: toId(target), user_id: toId(p.id) });
      return ok([]);
    }
    const data = z
      .object({ name: z.string().trim().min(1).max(100) })
      .parse(body);
    if (target) {
      const list = await ShoppingList.findOneAndUpdate(
        { _id: toId(target), user_id: toId(p.id) },
        data,
        { new: true },
      ).lean();
      if (!list) throw new HttpError("Shopping list not found.", 404);
      return ok(docToPlain(list));
    }
    const list = await ShoppingList.create({ ...data, user_id: toId(p.id) });
    return ok(docToPlain(list));
  }

  // ---- SHOPPING LIST ITEMS ----
  if (resource === "list-items") {
    if (method === "DELETE") {
      await ShoppingListItem.deleteOne({ _id: toId(target) });
      return ok([]);
    }
    const data = v.listItemSchema.parse(body);
    if (target) {
      const item = await ShoppingListItem.findByIdAndUpdate(target, data, {
        new: true,
      }).lean();
      if (!item) throw new HttpError("Item not found.", 404);
      return ok(docToPlain(item));
    }
    const item = await ShoppingListItem.create(data);
    return ok(docToPlain(item));
  }

  // ---- ORDERS ----
  if (resource === "orders") {
    if (target) {
      // Status transition
      const data = z
        .object({
          status: z.enum([
            "ACCEPTED",
            "PREPARING",
            "OUT_FOR_DELIVERY",
            "DELIVERED",
            "CANCELLED",
          ]),
          note: z.string().max(1000).default(""),
        })
        .parse(body);

      const order = await Order.findById(target);
      if (!order) throw new HttpError("Order not found.", 404);

      let permitted = false;
      if (
        data.status === "CANCELLED" &&
        ["PLACED", "ACCEPTED"].includes(order.status) &&
        order.customer_id.toString() === p.id &&
        p.role === "CUSTOMER"
      )
        permitted = true;
      else if (
        (await ownsShop(p.id, order.shop_id.toString())) ||
        p.role === "ADMIN"
      ) {
        permitted =
          (order.status === "PLACED" &&
            ["ACCEPTED", "CANCELLED"].includes(data.status)) ||
          (order.status === "ACCEPTED" &&
            ["PREPARING", "CANCELLED"].includes(data.status)) ||
          (order.status === "PREPARING" &&
            data.status === "OUT_FOR_DELIVERY") ||
          (order.status === "OUT_FOR_DELIVERY" &&
            data.status === "DELIVERED");
      }
      if (!permitted)
        throw new HttpError(
          "Unauthorized or invalid order status transition",
        );

      // If cancelling, restore stock
      if (data.status === "CANCELLED") {
        const items = await OrderItem.find({ order_id: order._id }).lean();
        for (const item of items) {
          await Product.findByIdAndUpdate(item.product_id, {
            $inc: { stock_quantity: item.quantity },
          });
        }
      }

      order.status = data.status;
      await order.save();
      await OrderTracking.create({
        order_id: order._id,
        status: data.status,
        note: data.note.slice(0, 1000),
        updated_by: toId(p.id),
      });
      await auditLog(p.id, "orders", target, "UPDATE", { status: data.status });
      return ok({ success: true });
    }

    // Place order
    const data = v.orderSchema.parse(body);

    // Check for duplicate request
    const existingOrder = await Order.findOne({
      customer_id: toId(p.id),
      request_key: data.request_id,
    })
      .select("_id")
      .lean();
    if (existingOrder) return ok({ id: existingOrder._id.toString() }, 201);

    const shop = await Shop.findById(data.shop_id).lean();
    if (!shop || shop.approval_status !== "APPROVED" || !(await shopVisible(data.shop_id)))
      throw new HttpError("Shop unavailable");
    if (shop.status !== "OPEN") throw new HttpError("Shop is currently closed");

    const addr = await Address.findOne({
      _id: toId(data.address_id),
      user_id: toId(p.id),
    }).lean();
    if (!addr) throw new HttpError("Invalid address");
    if (
      distanceKm(addr.latitude, addr.longitude, shop.latitude, shop.longitude) >
      Number(shop.delivery_radius_km)
    )
      throw new HttpError("Shop outside delivery radius");

    // Check products and calculate total
    let total = 0;
    const productSnapshots: {
      product: typeof products[0];
      qty: number;
    }[] = [];
    const products = await Product.find({
      _id: { $in: data.items.map((i) => toId(i.product_id)) },
    }).lean();
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    for (const item of data.items) {
      const prod = productMap.get(item.product_id);
      if (!prod || prod.shop_id.toString() !== data.shop_id || !prod.is_active)
        throw new HttpError("Product unavailable or belongs to another shop");
      if (prod.stock_quantity < item.quantity)
        throw new HttpError("Product out of stock");
      if (Number(prod.price) !== item.expected_price)
        throw new HttpError("Price changed. Please refresh your cart");
      total += Number(prod.price) * item.quantity;
      productSnapshots.push({ product: prod, qty: item.quantity });
    }

    // Create order
    const deliveryAddr = { ...addr } as Record<string, unknown>;
    delete deliveryAddr.user_id;
    delete deliveryAddr.__v;

    const order = await Order.create({
      customer_id: toId(p.id),
      shop_id: toId(data.shop_id),
      address_id: toId(data.address_id),
      delivery_address: deliveryAddr,
      total_amount: total,
      notes: data.notes.slice(0, 2000),
      request_key: data.request_id,
    });

    // Create order items and deduct stock
    for (const { product: prod, qty } of productSnapshots) {
      await OrderItem.create({
        order_id: order._id,
        product_id: prod._id,
        product_name: `${prod.name} ${prod.unit}`,
        unit_price: Number(prod.price),
        quantity: qty,
        total_price: Number(prod.price) * qty,
      });
      await Product.findByIdAndUpdate(prod._id, {
        $inc: { stock_quantity: -qty },
      });
    }

    await OrderTracking.create({
      order_id: order._id,
      status: "PLACED",
      updated_by: toId(p.id),
    });

    return ok({ id: order._id.toString() }, 201);
  }

  // ---- CHAT ----
  if (resource === "chat") {
    if (action === "read") {
      if (!(await inChat(p.id, target)))
        throw new HttpError("Private chat access denied.");
      await ChatMessage.updateMany(
        {
          chat_room_id: toId(target),
          sender_id: { $ne: toId(p.id) },
          is_read: false,
        },
        { is_read: true },
      );
      return ok({ success: true });
    }
    if (action === "messages") {
      const data = v.messageSchema.parse({ ...body, room_id: target });
      if (!(await inChat(p.id, target)))
        throw new HttpError("Private chat access denied.");
      const room = await ChatRoom.findById(target).lean();
      if (!room) throw new HttpError("Chat room not found.", 404);

      let payload: Record<string, unknown> = {};
      if (data.message_type === "TEXT") {
        if (!data.message.trim())
          throw new HttpError("Enter a message");
      } else if (data.message_type === "PRODUCT") {
        const prod = await Product.findOne({
          _id: data.reference_id ? toId(data.reference_id) : null,
          shop_id: room.shop_id,
          is_active: true,
        }).lean();
        if (!prod) throw new HttpError("Product unavailable");
        payload = {
          id: prod._id.toString(),
          name: prod.name,
          unit: prod.unit,
          price: Number(prod.price),
          stock_quantity: prod.stock_quantity,
          image_url: prod.image_url,
        };
      } else if (data.message_type === "PRODUCT_LIST") {
        const list = await ShoppingList.findOne({
          _id: data.reference_id ? toId(data.reference_id) : null,
          user_id: toId(p.id),
        }).lean();
        if (!list) throw new HttpError("Shopping list not found");
        const items = await ShoppingListItem.find({ list_id: list._id }).lean();
        payload = {
          id: list._id.toString(),
          name: list.name,
          items: items.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            product_id: i.product_id?.toString() || null,
          })),
        };
      } else if (data.message_type === "ORDER") {
        const order = await Order.findOne({
          _id: data.reference_id ? toId(data.reference_id) : null,
          customer_id: room.customer_id,
          shop_id: room.shop_id,
        }).lean();
        if (!order) throw new HttpError("Order not found");
        payload = {
          id: order._id.toString(),
          order_number: order.order_number,
          status: order.status,
          total_amount: Number(order.total_amount),
        };
      } else if (data.message_type === "IMAGE") {
        payload = { path: data.image_path };
      } else {
        throw new HttpError("Unsupported message type");
      }

      const msg = await ChatMessage.create({
        chat_room_id: toId(target),
        sender_id: toId(p.id),
        message: data.message.slice(0, 4000),
        message_type: data.message_type,
        payload,
      });
      await ChatRoom.findByIdAndUpdate(target, { updated_at: new Date() });
      return ok({ id: msg._id.toString() }, 201);
    }
    // Open chat
    const { shop_id } = z.object({ shop_id: z.string() }).parse(body);
    if (p.role !== "CUSTOMER" || !(await shopVisible(shop_id)))
      throw new HttpError("Shop unavailable");
    let room = await ChatRoom.findOne({
      customer_id: toId(p.id),
      shop_id: toId(shop_id),
    }).lean();
    if (!room) {
      const created = await ChatRoom.create({
        customer_id: toId(p.id),
        shop_id: toId(shop_id),
      });
      room = created.toObject();
    } else {
      await ChatRoom.findByIdAndUpdate(room._id, { updated_at: new Date() });
    }
    return ok({ id: room._id.toString() });
  }

  // ---- REVIEWS ----
  if (resource === "reviews") {
    if (method === "DELETE") {
      await actor(["ADMIN"]);
      await Review.deleteOne({ _id: toId(target) });
      return ok([]);
    }
    const reviewData = v.reviewSchema.parse(body);
    const order = await Order.findById(reviewData.order_id).lean();
    if (
      !order ||
      order.customer_id.toString() !== p.id ||
      order.shop_id.toString() !== reviewData.shop_id ||
      order.status !== "DELIVERED"
    )
      throw new HttpError(
        "You can only review delivered orders from the correct shop.",
      );
    try {
      const review = await Review.create({
        ...reviewData,
        order_id: toId(reviewData.order_id),
        shop_id: toId(reviewData.shop_id),
        customer_id: toId(p.id),
      });
      return ok(docToPlain(review.toObject()));
    } catch (err) {
      if (isDuplicateKeyError(err))
        throw new HttpError(
          "A record with these details already exists. Phone numbers must be unique and orders can be reviewed only once.",
          409,
        );
      throw err;
    }
  }

  // ---- COMPLAINTS ----
  if (resource === "complaints") {
    if (target) {
      await actor(["ADMIN"]);
      const data = z
        .object({
          status: z.enum([
            "OPEN",
            "IN_PROGRESS",
            "RESOLVED",
            "CLOSED",
            "open",
            "in_progress",
            "resolved",
            "closed",
          ]),
        })
        .parse(body);
      const complaint = await Complaint.findByIdAndUpdate(target, data, {
        new: true,
      }).lean();
      if (!complaint) throw new HttpError("Complaint not found.", 404);
      return ok(docToPlain(complaint));
    }
    const complaintData = v.complaintSchema.parse(body);
    const complaint = await Complaint.create({
      ...complaintData,
      order_id: complaintData.order_id ? toId(complaintData.order_id) : null,
      shop_id: complaintData.shop_id ? toId(complaintData.shop_id) : null,
      user_id: toId(p.id),
    });
    return ok(docToPlain(complaint));
  }

  // ---- MANAGE (SHOPKEEPER / ADMIN) ----
  if (resource === "manage") {
    await actor(["SHOPKEEPER", "ADMIN"]);
    if (action && !isValidObjectId(action)) throw new HttpError("Invalid ID.", 400);

    if (target === "shops") {
      if (p.role === "ADMIN" && action) {
        const data = z
          .object({
            approval_status: z.enum([
              "PENDING",
              "APPROVED",
              "REJECTED",
              "SUSPENDED",
            ]),
          })
          .parse(body);
        const before = await Shop.findById(action).lean();
        const shop = await Shop.findByIdAndUpdate(action, data, {
          new: true,
        }).lean();
        if (!shop) throw new HttpError("Shop not found.", 404);
        await auditLog(p.id, "shops", action, "UPDATE", { before, after: shop });
        return ok(docToPlain(shop));
      }
      const data = v.shopSchema.parse(body);
      if (action) {
        const shop = await Shop.findByIdAndUpdate(action, data, {
          new: true,
        }).lean();
        if (!shop) throw new HttpError("Shop not found.", 404);
        return ok(docToPlain(shop));
      }
      const shop = await Shop.create({
        ...data,
        owner_id: toId(p.id),
        approval_status: "PENDING",
      });
      return ok(docToPlain(shop));
    }

    if (target === "products") {
      if (method === "DELETE") {
        const prod = await Product.findByIdAndUpdate(
          action,
          { is_active: false },
          { new: true },
        ).lean();
        if (!prod) throw new HttpError("Product not found.", 404);
        return ok(docToPlain(prod));
      }
      const data = v.productSchema.parse(body);
      if (action) {
        const prod = await Product.findByIdAndUpdate(action, data, {
          new: true,
        }).lean();
        if (!prod) throw new HttpError("Product not found.", 404);
        if (data.image_url) {
          await ProductImage.findOneAndUpdate(
            { product_id: prod._id, is_primary: true },
            { image_url: data.image_url, is_primary: true },
            { upsert: true, new: true },
          );
        }
        return ok(docToPlain(prod));
      }
      const prod = await Product.create(data);
      if (data.image_url) {
        await ProductImage.create({
          product_id: prod._id,
          image_url: data.image_url,
          is_primary: true,
        });
      }
      return ok(docToPlain(prod));
    }

    await actor(["ADMIN"]);

    if (target === "users") {
      const data = z
        .object({ status: z.enum(["ACTIVE", "SUSPENDED"]) })
        .parse(body);
      if (action === p.id)
        throw new HttpError("You cannot suspend your own admin account.");
      const before = await User.findById(action).select("-password_hash").lean();
      const user = await User.findByIdAndUpdate(action, data, { new: true })
        .select("-password_hash")
        .lean();
      if (!user) throw new HttpError("User not found.", 404);
      await auditLog(p.id, "users", action!, "UPDATE", { before, after: user });
      return ok(docToPlain(user));
    }

    if (target === "categories") {
      if (method === "DELETE") {
        try {
          await Category.deleteOne({ _id: toId(action!) });
        } catch {
          throw new HttpError(
            "This entry is used by other records and cannot be removed.",
          );
        }
        return ok([]);
      }
      const data = v.categorySchema.parse(body);
      if (action) {
        const cat = await Category.findByIdAndUpdate(
          action,
          {
            ...data,
            parent_id: data.parent_id ? toId(data.parent_id) : null,
          },
          { new: true },
        ).lean();
        if (!cat) throw new HttpError("Category not found.", 404);
        return ok(docToPlain(cat));
      }
      const cat = await Category.create({
        ...data,
        parent_id: data.parent_id ? toId(data.parent_id) : null,
      });
      return ok(docToPlain(cat));
    }
  }

  throw new HttpError("Endpoint not found.", 404);
}

async function handle(request: NextRequest, context: Context) {
  try {
    return await execute(request, context);
  } catch (error) {
    if (error instanceof z.ZodError)
      return ok(
        { error: error.issues[0]?.message || "Check the form fields." },
        400,
      );
    if (error instanceof HttpError)
      return ok({ error: error.message }, error.status);
    if (error instanceof SyntaxError)
      return ok({ error: "Invalid request body." }, 400);
    const mongoMsg = mongoErrorMessage(error);
    if (mongoMsg) return ok({ error: mongoMsg }, 409);
    console.error("API Error:", error);
    return ok(
      {
        error:
          "The service is unavailable. Check your MongoDB configuration and try again.",
      },
      503,
    );
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
