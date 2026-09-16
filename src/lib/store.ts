"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem, Location, Product } from "./types";
interface Store {
  location: Location | null;
  owner: string | null;
  shopId: string | null;
  shopName: string;
  items: CartItem[];
  setLocation: (location: Location) => void;
  setOwner: (owner: string | null) => void;
  add: (
    product: Product,
    replace?: boolean,
  ) => "added" | "cross-shop" | "unavailable";
  quantity: (id: string, q: number) => void;
  clear: () => void;
}
export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      location: null,
      owner: null,
      shopId: null,
      shopName: "",
      items: [],
      setLocation: (location) => set({ location }),
      setOwner: (owner) => {
        if (get().owner !== owner)
          set({ owner, shopId: null, shopName: "", items: [] });
      },
      add: (p, replace = false) => {
        if (
          p.stock_quantity < 1 ||
          p.shop_status === "CLOSED" ||
          p.shop_status === "INACTIVE"
        )
          return "unavailable";
        const s = get();
        if (s.shopId && s.shopId !== p.shop_id && !replace) return "cross-shop";
        const base = replace ? [] : s.items;
        const existing = base.find((x) => x.product_id === p.id);
        if (existing && existing.quantity >= Math.min(p.stock_quantity, 999))
          return "unavailable";
        const items = existing
          ? base.map((x) =>
              x.product_id === p.id
                ? {
                    ...x,
                    quantity: x.quantity + 1,
                    stock: p.stock_quantity,
                    price: Number(p.price),
                  }
                : x,
            )
          : [
              ...base,
              {
                product_id: p.id,
                name: p.name,
                unit: p.unit,
                price: Number(p.price),
                stock: p.stock_quantity,
                quantity: 1,
              },
            ];
        set({
          items,
          shopId: p.shop_id,
          shopName: p.shop_name || "Local shop",
        });
        return "added";
      },
      quantity: (id, q) =>
        set({
          items: get().items.flatMap((x) =>
            x.product_id !== id
              ? [x]
              : q < 1
                ? []
                : [{ ...x, quantity: Math.min(q, x.stock, 999) }],
          ),
        }),
      clear: () => set({ items: [], shopId: null, shopName: "" }),
    }),
    {
      name: "localkart",
      partialize: (s) => ({
        location: s.location,
        owner: s.owner,
        shopId: s.shopId,
        shopName: s.shopName,
        items: s.items,
      }),
    },
  ),
);
