"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Package,
  MessageCircle,
  ArrowLeftRight,
  Plus,
  Star,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { useQuery } from "@/hooks/use-query";
import { useStore } from "@/lib/store";
import type { Product, ShoppingList, Shop } from "@/lib/types";
import { money } from "@/lib/utils";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Empty, Failure, useToast } from "./feedback";
import { useProfile } from "./shell";
export function ListPicker({
  product,
  open,
  onClose,
}: {
  product: Product;
  open: boolean;
  onClose: () => void;
}) {
  const lists = useQuery<ShoppingList[]>(open ? "lists" : null),
    notify = useToast();
  const [busy, setBusy] = useState(false),
    [newName, setNewName] = useState("");
  async function add(id: string) {
    setBusy(true);
    try {
      await api("list-items", {
        list_id: id,
        product_id: product.id,
        name: product.name,
        quantity: 1,
        unit: product.unit,
      });
      notify("Added to your shopping list.");
      onClose();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogTitle className="dialog-title">
          Save to a shopping list
        </DialogTitle>
        <DialogDescription className="muted">
          Keep {product.name} for your next shop.
        </DialogDescription>
        {lists.error && <Failure message={lists.error} retry={lists.refresh} />}
        <div className="picker-list">
          {lists.data?.map((l) => (
            <Button
              key={l.id}
              variant="outline"
              disabled={busy}
              onClick={() => add(l.id)}
            >
              {l.name}
            </Button>
          ))}
        </div>
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            setBusy(true);
            try {
              const l = await api<{ id: string }>("lists", { name: newName });
              await add(l.id);
            } catch (err) {
              notify((err as Error).message, true);
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            required
            maxLength={100}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New list name"
          />
          <Button size="sm" disabled={busy}>
            Create & add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function ProductCard({
  product: p,
  best = false,
}: {
  product: Product;
  best?: boolean;
}) {
  const router = useRouter(),
    profile = useProfile(),
    notify = useToast();
  const add = useStore((s) => s.add),
    [cross, setCross] = useState(false),
    [save, setSave] = useState(false);
  function addProduct(replace = false) {
    if (!profile) {
      router.push("/login");
      return;
    }
    const result = add(p, replace);
    if (result === "cross-shop") setCross(true);
    else if (result === "unavailable")
      notify("This product is out of stock or the shop is closed.", true);
    else {
      setCross(false);
      notify("Added to your cart.");
    }
  }
  async function chat() {
    if (!profile) {
      router.push("/login");
      return;
    }
    try {
      const room = await api<{ id: string }>("chat", { shop_id: p.shop_id });
      await api(`chat/${room.id}/messages`, {
        message_type: "PRODUCT",
        reference_id: p.id,
        message: "",
      });
      router.push("/chat?room=" + room.id);
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  return (
    <article className="product-card">
      {best && <div className="best-ribbon">Lowest price</div>}
      <Link href={"/products/" + p.id} className="product-image">
        {p.image_url ? (
          <Image src={p.image_url} alt={p.name} width={100} height={100} />
        ) : (
          <Package size={35} strokeWidth={1.3} />
        )}
      </Link>
      <div className="product-body">
        <small className="eyebrow">
          {p.brand || "LOCAL ESSENTIAL"} · {p.unit}
        </small>
        <Link href={"/products/" + p.id}>
          <h3>{p.name}</h3>
        </Link>
        <Link className="product-shop" href={"/shops/" + p.shop_id}>
          {p.shop_name}
        </Link>
        <div className="product-meta">
          <span>{p.distance?.toFixed(1)} km</span>
          <span>
            <Star size={11} />
            {Number(p.rating || 0).toFixed(1)}
          </span>
          <span className={p.shop_status === "OPEN" ? "green-text" : ""}>
            {p.shop_status === "OPEN" ? "Open" : "Closed"}
          </span>
        </div>
        <div className="product-price">
          <b>{money(Number(p.price))}</b>
          <small className={p.stock_quantity ? "green-text" : "field-error"}>
            {p.stock_quantity ? `${p.stock_quantity} in stock` : "Out of stock"}
          </small>
        </div>
        <Button
          className="w-full"
          size="sm"
          disabled={!p.stock_quantity || p.shop_status !== "OPEN"}
          onClick={() => addProduct()}
        >
          <Plus size={14} />
          Add to cart
        </Button>
        <div className="product-actions">
          <Link
            href={
              "/compare?q=" +
              encodeURIComponent(p.name) +
              "&unit=" +
              encodeURIComponent(p.unit) +
              (p.brand ? "&brand=" + encodeURIComponent(p.brand) : "")
            }
          >
            <ArrowLeftRight size={13} /> Compare
          </Link>
          <button onClick={chat}>
            <MessageCircle size={13} /> Chat
          </button>
          <button
            onClick={() => (profile ? setSave(true) : router.push("/login"))}
            aria-label="Save to list"
          >
            ☷
          </button>
        </div>
      </div>
      <Dialog open={cross} onOpenChange={setCross}>
        <DialogContent>
          <DialogTitle className="dialog-title">Start a new cart?</DialogTitle>
          <DialogDescription className="muted">
            Your cart contains products from another shop. Each order belongs to
            one shop.
          </DialogDescription>
          <div className="dialog-actions">
            <Button onClick={() => addProduct(true)}>Replace cart</Button>
            <Button variant="outline" onClick={() => setCross(false)}>
              Keep current cart
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setCross(false);
                setSave(true);
              }}
            >
              Save for later
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <ListPicker product={p} open={save} onClose={() => setSave(false)} />
    </article>
  );
}
export function ShopCard({ shop: s }: { shop: Shop }) {
  return (
    <article className="shop-card">
      <div className="shop-top">
        <div className="shop-logo">
          {s.logo_url ? (
            <Image src={s.logo_url} alt="" width={44} height={44} />
          ) : (
            <Package size={23} />
          )}
        </div>
        <div>
          <Link href={"/shops/" + s.id} className="shop-name">
            {s.name}
          </Link>
          <div className="shop-type">{s.description.slice(0, 45)}</div>
        </div>
      </div>
      <span className={`open ${s.status !== "OPEN" ? "closed" : ""}`}>
        ● {s.status}
      </span>
      <div className="shop-meta">
        <span>
          ★ <b>{Number(s.rating || 0).toFixed(1)}</b>
        </span>
        <span>{s.distance?.toFixed(1)} km away</span>
        <span>{s.delivery_radius_km} km radius</span>
      </div>
      <footer>
        <span>{s.product_count || 0} products</span>
        <Link href={"/shops/" + s.id}>View shop →</Link>
      </footer>
    </article>
  );
}
export function LocationEmpty() {
  return (
    <Empty
      title="Start with your neighbourhood"
      text="Choose your location in the top bar to discover nearby shops and compare prices."
    />
  );
}
