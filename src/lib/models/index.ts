import mongoose, { Schema, type Document, type Model } from "mongoose";

/* ------------------------------------------------------------------ */
/*  Helper: prevent model re-compilation during Next.js hot-reload    */
/* ------------------------------------------------------------------ */
function getModel<T extends Document>(
  name: string,
  schema: Schema<T>,
): Model<T> {
  return (mongoose.models[name] as Model<T>) || mongoose.model<T>(name, schema);
}

/* ------------------------------------------------------------------ */
/*  Users                                                              */
/* ------------------------------------------------------------------ */
export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  phone: string | null;
  role: "CUSTOMER" | "SHOPKEEPER" | "ADMIN" | "customer" | "shop_owner" | "admin" | "SHOP_OWNER";
  avatar_url: string | null;
  profile_image: string | null;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "active" | "inactive" | "suspended";
  password_hash?: string | null;
  google_id?: string | null;
  created_at: Date;
  updated_at: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 100,
    },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, default: null },
    role: {
      type: String,
      enum: ["CUSTOMER", "SHOPKEEPER", "ADMIN", "customer", "shop_owner", "admin", "SHOP_OWNER"],
      default: "CUSTOMER",
    },
    avatar_url: { type: String, default: null },
    profile_image: { type: String, default: null },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "SUSPENDED", "active", "inactive", "suspended"],
      default: "ACTIVE",
    },
    password_hash: { type: String, default: null },
    google_id: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

userSchema.pre("save", function () {
  if (this.profile_image && !this.avatar_url) this.avatar_url = this.profile_image;
  if (this.avatar_url && !this.profile_image) this.profile_image = this.avatar_url;
});

userSchema.index(
  { phone: 1 },
  { unique: true, sparse: true, partialFilterExpression: { phone: { $ne: null } } },
);

userSchema.index(
  { google_id: 1 },
  { unique: true, sparse: true, partialFilterExpression: { google_id: { $ne: null } } },
);

export const User = getModel<IUser>("User", userSchema);

/* ------------------------------------------------------------------ */
/*  Categories                                                         */
/* ------------------------------------------------------------------ */
export interface ICategory extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description: string | null;
  image_url: string | null;
  parent_id: mongoose.Types.ObjectId | null;
  created_at: Date;
  updated_at: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, unique: true, maxlength: 100 },
    description: { type: String, default: null, maxlength: 1000 },
    image_url: { type: String, default: null },
    parent_id: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

categorySchema.index({ parent_id: 1 });

export const Category = getModel<ICategory>("Category", categorySchema);

