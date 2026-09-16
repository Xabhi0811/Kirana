export type Role = "CUSTOMER" | "SHOPKEEPER" | "ADMIN";
export type OrderStatus =
  | "PLACED"
  | "ACCEPTED"
  | "PREPARING"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";
export interface Profile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  avatar_url: string | null;
  status: "ACTIVE" | "SUSPENDED";
}
export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  description: string | null;
  image_url?: string | null;
}
export interface PlatformSettings {
  marketplace_name: string;
  support_email: string;
  announcement: string;
  updated_at: string;
}
export interface OrderReportRow {
  day: string;
  orders: number;
  delivered: number;
  cancelled: number;
  delivered_order_value: number;
}
export interface Address {
  id: string;
  label: string;
  full_address: string;
  latitude: number;
  longitude: number;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
}
export interface Shop {
  id: string;
  owner_id?: string;
  name: string;
  description: string;
  category_id: string;
  logo_url: string | null;
  address: string;
  phone: string | null;
  email: string | null;
  latitude: number;
  longitude: number;
  delivery_radius_km: number;
  open_time: string;
  close_time: string;
  status: "OPEN" | "CLOSED" | "INACTIVE";
  approval_status?: string;
  distance?: number;
  rating?: number;
  product_count?: number;
}
export interface Product {
  id: string;
  shop_id: string;
  category_id: string;
  name: string;
  description: string;
  brand: string;
  unit: string;
  price: number;
  stock_quantity: number;
  image_url: string | null;
  is_active?: boolean;
  shop_name?: string;
  shop_status?: string;
  distance?: number;
  rating?: number;
}
export interface CartItem {
  product_id: string;
  name: string;
  unit: string;
  price: number;
  quantity: number;
  stock: number;
}
export interface ListItem {
  id: string;
  list_id: string;
  product_id: string | null;
  name: string;
  quantity: number;
  unit: string;
}
export interface ShoppingList {
  id: string;
  name: string;
  updated_at: string;
  shopping_list_items: ListItem[];
}
export interface Tracking {
  id: string;
  status: OrderStatus;
  note: string;
  created_at: string;
}
export interface OrderItem {
  id: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  total_price: number;
}
export interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  shop_id: string;
  status: OrderStatus;
  total_amount: number;
  notes: string;
  created_at: string;
  shops: { name: string };
  delivery_address: Address;
  order_items: OrderItem[];
  order_tracking: Tracking[];
}
export interface Review {
  id: string;
  order_id: string;
  shop_id: string;
  customer_id: string;
  rating: number;
  comment: string;
  created_at: string;
}
export interface Complaint {
  id: string;
  subject: string;
  description: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED";
  created_at: string;
}
export interface ChatRoom {
  id: string;
  shop_id: string;
  shop_name: string;
  customer_name: string;
  unread: number;
  updated_at: string;
}
export interface ChatPayload {
  id?: string;
  name?: string;
  unit?: string;
  price?: number;
  stock_quantity?: number;
  path?: string;
  order_number?: string;
  status?: string;
  total_amount?: number;
  items?: {
    name: string;
    quantity: number;
    unit: string;
    product_id: string | null;
  }[];
}
export interface Message {
  id: string;
  chat_room_id: string;
  sender_id: string;
  message: string;
  message_type: "TEXT" | "PRODUCT" | "PRODUCT_LIST" | "IMAGE" | "ORDER";
  payload: ChatPayload;
  is_read: boolean;
  created_at: string;
}
export interface Location {
  latitude: number;
  longitude: number;
  label: string;
}
