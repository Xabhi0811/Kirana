"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Search,
  ArrowRight,
  Store,
  Carrot,
  Flower2,
  NotebookPen,
  Croissant,
  Milk,
  ShoppingBag,
  Leaf,
} from "lucide-react";
import { useQuery, useDebounce } from "@/hooks/use-query";
import { useStore } from "@/lib/store";
import type { Category, Product, Shop, ShoppingList, Order } from "@/lib/types";
import { money, label } from "@/lib/utils";
import { ShopCard, ProductCard, LocationEmpty } from "./product-card";
import { Loading, Empty, Failure } from "./feedback";
import { Button } from "./ui/button";
import { useProfile } from "./shell";
import { MarketplaceNotice } from "./platform-pages";
import { GoogleMap } from "./google-map";
export function locationParams(
  location: { latitude: number; longitude: number } | null,
) {
  return location ? `lat=${location.latitude}&lng=${location.longitude}` : "";
}
export function HomePage() {
  const location = useStore((s) => s.location),
    profile = useProfile();
  const shops = useQuery<Shop[]>(
      location ? "search/shops?" + locationParams(location) : null,
    ),
    products = useQuery<Product[]>(
      location
        ? "search/products?" +
            locationParams(location) +
            "&q=Tata%20Salt&unit=1%20kg&sort=price"
        : null,
    ),
    categories = useQuery<Category[]>("categories");
  const lists = useQuery<ShoppingList[]>(
      profile?.role === "CUSTOMER" ? "lists" : null,
    ),
    orders = useQuery<Order[]>(profile?.role === "CUSTOMER" ? "orders" : null);
  const [query, setQuery] = useState("");
  const icons = [
    Carrot,
    Croissant,
    Milk,
    NotebookPen,
    Flower2,
    ShoppingBag,
    Leaf,
    Store,
  ];
  const active = orders.data?.find(
    (o) => !["DELIVERED", "CANCELLED"].includes(o.status),
  );
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">YOUR NEIGHBOURHOOD, ONLINE</p>
          <h1>
            Good things are
            <br />
            <i>closer</i> than you think.
          </h1>
          <p>
            Find what you need at the shops you know and love.
            <br className="desktop-break" /> Zero delivery or handling fees.
          </p>
          <form className="search-box" action="/search">
            <Search size={20} />
            <input
              name="q"
              aria-label="Search products or shops"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for products or shops"
            />
            <Button type="submit">
              Search <ArrowRight size={14} />
            </Button>
          </form>
          <div className="quick-search">
            <span>Popular:</span>
            {["Tata Salt", "Milk", "Bread"].map((q) => (
              <Link key={q} href={"/search?q=" + q}>
                {q}
              </Link>
            ))}
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="sun" />
          <div className="store-illustration">
            <div className="awning" />
            <span>FRESH & LOCAL</span>
            <div className="door" />
            <div className="window" />
          </div>
          <div className="bag bag-one">
            <Carrot size={43} />
          </div>
          <div className="bag bag-two">
            <Croissant size={43} />
          </div>
          <div className="tag float-one">✦ Zero fees</div>
          <div className="tag float-two">
            <MapMarker /> Just around the corner
          </div>
        </div>
      </section>
      <MarketplaceNotice />
      <section className="categories section">
        <div className="section-title">
          <div>
            <p className="eyebrow">SHOP BY CATEGORY</p>
            <h2>What are you looking for?</h2>
          </div>
          <Link href="/search">
            See all categories <ArrowRight size={15} />
          </Link>
        </div>
        {categories.loading ? (
          <Loading />
        ) : categories.error ? (
          <Failure message={categories.error} />
        ) : (
          <div className="category-grid">
            {categories.data
              ?.filter((c) => !c.parent_id)
              .slice(0, 6)
              .map((c, i) => {
                const Icon = icons[i % icons.length];
                return (
                  <Link
                    href={"/search?category=" + c.id}
                    className="category-card"
                    key={c.id}
                  >
                    <span className={"category-icon tone-" + i}>
                      {c.image_url ? (
                        <span
                          className="block h-10 w-10 rounded-lg bg-cover bg-center"
                          role="img"
                          aria-label={c.name}
                          style={{
                            backgroundImage: `url(${JSON.stringify(c.image_url)})`,
                          }}
                        />
                      ) : (
                        <Icon size={25} strokeWidth={1.5} />
                      )}
                    </span>
                    <strong>{c.name}</strong>
                    <small>Shop local</small>
                  </Link>
                );
              })}
          </div>
        )}
      </section>
      <section className="nearby section">
        <div className="section-title">
          <div>
            <p className="eyebrow">AROUND YOU</p>
            <h2>Discover your nearby shops</h2>
          </div>
          <Link href="/shops">
            View all shops <ArrowRight size={15} />
          </Link>
        </div>
        {!location ? (
          <LocationEmpty />
        ) : shops.loading ? (
          <Loading />
        ) : shops.error ? (
          <Failure message={shops.error} retry={shops.refresh} />
        ) : shops.data?.length ? (
          <div className="shop-grid">
            {shops.data.slice(0, 3).map((s) => (
              <ShopCard key={s.id} shop={s} />
            ))}
          </div>
        ) : (
          <Empty
            title="No shops nearby yet"
            text="Try another saved address, or check back as your neighbourhood joins Kirana."
          />
        )}
      </section>
      <section className="comparison section">
        <div className="comparison-heading">
          <div>
            <p className="eyebrow">SMARTER SHOPPING</p>
            <h2>A little comparison. A better choice.</h2>
            <p>
              One product, every nearby shop. Find the price that works for you.
            </p>
          </div>
          <Link href="/compare">
            Compare products <ArrowRight size={15} />
          </Link>
        </div>
        {!location ? (
          <LocationEmpty />
        ) : products.loading ? (
          <Loading />
        ) : products.error ? (
          <Failure message={products.error} />
        ) : products.data?.length ? (
          <div className="compare-panel">
            <div className="compare-product">
              <div className="salt-illustration">
                SALT
                <br />
                <small>1 KG</small>
              </div>
              <div>
                <span>EVERYDAY ESSENTIALS</span>
                <h3>{products.data[0].name}</h3>
                <p>{products.data.length} nearby listings</p>
              </div>
            </div>
            <div className="price-list">
              {products.data.slice(0, 3).map((p, i) => (
                <Link
                  href={"/products/" + p.id}
                  className={"price-entry " + (i === 0 ? "best" : "")}
                  key={p.id}
                >
                  <small>{p.shop_name}</small>
                  <b>{money(Number(p.price))}</b>
                  <span>
                    {p.distance?.toFixed(1)} km{" "}
                    {i === 0 && <em>· Lowest price</em>}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <Empty
            title="Compare your everyday essentials"
            text="Search for a product to see its prices across nearby shops."
          />
        )}
      </section>
      <section className="split-section section">
        <div className="lists-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">MAKE YOUR NEXT SHOP SIMPLE</p>
              <h2>My shopping lists</h2>
            </div>
            <Button asChild size="icon">
              <Link href="/shopping-lists">+</Link>
            </Button>
          </div>
          {lists.data?.length ? (
            lists.data.slice(0, 2).map((l) => (
              <Link className="list-item" href="/shopping-lists" key={l.id}>
                <div className="list-icon">☷</div>
                <div>
                  <strong>{l.name}</strong>
                  <small>{l.shopping_list_items.length} items</small>
                </div>
                <ArrowRight size={16} />
              </Link>
            ))
          ) : (
            <p className="muted list-placeholder">
              Keep your weekly staples and little must-haves in one place.
            </p>
          )}
          <Link className="subtle-link" href="/shopping-lists">
            {profile ? "View your lists" : "Sign in to create a list"} →
          </Link>
        </div>
        <div className="order-card">
          <p className="eyebrow">FROM THEIR SHOP TO YOUR DOOR</p>
          <h2>
            {active ? label(active.status) : "Local shopping, less fuss."}
          </h2>
          <p>
            {active
              ? `Your order ${active.order_number} from ${active.shops.name}.`
              : "Chat with your shopkeeper, share a list, and let your neighbourhood take care of the rest."}
          </p>
          <div className="order-benefits">
            <span>✓ Shop-owner delivery</span>
            <span>✓ ₹0 handling fees</span>
          </div>
          <Button asChild className="lime-button w-full">
            <Link href={active ? "/orders/" + active.id : "/shops"}>
              {active ? "Track your order" : "Find your neighbourhood shop"}{" "}
              <ArrowRight size={15} />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
function MapMarker() {
  return <Store size={12} />;
}
export function SearchPage({
  kind = "products",
  initialQuery = "",
  initialCategory = "",
  initialUnit = "",
  initialBrand = "",
}: {
  kind?: "products" | "shops" | "compare";
  initialQuery?: string;
  initialCategory?: string;
  initialUnit?: string;
  initialBrand?: string;
}) {
  const location = useStore((s) => s.location);
  const [query, setQuery] = useState(initialQuery),
    [tab, setTab] = useState(kind === "shops" ? "shops" : "products"),
    [category, setCategory] = useState(initialCategory),
    [unit, setUnit] = useState(initialUnit),
    [brand, setBrand] = useState(initialBrand),
    [sort, setSort] = useState(kind === "shops" ? "distance" : "price"),
    [stock, setStock] = useState(false),
    [open, setOpen] = useState(false),
    [page, setPage] = useState(0),
    [selectedShop, setSelectedShop] = useState<string>();
  const q = useDebounce(query),
    categories = useQuery<Category[]>("categories");
  const params =
    locationParams(location) +
    `&q=${encodeURIComponent(q)}&category=${category}&sort=${sort}&in_stock=${stock}&open_only=${open}&page=${page}&unit=${encodeURIComponent(unit)}&brand=${encodeURIComponent(brand)}`;
  const result = useQuery<(Product | Shop)[]>(
    location ? "search/" + tab + "?" + params : null,
  );
  function reset() {
    setPage(0);
  }
  const comparable = result.data?.every((x) => {
    const p = x as Product,
      first = result.data![0] as Product;
    return (
      p.name === first.name && p.unit === first.unit && p.brand === first.brand
    );
  });
  return (
    <div className="page">
      <div className="page-heading">
        <p className="eyebrow">YOUR LOCAL MARKETPLACE</p>
        <h1>
          {kind === "compare"
            ? "Find the right shop. At the right price."
            : kind === "shops"
              ? "Your neighbourhood shops"
              : "What can we help you find?"}
        </h1>
        <p>Discover nearby, compare confidently, and support local.</p>
      </div>
      <div className="search-box page-search">
        <Search size={20} />
        <input
          aria-label="Search"
          value={query}
          placeholder="Search products or shop names"
          onChange={(e) => {
            setQuery(e.target.value);
            setUnit("");
            setBrand("");
            reset();
          }}
        />
        <span className="search-live">Live search</span>
      </div>
      <div className="filters">
        {(unit || brand) && (
          <button
            className="badge"
            onClick={() => {
              setUnit("");
              setBrand("");
              reset();
            }}
          >
            Same variant: {brand} {unit} ×
          </button>
        )}
        <div className="tabs">
          <button
            className={tab === "products" ? "selected" : ""}
            onClick={() => {
              setTab("products");
              reset();
            }}
          >
            Products
          </button>
          <button
            className={tab === "shops" ? "selected" : ""}
            onClick={() => {
              setTab("shops");
              reset();
            }}
          >
            Shops
          </button>
        </div>
        <select
          aria-label="Category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            reset();
          }}
        >
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option value={c.id} key={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Sort results"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            reset();
          }}
        >
          <option value="price">Lowest price</option>
          <option value="distance">Nearest</option>
          <option value="rating">Highest rated</option>
        </select>
        <label>
          <input
            type="checkbox"
            checked={open}
            onChange={(e) => {
              setOpen(e.target.checked);
              reset();
            }}
          />{" "}
          Open shops
        </label>
        {tab === "products" && (
          <label>
            <input
              type="checkbox"
              checked={stock}
              onChange={(e) => {
                setStock(e.target.checked);
                reset();
              }}
            />{" "}
            In stock
          </label>
        )}
      </div>
      {!location ? (
        <LocationEmpty />
      ) : result.loading ? (
        <Loading />
      ) : result.error ? (
        <Failure message={result.error} retry={result.refresh} />
      ) : result.data?.length ? (
        <>
          <p className="results-label">
            {result.data.length}{" "}
            {tab === "products" ? "product listings" : "shops"} that deliver to
            you
          </p>
          {tab === "shops" && (
            <GoogleMap
              value={location}
              shops={result.data as Shop[]}
              selectedShopId={selectedShop}
              onShopSelect={(shop) => setSelectedShop(shop.id)}
            />
          )}
          <div className={tab === "products" ? "product-grid" : "shop-grid"}>
            {result.data.map((x, i) =>
              tab === "products" ? (
                <ProductCard
                  key={x.id}
                  product={x as Product}
                  best={
                    kind === "compare" &&
                    sort === "price" &&
                    page === 0 &&
                    i === 0 &&
                    comparable
                  }
                />
              ) : (
                <ShopCard key={x.id} shop={x as Shop} />
              ),
            )}
          </div>
        </>
      ) : (
        <Empty
          title="No matches in your area"
          text="Try another search, remove a filter, or choose a different delivery location."
        />
      )}
      <div className="pagination">
        <Button
          variant="outline"
          disabled={page === 0}
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
    </div>
  );
}
