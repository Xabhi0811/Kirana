"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ShoppingBag, Check, ArrowRight, Minus, Plus } from "lucide-react";
import { api } from "@/lib/api-client";
import { useQuery } from "@/hooks/use-query";
import { useRealtime } from "@/hooks/use-realtime";
import { useStore } from "@/lib/store";
import type { Address, Order, Product, Review } from "@/lib/types";
import { money, label, date, nextStatus } from "@/lib/utils";
import { reviewSchema, complaintSchema } from "@/lib/validation";
import { useProfile } from "./shell";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { EntityForm } from "./entity-form";
import { Empty, Failure, Loading, useToast } from "./feedback";
import { ConfirmAction } from "./account-pages";
export function CartPage({ checkout = false }: { checkout?: boolean }) {
  const items = useStore((s) => s.items),
    shopId = useStore((s) => s.shopId),
    shopName = useStore((s) => s.shopName),
    quantity = useStore((s) => s.quantity),
    clear = useStore((s) => s.clear);
  const profile = useProfile(),
    router = useRouter(),
    notify = useToast();
  const addresses = useQuery<Address[]>(
    checkout && profile ? "addresses" : null,
  );
  const [addressId, setAddressId] = useState(""),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string>("");
  const selected =
    addressId ||
    addresses.data?.find((a) => a.is_default)?.id ||
    addresses.data?.[0]?.id ||
    "";
  const total = items.reduce((sum, x) => sum + x.price * x.quantity, 0);
  useEffect(() => {
    Promise.resolve().then(() => setRequestId(crypto.randomUUID()));
  }, []);
  async function place() {
    if (!profile) {
      router.push("/login");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api<{ id: string }>("orders", {
        shop_id: shopId,
        address_id: selected,
        notes,
        request_id: requestId,
        items: items.map((x) => ({
          product_id: x.product_id,
          quantity: x.quantity,
          expected_price: x.price,
        })),
      });
      clear();
      notify("Order placed. Your shopkeeper will confirm it shortly.");
      router.push("/orders/" + result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function refreshPrices() {
    if (!selected) {
      notify("Select an address first.", true);
      return;
    }
    const a = addresses.data?.find((x) => x.id === selected);
    if (!a) return;
    setBusy(true);
    try {
      const updated = await Promise.all(
        items.map((x) =>
          api<Product>(
            `products/${x.product_id}?lat=${a.latitude}&lng=${a.longitude}`,
          ),
        ),
      );
      useStore.setState({
        items: items
          .map((x) => {
            const p = updated.find((y) => y.id === x.product_id)!;
            return {
              ...x,
              price: Number(p.price),
              stock: p.stock_quantity,
              quantity: Math.min(x.quantity, p.stock_quantity),
            };
          })
          .filter((x) => x.quantity > 0),
      });
      setRequestId(crypto.randomUUID());
      setError("");
      notify("Cart refreshed with current prices and stock.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <p className="eyebrow">ONE SHOP. ONE SIMPLE ORDER.</p>
        <h1>{checkout ? "Almost at your doorstep." : "Your shopping bag"}</h1>
        <p>
          {items.length
            ? `Shopping from ${shopName}`
            : "A few local favourites are all it takes."}
        </p>
      </div>
      {!items.length ? (
        <Empty
          title="Your bag is waiting"
          text="Find your everyday essentials at a nearby shop."
        >
          <Button asChild>
            <Link href="/shops">Explore nearby shops</Link>
          </Button>
        </Empty>
      ) : (
        <div className="checkout-grid">
          <section className="surface">
            {items.map((x) => (
              <div className="cart-row" key={x.product_id}>
                <div className="mini-icon">
                  <ShoppingBag size={20} />
                </div>
                <div>
                  <strong>{x.name}</strong>
                  <small>
                    {x.unit} · {money(x.price)}
                  </small>
                </div>
                <div className="qty">
                  <button
                    aria-label={"Remove one " + x.name}
                    onClick={() => quantity(x.product_id, x.quantity - 1)}
                  >
                    <Minus size={12} />
                  </button>
                  <span>{x.quantity}</span>
                  <button
                    aria-label={"Add one " + x.name}
                    disabled={x.quantity >= x.stock}
                    onClick={() => quantity(x.product_id, x.quantity + 1)}
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <b>{money(x.price * x.quantity)}</b>
              </div>
            ))}
            {checkout && (
              <>
                <h3 className="mt-8">Delivery address</h3>
                {addresses.error && (
                  <Failure
                    message={addresses.error}
                    retry={addresses.refresh}
                  />
                )}
                <div className="form-fields">
                  {addresses.data?.map((a) => (
                    <label className="address-choice" key={a.id}>
                      <input
                        type="radio"
                        name="address"
                        value={a.id}
                        checked={selected === a.id}
                        onChange={() => {
                          setAddressId(a.id);
                          setRequestId(crypto.randomUUID());
                        }}
                      />
                      <span>
                        <b>{a.label}</b>
                        <small>
                          {a.full_address}, {a.city} — {a.pincode}
                        </small>
                      </span>
                    </label>
                  ))}
                  <Link className="subtle-link" href="/addresses">
                    + Add a delivery address
                  </Link>
                  <label>
                    A note for your shopkeeper
                    <textarea
                      maxLength={2000}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="A landmark, delivery instructions, or a little hello…"
                    />
                  </label>
                </div>
              </>
            )}
          </section>
          <aside className="surface order-summary">
            <h3>Order summary</h3>
            <div>
              <span>Subtotal</span>
              <b>{money(total)}</b>
            </div>
            <div>
              <span>Delivery fee</span>
              <b className="green-text">₹0</b>
            </div>
            <div>
              <span>Handling fee</span>
              <b className="green-text">₹0</b>
            </div>
            <div className="summary-total">
              <span>Total</span>
              <b>{money(total)}</b>
            </div>
            <p className="muted">Delivered by your shop. No extra fees.</p>
            {error && (
              <>
                <p className="field-error" role="alert">
                  {error}
                </p>
                <Button
                  variant="outline"
                  className="w-full mb-3"
                  onClick={refreshPrices}
                  disabled={busy}
                >
                  Refresh cart prices & stock
                </Button>
              </>
            )}
            {checkout ? (
              <Button
                className="w-full"
                onClick={place}
                disabled={busy || !selected || !requestId}
              >
                {busy ? "Placing order…" : "Place order"}
                <ArrowRight size={16} />
              </Button>
            ) : (
              <Button asChild className="w-full">
                <Link href={profile ? "/checkout" : "/login"}>
                  Continue to checkout
                  <ArrowRight size={16} />
                </Link>
              </Button>
            )}
            <ConfirmAction label="Clear cart" onConfirm={async () => clear()} />
          </aside>
        </div>
      )}
    </div>
  );
}
export function OrdersPage() {
  const [page, setPage] = useState(0);
  const paged = useQuery<Order[]>("orders?page=" + page);
  useRealtime("orders", paged.refresh);
  return (
    <div className="page">
      <div className="page-heading">
        <p className="eyebrow">YOUR LOCAL SHOPPING STORY</p>
        <h1>Your orders</h1>
        <p>Follow your latest order or revisit an old favourite.</p>
      </div>
      {paged.loading ? (
        <Loading />
      ) : paged.error ? (
        <Failure message={paged.error} retry={paged.refresh} />
      ) : paged.data?.length ? (
        <div className="order-list">
          {paged.data.map((o) => (
            <Link
              className="surface order-row"
              href={"/orders/" + o.id}
              key={o.id}
            >
              <div className="mini-icon">
                <ShoppingBag size={21} />
              </div>
              <div>
                <h3>{o.shops.name}</h3>
                <small className="muted">
                  {o.order_number} · {date(o.created_at)}
                </small>
              </div>
              <span className="badge">{label(o.status)}</span>
              <b>{money(Number(o.total_amount))}</b>
              <ArrowRight size={17} />
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title="Your first local order awaits"
          text="Find a shop you love and fill your bag."
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
          disabled={!paged.data || paged.data.length < 24}
          onClick={() => setPage((x) => x + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
export function OrderPage({ id }: { id: string }) {
  const result = useQuery<Order>("orders/" + id),
    profile = useProfile(),
    notify = useToast(),
    router = useRouter();
  const reviews = useQuery<Review[]>(
    profile?.role === "CUSTOMER" ? "reviews" : null,
  );
  const [modal, setModal] = useState<"review" | "complaint" | null>(null),
    [busy, setBusy] = useState(false);
  useRealtime("orders", result.refresh, "id=eq." + id);
  useRealtime("order_tracking", result.refresh, "order_id=eq." + id);
  async function update(status: string) {
    setBusy(true);
    try {
      await api("orders/" + id, {
        status,
        note:
          status === "CANCELLED" ? "Order cancelled" : "Status updated by shop",
      });
      result.refresh();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (result.loading)
    return (
      <div className="page">
        <Loading />
      </div>
    );
  if (result.error)
    return (
      <div className="page">
        <Failure message={result.error} retry={result.refresh} />
      </div>
    );
  const o = result.data;
  if (!o) return null;
  const canManage = profile?.role !== "CUSTOMER";
  const reviewed = reviews.data?.some((r) => r.order_id === o.id);
  const stages = [
    "PLACED",
    "ACCEPTED",
    "PREPARING",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
  ];
  return (
    <div className="page">
      <Link href="/orders" className="subtle-link mb-5">
        ← All orders
      </Link>
      <div className="page-heading horizontal">
        <div>
          <p className="eyebrow">{o.order_number}</p>
          <h1>{label(o.status)}</h1>
          <p>
            From {o.shops.name} · {date(o.created_at)}
          </p>
        </div>
        <span className="badge">{money(Number(o.total_amount))}</span>
      </div>
      <div className="checkout-grid">
        <div>
          <section className="surface">
            <h3>From shop to doorstep</h3>
            <div className="order-timeline">
              {stages.map((status) => {
                const track = o.order_tracking.find((t) => t.status === status);
                return (
                  <div key={status} className={track ? "completed" : ""}>
                    <span>{track ? <Check size={13} /> : ""}</span>
                    <div>
                      <b>{label(status)}</b>
                      <small>
                        {track
                          ? date(track.created_at)
                          : "Waiting for your shopkeeper"}
                      </small>
                    </div>
                  </div>
                );
              })}
              {o.status === "CANCELLED" && (
                <p className="field-error">
                  This order was cancelled. Reserved stock has been restored.
                </p>
              )}
            </div>
            {canManage && nextStatus[o.status] && (
              <Button
                disabled={busy}
                onClick={() => update(nextStatus[o.status])}
              >
                {label(nextStatus[o.status])}
              </Button>
            )}
            {["PLACED", "ACCEPTED"].includes(o.status) && (
              <ConfirmAction
                label={canManage ? "Reject / cancel order" : "Cancel order"}
                onConfirm={() => update("CANCELLED")}
              />
            )}
          </section>
          <section className="surface mt-5">
            <h3>Your items</h3>
            {o.order_items.map((x) => (
              <div className="summary-line" key={x.id}>
                <span>
                  {x.product_name} × {x.quantity}
                </span>
                <b>{money(Number(x.total_price))}</b>
              </div>
            ))}
            <div className="summary-line">
              <span>Delivery & handling</span>
              <b>₹0</b>
            </div>
            <div className="summary-line summary-total">
              <span>Total</span>
              <b>{money(Number(o.total_amount))}</b>
            </div>
          </section>
        </div>
        <section className="surface order-summary">
          <h3>Delivery details</h3>
          <p>{o.delivery_address.full_address}</p>
          <p className="muted">
            {o.delivery_address.city}, {o.delivery_address.pincode}
          </p>
          {o.notes && (
            <>
              <h4>Your note</h4>
              <p>{o.notes}</p>
            </>
          )}
          {profile?.role === "CUSTOMER" && (
            <div className="form-fields">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const r = await api<{ id: string }>("chat", {
                      shop_id: o.shop_id,
                    });
                    await api("chat/" + r.id + "/messages", {
                      message_type: "ORDER",
                      reference_id: o.id,
                      message: "",
                    });
                    router.push("/chat?room=" + r.id);
                  } catch (e) {
                    notify((e as Error).message, true);
                  }
                }}
              >
                Chat about this order
              </Button>
              {o.status === "DELIVERED" && !reviewed && (
                <Button onClick={() => setModal("review")}>
                  Leave a review
                </Button>
              )}
              {reviewed && (
                <p className="green-text">Thanks for reviewing this order.</p>
              )}
              <Button variant="ghost" onClick={() => setModal("complaint")}>
                Raise a complaint
              </Button>
            </div>
          )}
        </section>
      </div>
      <Dialog open={!!modal} onOpenChange={(v) => !v && setModal(null)}>
        <DialogContent>
          <DialogTitle className="dialog-title">
            {modal === "review"
              ? "How was your local shop?"
              : "Tell us what happened"}
          </DialogTitle>
          <DialogDescription className="muted mb-5">
            {modal === "review"
              ? "Your feedback helps your neighbours."
              : "The marketplace team will review your complaint."}
          </DialogDescription>
          <EntityForm
            key={modal}
            schema={modal === "review" ? reviewSchema : complaintSchema}
            defaults={{
              order_id: o.id,
              shop_id: o.shop_id,
              rating: 5,
              comment: "",
              subject: "",
              description: "",
            }}
            fields={
              modal === "review"
                ? [
                    {
                      name: "rating",
                      label: "Rating",
                      type: "select",
                      options: [1, 2, 3, 4, 5].map((x) => ({
                        value: String(x),
                        label: x + " stars",
                      })),
                    },
                    { name: "comment", label: "Your review", type: "textarea" },
                  ]
                : [
                    { name: "subject", label: "Subject" },
                    {
                      name: "description",
                      label: "What happened?",
                      type: "textarea",
                    },
                  ]
            }
            path={modal === "review" ? "reviews" : "complaints"}
            onSaved={() => {
              setModal(null);
              reviews.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
