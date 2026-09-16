"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Send, ShoppingBag, ListChecks } from "lucide-react";
import { z } from "zod";
import { useStore } from "@/lib/store";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api-client";
import type { ShoppingList, ListItem, Shop, Product } from "@/lib/types";
import { listItemSchema } from "@/lib/validation";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { EntityForm } from "./entity-form";
import { ConfirmAction } from "./account-pages";
import { locationParams } from "./discovery";
import { Empty, Failure, Loading, useToast } from "./feedback";
export function ShoppingListsPage() {
  const [page, setPage] = useState(0);
  const result = useQuery<ShoppingList[]>("lists?page=" + page),
    notify = useToast();
  const [create, setCreate] = useState(false),
    [rename, setRename] = useState<ShoppingList | null>(null),
    [edit, setEdit] = useState<{
      list: ShoppingList;
      item: ListItem | null;
    } | null>(null),
    [share, setShare] = useState<{
      list: ShoppingList;
      convert: boolean;
    } | null>(null);
  return (
    <div className="page">
      <div className="page-heading horizontal">
        <div>
          <p className="eyebrow">A LITTLE PLANNING GOES A LONG WAY</p>
          <h1>Your shopping lists</h1>
          <p>From weekly staples to weekend plans. Keep it all together.</p>
        </div>
        <Button onClick={() => setCreate(true)}>
          <Plus size={16} />
          New list
        </Button>
      </div>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <Failure message={result.error} retry={result.refresh} />
      ) : result.data?.length ? (
        <div className="shopping-list-grid">
          {result.data.map((list) => (
            <section className="surface" key={list.id}>
              <div className="card-heading">
                <div className="flex gap-3 items-center">
                  <div className="list-icon">
                    <ListChecks size={20} />
                  </div>
                  <h3>{list.name}</h3>
                </div>
                <div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRename(list)}
                  >
                    Rename
                  </Button>
                  <ConfirmAction
                    label="Delete"
                    onConfirm={async () => {
                      await api("lists/" + list.id, {}, "DELETE");
                      result.refresh();
                    }}
                  />
                </div>
              </div>
              {list.shopping_list_items.length ? (
                list.shopping_list_items.map((item) => (
                  <div className="list-product" key={item.id}>
                    <button onClick={() => setEdit({ list, item })}>
                      <b>{item.name}</b>
                      <small>
                        {item.quantity} × {item.unit}
                      </small>
                    </button>
                    <ConfirmAction
                      label="Remove"
                      onConfirm={async () => {
                        await api("list-items/" + item.id, {}, "DELETE");
                        result.refresh();
                      }}
                    />
                  </div>
                ))
              ) : (
                <p className="muted my-5">
                  Add a few essentials to get started.
                </p>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEdit({ list, item: null })}
              >
                <Plus size={13} />
                Add item
              </Button>
              <div className="dialog-actions mt-5">
                <Button
                  size="sm"
                  disabled={!list.shopping_list_items.length}
                  onClick={() => setShare({ list, convert: false })}
                >
                  <Send size={13} />
                  Send to shop
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!list.shopping_list_items.length}
                  onClick={() => setShare({ list, convert: true })}
                >
                  <ShoppingBag size={13} />
                  Convert to cart
                </Button>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Empty
          title="Make your next shop easier"
          text="Create a shopping list and send it directly to a shopkeeper."
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
        open={create || !!rename}
        onOpenChange={(v) => {
          if (!v) {
            setCreate(false);
            setRename(null);
          }
        }}
      >
        <DialogContent>
          <DialogTitle className="dialog-title">
            {rename ? "Rename your list" : "What are you planning?"}
          </DialogTitle>
          <DialogDescription className="muted mb-5">
            Give your shopping list a name.
          </DialogDescription>
          <EntityForm
            key={rename?.id || "new"}
            schema={z.object({ name: z.string().trim().min(1).max(100) })}
            defaults={{ name: rename?.name || "" }}
            fields={[{ name: "name", label: "List name" }]}
            path={"lists" + (rename ? "/" + rename.id : "")}
            onSaved={() => {
              setCreate(false);
              setRename(null);
              result.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent>
          <DialogTitle className="dialog-title">
            {edit?.item ? "Edit item" : "Add to your list"}
          </DialogTitle>
          <DialogDescription className="muted mb-5">
            You can also save a specific product from its product card.
          </DialogDescription>
          {edit && (
            <EntityForm
              key={edit.item?.id || edit.list.id}
              schema={listItemSchema}
              defaults={
                edit.item
                  ? { ...edit.item }
                  : {
                      list_id: edit.list.id,
                      product_id: null,
                      name: "",
                      quantity: 1,
                      unit: "item",
                    }
              }
              fields={[
                { name: "name", label: "Product name" },
                { name: "quantity", label: "Quantity", type: "number" },
                { name: "unit", label: "Unit (item, 1 kg, 1 L…)" },
              ]}
              path={"list-items" + (edit.item ? "/" + edit.item.id : "")}
              onSaved={() => {
                setEdit(null);
                result.refresh();
                notify("Your list is up to date.");
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      {share && (
        <ShopPicker
          list={share.list}
          convert={share.convert}
          onClose={() => setShare(null)}
        />
      )}
    </div>
  );
}
function ShopPicker({
  list,
  convert,
  onClose,
}: {
  list: ShoppingList;
  convert: boolean;
  onClose: () => void;
}) {
  const location = useStore((s) => s.location),
    add = useStore((s) => s.add),
    currentShop = useStore((s) => s.shopId);
  const [page, setPage] = useState(0),
    [chosen, setChosen] = useState<Shop | null>(null),
    [busy, setBusy] = useState(false);
  const shops = useQuery<Shop[]>(
      location
        ? "search/shops?" +
            locationParams(location) +
            "&open_only=true&page=" +
            page
        : null,
    ),
    notify = useToast(),
    router = useRouter();
  async function send(shop: Shop, replace = false) {
    if (convert && currentShop && !replace) {
      setChosen(shop);
      return;
    }
    setBusy(true);
    try {
      if (convert) {
        if (!location) return;
        const resolved = await api<{
          products: (Product & { quantity: number })[];
          missing: string[];
        }>("lists/" + list.id + "/resolve", { shop_id: shop.id, ...location });
        if (resolved.missing.length) {
          notify(
            "Unavailable at this shop: " +
              resolved.missing.join(", ") +
              ". Edit your list or choose another shop.",
            true,
          );
          return;
        }
        if (!resolved.products.length) {
          notify("This list has no products available at this shop.", true);
          return;
        }
        useStore.getState().clear();
        for (const p of resolved.products) {
          for (let i = 0; i < p.quantity; i++) add(p);
        }
        notify("Your list is now in your cart.");
        router.push("/cart");
      } else {
        const room = await api<{ id: string }>("chat", { shop_id: shop.id });
        await api("chat/" + room.id + "/messages", {
          message_type: "PRODUCT_LIST",
          reference_id: list.id,
          message: "",
        });
        router.push("/chat?room=" + room.id);
      }
      onClose();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogTitle className="dialog-title">
          {convert ? "Choose a shop for your cart" : "Send your list to a shop"}
        </DialogTitle>
        <DialogDescription className="muted mb-5">
          {convert
            ? "We’ll match your list against the shop’s live catalog."
            : "Your shopkeeper receives a structured, easy-to-read list."}
        </DialogDescription>
        {!location ? (
          <p>Choose your location in the top bar first.</p>
        ) : shops.error ? (
          <Failure message={shops.error} retry={shops.refresh} />
        ) : chosen ? (
          <>
            <p>
              Your cart already contains items. Replace the cart with this list?
            </p>
            <div className="dialog-actions">
              <Button disabled={busy} onClick={() => send(chosen, true)}>
                Replace cart
              </Button>
              <Button variant="outline" onClick={() => setChosen(null)}>
                Keep current cart
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="picker-list">
              {shops.data?.map((s) => (
                <Button
                  key={s.id}
                  variant="outline"
                  disabled={busy}
                  onClick={() => send(s)}
                >
                  {s.name}
                  <small>{s.distance?.toFixed(1)} km</small>
                </Button>
              ))}
            </div>
            {!shops.loading && !shops.data?.length && (
              <p className="muted">No open shops at this location.</p>
            )}
            <div className="pagination">
              <Button
                size="sm"
                variant="outline"
                disabled={!page}
                onClick={() => setPage((x) => x - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!shops.data || shops.data.length < 24}
                onClick={() => setPage((x) => x + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