/* ------------------------------------------------------------------ */
/*  Addresses                                                          */
/* ------------------------------------------------------------------ */
export interface IAddress extends Document {
  _id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  label: string;
  full_address: string;
  latitude: number;
  longitude: number;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

const addressSchema = new Schema<IAddress>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    label: { type: String, required: true, maxlength: 40 },
    full_address: { type: String, required: true, maxlength: 500 },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    city: { type: String, required: true, maxlength: 100 },
    state: { type: String, required: true, maxlength: 100 },
    pincode: { type: String, required: true, match: /^[0-9]{6}$/ },
    is_default: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

addressSchema.index({ user_id: 1 });

export const Address = getModel<IAddress>("Address", addressSchema);

/* ------------------------------------------------------------------ */
/*  Shops                                                              */
/* ------------------------------------------------------------------ */
export interface IShop extends Document {
  _id: mongoose.Types.ObjectId;
  owner_id: mongoose.Types.ObjectId;
  category_id: mongoose.Types.ObjectId;
  name: string;
  description: string;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  address_id: mongoose.Types.ObjectId | null;
  address: string;
  latitude: number;
  longitude: number;
  delivery_radius_km: number;
  open_time: string;
  close_time: string;
  status: "OPEN" | "CLOSED" | "INACTIVE" | "open" | "closed" | "inactive";
  approval_status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED" | "pending" | "approved" | "rejected" | "suspended";
  created_at: Date;
  updated_at: Date;
}

const shopSchema = new Schema<IShop>(
  {
    owner_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category_id: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    name: { type: String, required: true, minlength: 2, maxlength: 120 },
    description: { type: String, default: "", maxlength: 2000 },
    logo_url: { type: String, default: null },
    phone: { type: String, default: null, maxlength: 20 },
    email: { type: String, default: null },
    address_id: {
      type: Schema.Types.ObjectId,
      ref: "Address",
      default: null,
    },
    address: { type: String, required: true, maxlength: 500 },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    delivery_radius_km: {
      type: Number,
      required: true,
      min: 0.01,
      max: 50,
    },
    open_time: { type: String, default: "08:00" },
    close_time: { type: String, default: "21:00" },
    status: {
      type: String,
      enum: ["OPEN", "CLOSED", "INACTIVE", "open", "closed", "inactive"],
      default: "OPEN",
    },
    approval_status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "SUSPENDED", "pending", "approved", "rejected", "suspended"],
      default: "PENDING",
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

shopSchema.index({ owner_id: 1 });
shopSchema.index({ address_id: 1 });
shopSchema.index({ latitude: 1, longitude: 1 });
shopSchema.index({ name: "text" });
shopSchema.index({ category_id: 1 });

export const Shop = getModel<IShop>("Shop", shopSchema);

/* ------------------------------------------------------------------ */
/*  Products                                                           */
/* ------------------------------------------------------------------ */
export interface IProduct extends Document {
  _id: mongoose.Types.ObjectId;
  shop_id: mongoose.Types.ObjectId;
  category_id: mongoose.Types.ObjectId;
  name: string;
  description: string;
  brand: string;
  unit: string;
  price: number;
  stock_quantity: number;
  image_url: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const productSchema = new Schema<IProduct>(
  {
    shop_id: {
      type: Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
    },
    category_id: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    name: { type: String, required: true, minlength: 2, maxlength: 150 },
    description: { type: String, default: "", maxlength: 2000 },
    brand: { type: String, default: "", maxlength: 100 },
    unit: { type: String, required: true, maxlength: 40 },
    price: { type: Number, required: true, min: 0, max: 10000000 },
    stock_quantity: { type: Number, required: true, min: 0, max: 1000000 },
    image_url: { type: String, default: null },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

productSchema.index({ shop_id: 1 });
productSchema.index({ category_id: 1 });
productSchema.index({ name: "text" });

export const Product = getModel<IProduct>("Product", productSchema);

/* ------------------------------------------------------------------ */
/*  Product Images                                                     */
/* ------------------------------------------------------------------ */
export interface IProductImage extends Document {
  _id: mongoose.Types.ObjectId;
  product_id: mongoose.Types.ObjectId;
  image_url: string;
  is_primary: boolean;
  created_at: Date;
}

const productImageSchema = new Schema<IProductImage>(
  {
    product_id: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    image_url: { type: String, required: true },
    is_primary: { type: Boolean, default: false },
    created_at: { type: Date, default: () => new Date() },
  },
  { timestamps: false },
);

productImageSchema.index({ product_id: 1 });
productImageSchema.index({ product_id: 1, is_primary: 1 });

export const ProductImage = getModel<IProductImage>(
  "ProductImage",
  productImageSchema,
);

/* ------------------------------------------------------------------ */
/*  Shopping Lists                                                     */
/* ------------------------------------------------------------------ */
export interface IShoppingList extends Document {
  _id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  name: string;
  created_at: Date;
  updated_at: Date;
}

const shoppingListSchema = new Schema<IShoppingList>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: { type: String, required: true, minlength: 1, maxlength: 100 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

shoppingListSchema.index({ user_id: 1 });

export const ShoppingList = getModel<IShoppingList>(
  "ShoppingList",
  shoppingListSchema,
);

/* ------------------------------------------------------------------ */
/*  Shopping List Items                                                */
/* ------------------------------------------------------------------ */
export interface IShoppingListItem extends Document {
  _id: mongoose.Types.ObjectId;
  list_id: mongoose.Types.ObjectId;
  product_id: mongoose.Types.ObjectId | null;
  name: string;
  product_name?: string;
  quantity: number;
  unit: string;
  created_at: Date;
  updated_at: Date;
}

const shoppingListItemSchema = new Schema<IShoppingListItem>(
  {
    list_id: {
      type: Schema.Types.ObjectId,
      ref: "ShoppingList",
      required: true,
    },
    product_id: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
    name: { type: String, required: true, maxlength: 150 },
    product_name: { type: String, maxlength: 150, default: null },
    quantity: { type: Number, required: true, min: 1, max: 999 },
    unit: { type: String, default: "item", maxlength: 40 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

shoppingListItemSchema.pre("save", function () {
  if (this.product_name && !this.name) this.name = this.product_name;
  if (this.name && !this.product_name) this.product_name = this.name;
});

shoppingListItemSchema.index({ list_id: 1 });
shoppingListItemSchema.index({ product_id: 1 });

export const ShoppingListItem = getModel<IShoppingListItem>(
  "ShoppingListItem",
  shoppingListItemSchema,
);

/* ------------------------------------------------------------------ */
/*  Orders                                                             */
/* ------------------------------------------------------------------ */
export interface IOrder extends Document {
  _id: mongoose.Types.ObjectId;
  order_number: string;
  customer_id: mongoose.Types.ObjectId;
  shop_id: mongoose.Types.ObjectId;
  address_id: mongoose.Types.ObjectId | null;
  delivery_address: Record<string, unknown>;
  status: "PLACED" | "ACCEPTED" | "PREPARING" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";
  total_amount: number;
  notes: string;
  request_key: string;
  created_at: Date;
  updated_at: Date;
}

function generateOrderNumber(): string {
  const hex = [...crypto.getRandomValues(new Uint8Array(6))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return "LK-" + hex;
}

const orderSchema = new Schema<IOrder>(
  {
    order_number: {
      type: String,
      required: true,
      unique: true,
      default: generateOrderNumber,
    },
    customer_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    shop_id: {
      type: Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
    },
    address_id: {
      type: Schema.Types.ObjectId,
      ref: "Address",
      default: null,
    },
    delivery_address: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: [
        "PLACED",
        "ACCEPTED",
        "PREPARING",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "CANCELLED",
        "placed",
        "accepted",
        "preparing",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      default: "PLACED",
    },
    total_amount: { type: Number, required: true, min: 0 },
    notes: { type: String, default: "", maxlength: 2000 },
    request_key: { type: String, required: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

orderSchema.index({ customer_id: 1, created_at: -1 });
orderSchema.index({ shop_id: 1, created_at: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ created_at: -1 });
orderSchema.index({ customer_id: 1, request_key: 1 }, { unique: true });

export const Order = getModel<IOrder>("Order", orderSchema);

/* ------------------------------------------------------------------ */
/*  Order Items                                                        */
/* ------------------------------------------------------------------ */
export interface IOrderItem extends Document {
  _id: mongoose.Types.ObjectId;
  order_id: mongoose.Types.ObjectId;
  product_id: mongoose.Types.ObjectId;
  product_name: string;
  unit_price: number;
  quantity: number;
  total_price: number;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    order_id: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    product_id: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    product_name: { type: String, required: true },
    unit_price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    total_price: { type: Number, required: true, min: 0 },
  },
  { timestamps: false },
);

orderItemSchema.index({ order_id: 1 });
orderItemSchema.index({ product_id: 1 });

export const OrderItem = getModel<IOrderItem>("OrderItem", orderItemSchema);

/* ------------------------------------------------------------------ */
/*  Order Tracking                                                     */
/* ------------------------------------------------------------------ */
export interface IOrderTracking extends Document {
  _id: mongoose.Types.ObjectId;
  order_id: mongoose.Types.ObjectId;
  status: string;
  note: string;
  updated_by: mongoose.Types.ObjectId;
  created_at: Date;
}

const orderTrackingSchema = new Schema<IOrderTracking>(
  {
    order_id: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    status: { type: String, required: true },
    note: { type: String, default: "" },
    updated_by: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    created_at: { type: Date, default: () => new Date() },
  },
  { timestamps: false },
);

orderTrackingSchema.index({ order_id: 1 });

export const OrderTracking = getModel<IOrderTracking>(
  "OrderTracking",
  orderTrackingSchema,
);

/* ------------------------------------------------------------------ */
/*  Reviews                                                            */
/* ------------------------------------------------------------------ */
export interface IReview extends Document {
  _id: mongoose.Types.ObjectId;
  order_id: mongoose.Types.ObjectId;
  customer_id: mongoose.Types.ObjectId;
  shop_id: mongoose.Types.ObjectId;
  rating: number;
  comment: string;
  created_at: Date;
  updated_at: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    order_id: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
    },
    customer_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    shop_id: {
      type: Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
    },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: "", maxlength: 2000 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

reviewSchema.index({ shop_id: 1 });
reviewSchema.index({ customer_id: 1 });

export const Review = getModel<IReview>("Review", reviewSchema);

/* ------------------------------------------------------------------ */
/*  Complaints                                                         */
/* ------------------------------------------------------------------ */
export interface IComplaint extends Document {
  _id: mongoose.Types.ObjectId;
  order_id: mongoose.Types.ObjectId | null;
  user_id: mongoose.Types.ObjectId;
  shop_id: mongoose.Types.ObjectId | null;
  subject: string;
  description: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "open" | "in_progress" | "resolved" | "closed";
  created_at: Date;
  updated_at: Date;
}

const complaintSchema = new Schema<IComplaint>(
  {
    order_id: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    shop_id: {
      type: Schema.Types.ObjectId,
      ref: "Shop",
      default: null,
    },
    subject: { type: String, required: true, maxlength: 150 },
    description: { type: String, required: true, maxlength: 4000 },
    status: {
      type: String,
      enum: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "open", "in_progress", "resolved", "closed"],
      default: "OPEN",
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

complaintSchema.index({ user_id: 1, created_at: -1 });
complaintSchema.index({ order_id: 1 });
complaintSchema.index({ shop_id: 1 });

export const Complaint = getModel<IComplaint>("Complaint", complaintSchema);

/* ------------------------------------------------------------------ */
/*  Chat Rooms                                                         */
/* ------------------------------------------------------------------ */
export interface IChatRoom extends Document {
  _id: mongoose.Types.ObjectId;
  customer_id: mongoose.Types.ObjectId;
  shop_id: mongoose.Types.ObjectId;
  created_at: Date;
  updated_at: Date;
}

const chatRoomSchema = new Schema<IChatRoom>(
  {
    customer_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    shop_id: {
      type: Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

chatRoomSchema.index({ customer_id: 1 });
chatRoomSchema.index({ shop_id: 1 });
chatRoomSchema.index({ customer_id: 1, shop_id: 1 }, { unique: true });

export const ChatRoom = getModel<IChatRoom>("ChatRoom", chatRoomSchema);

/* ------------------------------------------------------------------ */
/*  Chat Messages                                                      */
/* ------------------------------------------------------------------ */
export interface IChatMessage extends Document {
  _id: mongoose.Types.ObjectId;
  chat_room_id: mongoose.Types.ObjectId;
  sender_id: mongoose.Types.ObjectId;
  message: string;
  message_type: "TEXT" | "IMAGE" | "PRODUCT" | "PRODUCT_LIST" | "ORDER";
  payload: Record<string, unknown>;
  is_read: boolean;
  created_at: Date;
}

const chatMessageSchema = new Schema<IChatMessage>(
  {
    chat_room_id: {
      type: Schema.Types.ObjectId,
      ref: "ChatRoom",
      required: true,
    },
    sender_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: { type: String, default: "", maxlength: 4000 },
    message_type: {
      type: String,
      enum: [
        "TEXT",
        "IMAGE",
        "PRODUCT",
        "PRODUCT_LIST",
        "ORDER",
        "text",
        "image",
        "product",
        "product_list",
        "order",
      ],
      required: true,
    },
    payload: { type: Schema.Types.Mixed, default: {} },
    is_read: { type: Boolean, default: false },
    created_at: { type: Date, default: () => new Date() },
  },
  { timestamps: false },
);

chatMessageSchema.index({ chat_room_id: 1, created_at: -1 });
chatMessageSchema.index({ sender_id: 1 });

export const ChatMessage = getModel<IChatMessage>(
  "ChatMessage",
  chatMessageSchema,
);

/* ------------------------------------------------------------------ */
/*  Audit Logs                                                         */
/* ------------------------------------------------------------------ */
export interface IAuditLog extends Document {
  _id: mongoose.Types.ObjectId;
  actor_id: mongoose.Types.ObjectId | null;
  resource: string;
  resource_id: mongoose.Types.ObjectId;
  action: string;
  changes: Record<string, unknown> | null;
  created_at: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actor_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resource: { type: String, required: true },
    resource_id: { type: Schema.Types.ObjectId, required: true },
    action: { type: String, required: true },
    changes: { type: Schema.Types.Mixed, default: null },
    created_at: { type: Date, default: () => new Date() },
  },
  { timestamps: false },
);

auditLogSchema.index({ actor_id: 1 });

export const AuditLog = getModel<IAuditLog>("AuditLog", auditLogSchema);

/* ------------------------------------------------------------------ */
/*  Platform Settings (singleton)                                      */
/* ------------------------------------------------------------------ */
export interface IPlatformSettings extends Document {
  _id: mongoose.Types.ObjectId;
  marketplace_name: string;
  support_email: string;
  announcement: string;
  updated_at: Date;
}

const platformSettingsSchema = new Schema<IPlatformSettings>(
  {
    marketplace_name: {
      type: String,
      default: "LocalKart",
      minlength: 2,
      maxlength: 100,
    },
    support_email: { type: String, default: "", maxlength: 254 },
    announcement: { type: String, default: "", maxlength: 500 },
    updated_at: { type: Date, default: () => new Date() },
  },
  { timestamps: false },
);

export const PlatformSettings = getModel<IPlatformSettings>(
  "PlatformSettings",
  platformSettingsSchema,
);

/* ------------------------------------------------------------------ */
/*  Utility: distance calculation (Haversine)                          */
/* ------------------------------------------------------------------ */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

/* ------------------------------------------------------------------ */
/*  Utility: category hierarchy check                                  */
/* ------------------------------------------------------------------ */
export async function categoryContains(
  parentId: string,
  childId: string,
): Promise<boolean> {
  if (parentId === childId) return true;
  const visited = new Set<string>([parentId]);
  let frontier = [parentId];
  while (frontier.length > 0) {
    const children = await Category.find({
      parent_id: { $in: frontier.map((id) => new mongoose.Types.ObjectId(id)) },
    })
      .select("_id")
      .lean();
    frontier = [];
    for (const c of children) {
      const cid = c._id.toString();
      if (cid === childId) return true;
      if (!visited.has(cid)) {
        visited.add(cid);
        frontier.push(cid);
      }
    }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  Utility: ensure platform settings singleton exists                 */
/* ------------------------------------------------------------------ */
export async function ensurePlatformSettings(): Promise<IPlatformSettings> {
  let settings = await PlatformSettings.findOne().lean();
  if (!settings) {
    settings = (await PlatformSettings.create({})).toObject();
  }
  return settings as IPlatformSettings;
}
