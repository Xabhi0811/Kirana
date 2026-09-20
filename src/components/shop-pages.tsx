"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Store, MapPin, Clock, MessageCircle, Star } from "lucide-react";
import { useStore } from "@/lib/store";
import { useQuery } from "@/hooks/use-query";
import type { Shop, Product, Review } from "@/lib/types";
import { api } from "@/lib/api-client";
import { locationParams } from "./discovery";
import { Button } from "./ui/button";
import { ProductCard, LocationEmpty } from "./product-card";
import { Empty, Failure, Loading, useToast } from "./feedback";
import { useProfile } from "./shell";
import { GoogleMap } from "./google-map";
export function ShopPage({ id }: { id: string }) {
  const location = useStore((s) => s.location),
    profile = useProfile(),
    router = useRouter(),
    notify = useToast();
  const [page, setPage] = useState(0);
  const shop = useQuery<Shop>(
      location ? `shops/${id}?` + locationParams(location) : null,
    ),
    products = useQuery<Product[]>(
      location
        ? "search/products?" +
            locationParams(location) +
            `&shop=${id}&page=${page}`
        : null,
    ),
    reviews = useQuery<Review[]>("shop-reviews/" + id);
  if (!location)
    return (
      <div className="page">
        <LocationEmpty />
      </div>
    );
  if (shop.loading)
    return (
      <div className="page">
        <Loading />
      </div>
    );
  if (shop.error)
    return (
      <div className="page">
        <Failure message={shop.error} retry={shop.refresh} />
      </div>
    );
  const s = shop.data;
  if (!s) return null;
  return (
    <div className="page">
      <Link className="subtle-link mb-5" href="/shops">
        ← All nearby shops
      </Link>
      <div className="shop-banner">
        <div className="shop-big-icon">
          {s.logo_url ? (
            <span
              role="img"
              aria-label={`${s.name} logo`}
              className="block h-20 w-20 rounded-lg bg-cover bg-center"
              style={{ backgroundImage: `url(${JSON.stringify(s.logo_url)})` }}
            />
          ) : (
            <Store size={40} />
          )}
        </div>
        <div>
          <p className="eyebrow">YOUR LOCAL SHOP</p>
          <h1>{s.name}</h1>
          <p>{s.description}</p>
          <div className="shop-info">
            <span>
              <MapPin size={15} />
              {s.distance?.toFixed(1)} km away
            </span>
            <span>
              <Star size={15} />
              {Number(s.rating || 0).toFixed(1)}
            </span>
            <span>
              <Clock size={15} />
              {s.open_time.slice(0, 5)}–{s.close_time.slice(0, 5)}
            </span>
            <span className="badge">{s.status}</span>
          </div>
          <p className="muted">
            {s.address} · Delivers within {s.delivery_radius_km} km
          </p>
          <div className="flex gap-4 mb-3">
            {s.phone && <a href={`tel:${s.phone}`}>{s.phone}</a>}
            {s.email && <a href={`mailto:${s.email}`}>{s.email}</a>}
          </div>
          <a
            className="subtle-link"
            href={`https://www.openstreetmap.org/?mlat=${s.latitude}&mlon=${s.longitude}#map=17/${s.latitude}/${s.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View shop on map ↗
          </a>
          {profile?.role === "CUSTOMER" && (
            <Link className="subtle-link ml-4" href={`/complaints?shop=${id}`}>
              Report a problem
            </Link>
          )}
        </div>
        <Button
          onClick={async () => {
            if (!profile) {
              router.push("/login");
              return;
            }
            try {
              const r = await api<{ id: string }>("chat", { shop_id: id });
              router.push("/chat?room=" + r.id);
            } catch (e) {
              notify((e as Error).message, true);
            }
          }}
        >
          <MessageCircle size={15} />
          Chat with shop
        </Button>
      </div>
      <div className="mt-8">
        <GoogleMap
          value={{ latitude: s.latitude, longitude: s.longitude }}
          customerLocation={location}
          deliveryRadiusKm={Number(s.delivery_radius_km)}
          primaryLabel="Shop"
        />
      </div>
      <div className="section-title mt-8">
        <h2>In this shop</h2>
        <span className="muted">Fresh picks. Fair prices.</span>
      </div>
      {products.loading ? (
        <Loading />
      ) : products.error ? (
        <Failure message={products.error} retry={products.refresh} />
      ) : products.data?.length ? (
        <div className="product-grid mt-5">
          {products.data.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <Empty text="This shop is getting its catalog ready." />
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
          disabled={!products.data || products.data.length < 24}
          onClick={() => setPage((x) => x + 1)}
        >
          Next
        </Button>
      </div>
      <h2 className="mt-8">From your neighbours</h2>
      {reviews.data?.length ? (
        <div className="review-grid">
          {reviews.data.map((r) => (
            <div className="surface" key={r.id}>
              <p className="green-text">
                {"★".repeat(r.rating)}
                {"☆".repeat(5 - r.rating)}
              </p>
              <p>{r.comment || "A happy local shopping experience."}</p>
              <small className="muted">Verified order</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No reviews yet.</p>
      )}
    </div>
  );
}
export function ProductPage({ id }: { id: string }) {
  const location = useStore((s) => s.location);
  const product = useQuery<Product>(
    location ? "products/" + id + "?" + locationParams(location) : null,
  );
  return (
    <div className="page narrow">
      <Link className="subtle-link mb-5" href="/search">
        ← Explore products
      </Link>
      {!location ? (
        <LocationEmpty />
      ) : product.loading ? (
        <Loading />
      ) : product.error ? (
        <Failure message={product.error} retry={product.refresh} />
      ) : (
        product.data && (
          <>
            <h1>Your everyday essential</h1>
            <ProductCard product={product.data} />
            <section className="surface mt-5">
              <h3>About this product</h3>
              <p>
                {product.data.description ||
                  "Available from your local neighbourhood shop."}
              </p>
              <p className="muted">
                {product.data.brand} · {product.data.unit}
              </p>
            </section>
          </>
        )
      )}
    </div>
  );
}
