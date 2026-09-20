import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { SearchPage } from "@/components/discovery";
import {
  AuthPage,
  AddressesPage,
  ProfilePage,
} from "@/components/account-pages";
import { ShoppingListsPage } from "@/components/list-pages";
import { CartPage, OrdersPage, OrderPage } from "@/components/order-pages";
import { ShopPage, ProductPage } from "@/components/shop-pages";
import { ChatPage } from "@/components/chat-page";
import { DashboardPage, ManagementPage } from "@/components/management-pages";
import type { Metadata } from "next";
import {
  PlatformSettingsPage,
  ReportsPage,
  ComplaintsPage,
} from "@/components/platform-pages";
import { z } from "zod";
type Props = {
  params: Promise<{ segments?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { segments } = await params;
  return {
    title:
      segments?.[0]
        ?.replaceAll("-", " ")
        .replace(/^./, (s) => s.toUpperCase()) || "Home",
  };
}
export default async function Page({ params, searchParams }: Props) {
  const segments = (await params).segments || [],
    [route, id, extra] = segments;
  const s = await searchParams;
  const q = typeof s.q === "string" ? s.q : "",
    category = typeof s.category === "string" ? s.category : "";
  if (extra) notFound();
  if (
    ["login", "register", "forgot-password", "reset-password"].includes(
      route,
    ) &&
    !id
  )
    return (
      <AuthPage
        mode={
          route as "login" | "register" | "forgot-password" | "reset-password"
        }
        oauthError={
          route === "login" && typeof s.error === "string" ? s.error : undefined
        }
      />
    );
  if (route === "search" && !id)
    return <SearchPage initialQuery={q} initialCategory={category} />;
  if (route === "compare" && !id)
    return (
      <SearchPage
        kind="compare"
        initialQuery={q}
        initialCategory={category}
        initialUnit={typeof s.unit === "string" ? s.unit : ""}
        initialBrand={typeof s.brand === "string" ? s.brand : ""}
      />
    );
  if (route === "shops")
    return id ? (
      <ShopPage id={id} />
    ) : (
      <SearchPage kind="shops" initialQuery={q} initialCategory={category} />
    );
  if (route === "products" && id) return <ProductPage id={id} />;
  if (route === "cart" && !id) return <CartPage />;
  if (route === "complaints" && !id) {
    await requireRole(["CUSTOMER"]);
    const shopId =
      typeof s.shop === "string" && z.uuid().safeParse(s.shop).success
        ? s.shop
        : "";
    return <ComplaintsPage shopId={shopId} />;
  }
  if (route === "reviews" && !id) {
    await requireRole(["CUSTOMER"]);
    return <ManagementPage resource="reviews" />;
  }
  if (
    [
      "profile",
      "addresses",
      "shopping-lists",
      "checkout",
      "orders",
      "chat",
    ].includes(route)
  ) {
    await requireRole(
      ["profile", "orders"].includes(route)
        ? ["CUSTOMER", "SHOPKEEPER", "ADMIN"]
        : ["CUSTOMER"],
    );
    if (route === "profile" && !id) return <ProfilePage />;
    if (route === "addresses" && !id) return <AddressesPage />;
    if (route === "shopping-lists" && !id) return <ShoppingListsPage />;
    if (route === "checkout" && !id) return <CartPage checkout />;
    if (route === "orders") return id ? <OrderPage id={id} /> : <OrdersPage />;
    if (route === "chat" && !id)
      return (
        <ChatPage initialRoom={typeof s.room === "string" ? s.room : ""} />
      );
  }
  if (route === "shopkeeper" || route === "admin") {
    await requireRole(route === "admin" ? ["ADMIN"] : ["SHOPKEEPER"]);
    if (!id) return <DashboardPage />;
    if (route === "admin" && id === "settings") return <PlatformSettingsPage />;
    if (route === "admin" && id === "reports") return <ReportsPage />;
    if (["orders"].includes(id)) return <OrdersPage />;
    if (id === "chat" && route === "shopkeeper")
      return (
        <ChatPage initialRoom={typeof s.room === "string" ? s.room : ""} />
      );
    if (["settings"].includes(id) && route === "shopkeeper")
      return <ProfilePage />;
    if (id === "shop" && route === "shopkeeper")
      return <ManagementPage resource="shops" />;
    if (id === "inventory" && route === "shopkeeper")
      return <ManagementPage resource="products" inventory />;
    if (
      [
        "shops",
        "products",
        "categories",
        "users",
        "reviews",
        "complaints",
      ].includes(id) &&
      (route === "admin" || ["products", "reviews"].includes(id))
    )
      return (
        <ManagementPage
          resource={
            id as
              | "shops"
              | "products"
              | "categories"
              | "users"
              | "reviews"
              | "complaints"
          }
        />
      );
  }
  notFound();
}
