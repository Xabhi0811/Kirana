import { z } from "zod";
const id = z.string().min(1).max(36);
const text = (max = 100) => z.string().trim().min(1).max(max);
const requiredNumber = z
  .union([z.number(), z.string().trim().min(1)])
  .pipe(z.coerce.number());
const coordinate = {
  latitude: requiredNumber.pipe(z.number().min(-90).max(90)),
  longitude: requiredNumber.pipe(z.number().min(-180).max(180)),
};
export const registerSchema = z.object({
  name: text().min(2),
  email: z.email(),
  password: z
    .string()
    .min(10)
    .max(128)
    .regex(/[a-z]/, "Include a lowercase letter")
    .regex(/[A-Z]/, "Include an uppercase letter")
    .regex(/[0-9]/, "Include a number"),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/, "Enter a valid phone number"),
  role: z
    .enum(["CUSTOMER", "SHOPKEEPER", "ADMIN", "customer", "shop_owner", "admin", "SHOP_OWNER"])
    .default("CUSTOMER"),
});
export const addressSchema = z.object({
  label: text(40),
  full_address: text(500),
  ...coordinate,
  city: text(100),
  state: text(100),
  pincode: z.string().regex(/^[0-9]{6}$/, "Enter a six-digit PIN code"),
  is_default: z.boolean(),
});
export const shopSchema = z.object({
  name: text(120).min(2),
  description: z.string().max(2000),
  category_id: id,
  address_id: id.nullable().optional(),
  address: text(500),
  ...coordinate,
  delivery_radius_km: z.coerce.number().positive().max(50),
  open_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .refine((v) => Number(v.slice(0, 2)) < 24 && Number(v.slice(3, 5)) < 60),
  close_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .refine((v) => Number(v.slice(0, 2)) < 24 && Number(v.slice(3, 5)) < 60),
  status: z
    .enum(["OPEN", "CLOSED", "INACTIVE", "open", "closed", "inactive"])
    .default("OPEN"),
  phone: z.string().max(20).nullable().optional(),
  email: z
    .union([z.email(), z.literal("")])
    .nullable()
    .optional(),
  logo_url: z.url().nullable().optional(),
});
export const productSchema = z.object({
  shop_id: id,
  category_id: id,
  name: text(150).min(2),
  description: z.string().max(2000),
  brand: z.string().max(100),
  unit: text(40),
  price: z.coerce.number().min(0).max(10000000),
  stock_quantity: z.coerce.number().int().min(0).max(1000000),
  is_active: z.boolean(),
  image_url: z.url().nullable().optional(),
});
export const orderSchema = z
  .object({
    shop_id: id,
    address_id: id,
    request_id: id,
    notes: z.string().max(2000),
    items: z
      .array(
        z.object({
          product_id: id,
          quantity: z.number().int().min(1).max(999),
          expected_price: z.number().min(0),
        }),
      )
      .min(1)
      .max(100),
  })
  .refine(
    (v) => new Set(v.items.map((x) => x.product_id)).size === v.items.length,
    "Duplicate cart items",
  );
export const messageSchema = z
  .object({
    room_id: id,
    message_type: z.enum(["TEXT", "IMAGE", "PRODUCT", "PRODUCT_LIST", "ORDER"]),
    message: z.string().max(4000).default(""),
    reference_id: id.nullable().optional(),
    image_path: z.string().max(500).nullable().optional(),
  })
  .refine(
    (v) => v.message_type !== "TEXT" || v.message.trim().length > 0,
    "Enter a message",
  );
export const listItemSchema = z.object({
  list_id: id,
  product_id: id.nullable(),
  name: text(150),
  product_name: text(150).optional(),
  quantity: z.coerce.number().int().min(1).max(999),
  unit: text(40),
});
export const categorySchema = z.object({
  name: text(100),
  description: z.string().max(1000),
  parent_id: id.nullable(),
  image_url: z.url().nullable().optional(),
});
export const platformSettingsSchema = z.object({
  marketplace_name: text(100).min(2),
  support_email: z.union([z.email(), z.literal("")]),
  announcement: z.string().trim().max(500),
});
export const reviewSchema = z.object({
  order_id: id,
  shop_id: id,
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(2000),
});
export const complaintSchema = z.object({
  order_id: id.nullable().optional(),
  shop_id: id.nullable().optional(),
  subject: text(150),
  description: text(4000),
  status: z
    .enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "open", "in_progress", "resolved", "closed"])
    .optional(),
});
export const productImageSchema = z.object({
  product_id: id,
  image_url: z.string().url(),
  is_primary: z.boolean().default(false),
});
export const profileSchema = z.object({
  name: text().min(2),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/),
  avatar_url: z.url().nullable().optional(),
  profile_image: z.union([z.string().url(), z.literal("")]).nullable().optional(),
});
export const searchSchema = z.object({
  ...coordinate,
  q: z.string().max(100).default(""),
  category: id.nullable().default(null),
  in_stock: z.boolean().default(false),
  open_only: z.boolean().default(false),
  sort_by: z.enum(["price", "distance", "rating", "name"]).default("distance"),
  page: z.coerce.number().int().min(0).max(10000).default(0),
  shop: id.nullable().default(null),
  unit: z.string().max(40).nullable().default(null),
  brand: z.string().max(100).nullable().default(null),
});
