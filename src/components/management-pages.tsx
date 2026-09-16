"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Plus,
  ArrowRight,
  Store,
  Package,
  ClipboardList,
  MessageCircle,
} from "lucide-react";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api-client";
import { shopSchema, productSchema, categorySchema } from "@/lib/validation";
import type { Shop, Category } from "@/lib/types";
import { money, label, date } from "@/lib/utils";
import { useProfile } from "./shell";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { EntityForm, type Field } from "./entity-form";
import { Empty, Failure, Loading, useToast } from "./feedback";
import { ConfirmAction } from "./account-pages";
export function DashboardPage() {
  const profile = useProfile(),
    admin = profile?.role === "ADMIN";
  const stats = useQuery<Record<string, number>>("stats");
  return (
    <div className="page">
      <div className="page-heading">
        <p className="eyebrow">
          {admin ? "MARKETPLACE OVERVIEW" : "YOUR NEIGHBOURHOOD BUSINESS"}
        </p>
        <h1>
          {admin
            ? "A pulse on your marketplace."
            : "Good business starts locally."}
        </h1>
        <p>
          Welcome back, {profile?.name.split(" ")[0]}. Here’s how things are
          looking.
        </p>
      </div>
      {stats.loading ? (
        <Loading />
      ) : stats.error ? (
        <Failure message={stats.error} retry={stats.refresh} />
      ) : (
        <div className="stats-grid">
          {Object.entries(stats.data || {}).map(([name, value]) => (
            <div className="surface stat" key={name}>
              <small>{name}</small>
              <b>
                {name === "Order value"
                  ? money(value)
                  : Number(value).toLocaleString("en-IN", {
                      maximumFractionDigits: 1,
                    })}
              </b>
            </div>
          ))}
        </div>
      )}
      <h2 className="mt-8">Keep things moving</h2>
      <div className="quick-links">
        {(admin
          ? ([
              ["/admin/shops", "Shop approvals", Store],
              ["/admin/orders", "Marketplace orders", ClipboardList],
              ["/admin/complaints", "Customer support", MessageCircle],
            ] as const)
          : ([
              ["/shopkeeper/shop", "Manage your shop", Store],
              ["/shopkeeper/products", "Update your catalog", Package],
              ["/shopkeeper/orders", "Prepare your orders", ClipboardList],
              ["/shopkeeper/chat", "Talk to customers", MessageCircle],
            ] as const)
        ).map(([href, name, Icon]) => (
          <Link className="surface" href={href} key={href}>
            <Icon size={22} />
            <strong>{name}</strong>
            <ArrowRight size={18} />
          </Link>
        ))}
      </div>
      {!admin && (
        <div className="management-note">
          New shops require admin approval before customers can discover them.
          Set your location and delivery radius carefully.
        </div>
      )}
    </div>
  );
}
export function ManagementPage({
  resource,
  inventory = false,
}: {
  resource:
    "shops" | "products" | "categories" | "users" | "reviews" | "complaints";
  inventory?: boolean;
}) {
  const profile = useProfile(),
    admin = profile?.role === "ADMIN",
    notify = useToast();
  const [page, setPage] = useState(0),
    [edit, setEdit] = useState<Record<string, unknown> | null | undefined>(
      undefined,
    );
  const path = ["reviews", "complaints"].includes(resource)
    ? resource
    : "manage/" + resource;
  const result = useQuery<Record<string, unknown>[]>(path + "?page=" + page);
  const categories = useQuery<Category[]>(
      ["shops", "products", "categories"].includes(resource)
        ? "categories"
        : null,
    ),
    shops = useQuery<Shop[]>(resource === "products" ? "manage/shops" : null);
  const canCreate =
    ["categories", "products"].includes(resource) ||
    (resource === "shops" && !admin);
  const categoryOptions =
    categories.data
      ?.filter((c) => c.id !== edit?.id)
      .map((c) => ({ value: c.id, label: c.name })) || [];
  const fields: Field[] =
    resource === "shops"
      ? [
          { name: "name", label: "Shop name" },
          { name: "description", label: "Description", type: "textarea" },
          {
            name: "category_id",
            label: "Category",
            type: "select",
            options: categoryOptions,
          },
          { name: "address", label: "Shop address", type: "textarea" },
          { name: "latitude", label: "Latitude", type: "number" },
          { name: "longitude", label: "Longitude", type: "number" },
          {
            name: "delivery_radius_km",
            label: "Delivery radius (km)",
            type: "number",
          },
          { name: "open_time", label: "Opening time", type: "time" },
          { name: "close_time", label: "Closing time", type: "time" },
          {
            name: "status",
            label: "Shop status",
            type: "select",
            options: ["OPEN", "CLOSED", "INACTIVE"].map((x) => ({
              value: x,
              label: label(x),
            })),
          },
          { name: "phone", label: "Shop phone", type: "tel" },
          { name: "email", label: "Shop email", type: "email" },
          {
            name: "logo_url",
            label: "Shop logo",
            type: "upload",
            bucket: "shop-images",
          },
        ]
      : resource === "products"
        ? [
            {
              name: "shop_id",
              label: "Shop",
              type: "select",
              options:
                shops.data?.map((s) => ({ value: s.id, label: s.name })) || [],
            },
            {
              name: "category_id",
              label: "Category",
              type: "select",
              options: categoryOptions,
            },
            { name: "name", label: "Product name" },
            { name: "description", label: "Description", type: "textarea" },
            { name: "brand", label: "Brand" },
            { name: "unit", label: "Unit (1 kg, 500 ml…) " },
            { name: "price", label: "Price (₹)", type: "number" },
            {
              name: "stock_quantity",
              label: "Available stock",
              type: "number",
            },
            {
              name: "is_active",
              label: "Active product listing",
              type: "checkbox",
            },
            ...(!admin
              ? [
                  {
                    name: "image_url",
                    label: "Product image",
                    type: "upload",
                    bucket: "product-images",
                  } as Field,
                ]
              : []),
          ]
        : [
            { name: "name", label: "Category name" },
            { name: "description", label: "Description", type: "textarea" },
            {
              name: "parent_id",
              label: "Parent category",
              type: "select",
              nullable: true,
              options: categoryOptions,
            },
            {
              name: "image_url",
              label: "Category image",
              type: "upload",
              bucket: "category-images",
            },
          ];
  const defaults: Record<string, unknown> =
    edit ||
    (resource === "shops"
      ? {
          name: "",
          description: "",
          category_id: categories.data?.[0]?.id || "",
          address: "",
          latitude: "",
          longitude: "",
          delivery_radius_km: 5,
          open_time: "08:00",
          close_time: "21:00",
          status: "OPEN",
          phone: "",
          email: "",
          logo_url: null,
        }
      : resource === "products"
        ? {
            name: "",
            description: "",
            shop_id: shops.data?.[0]?.id || "",
            category_id: categories.data?.[0]?.id || "",
            brand: "",
            unit: "1 kg",
            price: 0,
            stock_quantity: 0,
            is_active: true,
            image_url: null,
          }
        : { name: "", description: "", parent_id: null, image_url: null });
  async function update(path: string, body: unknown) {
    try {
      await api(path, body);
      result.refresh();
      notify("Updated successfully.");
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  const columns =
    resource === "shops"
      ? ["name", "address", "status", "approval_status"]
      : resource === "products"
        ? ["name", "unit", "price", "stock_quantity", "is_active"]
        : resource === "users"
          ? ["name", "email", "role", "status"]
          : resource === "categories"
            ? ["name", "description", "parent_id"]
            : resource === "reviews"
              ? ["rating", "comment", "created_at"]
              : ["subject", "description", "status", "created_at"];
  return (
    <div className="page">
      <div className="page-heading horizontal">
        <div>
          <p className="eyebrow">
            {admin ? "MARKETPLACE MANAGEMENT" : "YOUR BUSINESS"}
          </p>
          <h1>{inventory ? "Inventory" : label(resource)}</h1>
          <p>
            {resource === "products"
              ? "Keep prices, stock and availability up to date."
              : resource === "shops"
                ? "Bring your local shop online."
                : "Manage your marketplace records."}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setEdit(null)}>
            <Plus size={16} />
            Add {resource.slice(0, -1)}
          </Button>
        )}
      </div>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <Failure message={result.error} retry={result.refresh} />
      ) : result.data?.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{label(c)}</th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((row) => (
                <tr key={String(row.id)}>
                  {columns.map((c) => (
                    <td key={c}>
                      {c === "price"
                        ? money(Number(row[c]))
                        : c === "created_at"
                          ? date(String(row[c]))
                          : c === "parent_id"
                            ? categories.data?.find((x) => x.id === row[c])
                                ?.name || "Top-level"
                            : typeof row[c] === "boolean"
                              ? row[c]
                                ? "Active"
                                : "Inactive"
                              : String(row[c] ?? "—")}
                    </td>
                  ))}
                  <td>
                    <div className="table-actions">
                      {["products", "categories"].includes(resource) ||
                      (resource === "shops" && !admin) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEdit(row)}
                        >
                          Edit
                        </Button>
                      ) : null}
                      {resource === "shops" && admin && (
                        <select
                          aria-label={"Approval for " + row.name}
                          value={String(row.approval_status)}
                          onChange={(e) =>
                            update("manage/shops/" + row.id, {
                              approval_status: e.target.value,
                            })
                          }
                        >
                          {["PENDING", "APPROVED", "REJECTED", "SUSPENDED"].map(
                            (x) => (
                              <option key={x} value={x}>
                                {label(x)}
                              </option>
                            ),
                          )}
                        </select>
                      )}
                      {resource === "users" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={row.id === profile?.id}
                          onClick={() =>
                            update("manage/users/" + row.id, {
                              status:
                                row.status === "ACTIVE"
                                  ? "SUSPENDED"
                                  : "ACTIVE",
                            })
                          }
                        >
                          {row.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                        </Button>
                      )}
                      {resource === "complaints" && admin && (
                        <select
                          aria-label="Complaint status"
                          value={String(row.status)}
                          onChange={(e) =>
                            update("complaints/" + row.id, {
                              status: e.target.value,
                            })
                          }
                        >
                          {["OPEN", "IN_PROGRESS", "RESOLVED"].map((x) => (
                            <option key={x} value={x}>
                              {label(x)}
                            </option>
                          ))}
                        </select>
                      )}
                      {(resource === "products" ||
                        resource === "categories" ||
                        (resource === "reviews" && admin)) && (
                        <ConfirmAction
                          label={
                            resource === "products" ? "Deactivate" : "Remove"
                          }
                          onConfirm={async () => {
                            await api(
                              (resource === "reviews"
                                ? "reviews/"
                                : "manage/" + resource + "/") + row.id,
                              {},
                              "DELETE",
                            );
                            result.refresh();
                          }}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title={"No " + resource + " yet"}
          text={
            resource === "shops"
              ? "Create your shop, then add products while an admin reviews your application."
              : "New records will appear here."
          }
        />
      )}
      <div className="pagination">
        <Button
          variant="outline"
          disabled={!page}
          onClick={() => setPage((x) => x - 1)}
        >
          Previous
        </Button>
        <span>Page {page + 1}</span>
        <Button
          variant="outline"
          disabled={!result.data || result.data.length < 24}
          onClick={() => setPage((x) => x + 1)}
        >
          Next
        </Button>
      </div>
      <Dialog
        open={edit !== undefined}
        onOpenChange={(v) => !v && setEdit(undefined)}
      >
        <DialogContent>
          <DialogTitle className="dialog-title">
            {edit ? "Edit" : "Add"} {resource.slice(0, -1)}
          </DialogTitle>
          <DialogDescription className="muted mb-5">
            {resource === "shops"
              ? "Set your location and delivery area. New shops await admin approval."
              : "Update the details below."}
          </DialogDescription>
          <EntityForm
            key={String(edit?.id || "new")}
            schema={
              resource === "shops"
                ? shopSchema
                : resource === "products"
                  ? productSchema
                  : categorySchema
            }
            defaults={defaults}
            fields={fields}
            path={"manage/" + resource + (edit ? "/" + edit.id : "")}
            onSaved={() => {
              setEdit(undefined);
              result.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
