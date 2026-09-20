"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, createContext, useContext } from "react";
import {
  Home,
  Search,
  ArrowLeftRight,
  ClipboardList,
  ListChecks,
  MessageCircle,
  ShoppingBag,
  MapPin,
  Settings,
  LogOut,
  Menu,
  Store,
  Package,
  Users,
  Star,
  ShieldCheck,
  LayoutDashboard,
  Boxes,
  Flag,
} from "lucide-react";
import type { Profile } from "@/lib/types";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api-client";
import { LocationPicker } from "./location-picker";
import { ToastProvider, useToast } from "./feedback";
import { Button } from "./ui/button";
const customerLinks = [
  ["/", "Home", Home],
  ["/search", "Explore", Search],
  ["/compare", "Compare prices", ArrowLeftRight],
  ["/orders", "My orders", ClipboardList],
  ["/shopping-lists", "Shopping lists", ListChecks],
  ["/chat", "Messages", MessageCircle],
  ["/addresses", "Addresses", MapPin],
  ["/reviews", "My reviews", Star],
  ["/complaints", "Customer support", Flag],
] as const;
const keeperLinks = [
  ["/shopkeeper", "Dashboard", LayoutDashboard],
  ["/shopkeeper/shop", "My shops", Store],
  ["/shopkeeper/products", "Products", Package],
  ["/shopkeeper/inventory", "Inventory", Boxes],
  ["/shopkeeper/orders", "Orders", ClipboardList],
  ["/shopkeeper/chat", "Messages", MessageCircle],
  ["/shopkeeper/reviews", "Reviews", Star],
] as const;
const adminLinks = [
  ["/admin", "Dashboard", ShieldCheck],
  ["/admin/users", "Users", Users],
  ["/admin/shops", "Shops", Store],
  ["/admin/categories", "Categories", Boxes],
  ["/admin/products", "Products", Package],
  ["/admin/orders", "Orders", ClipboardList],
  ["/admin/reviews", "Reviews", Star],
  ["/admin/complaints", "Complaints", Flag],
  ["/admin/reports", "Reports", ClipboardList],
  ["/admin/settings", "Platform settings", Settings],
] as const;
const ProfileContext = createContext<Profile | null>(null);
export const useProfile = () => useContext(ProfileContext);
export function Shell({
  profile,
  connected,
  children,
}: {
  profile: Profile | null;
  connected: boolean;
  children: React.ReactNode;
}) {
  return (
    <ProfileContext.Provider value={profile}>
      <ToastProvider>
        <Inner profile={profile} connected={connected}>
          {children}
        </Inner>
      </ToastProvider>
    </ProfileContext.Provider>
  );
}
function Inner({
  profile,
  connected,
  children,
}: {
  profile: Profile | null;
  connected: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname(),
    router = useRouter(),
    notify = useToast();
  const [menu, setMenu] = useState(false);
  const items = useStore((s) => s.items),
    setOwner = useStore((s) => s.setOwner);
  useEffect(() => {
    Promise.resolve(useStore.persist.rehydrate()).then(() =>
      setOwner(profile?.id || null),
    );
  }, [profile?.id, setOwner]);
  const links =
    pathname.startsWith("/admin") ||
    (profile?.role === "ADMIN" && pathname.startsWith("/orders"))
      ? adminLinks
      : pathname.startsWith("/shopkeeper") ||
          (profile?.role === "SHOPKEEPER" && pathname.startsWith("/orders"))
        ? keeperLinks
        : customerLinks;
  async function logout() {
    try {
      await api("auth/logout", {});
      useStore.getState().clear();
      router.push("/");
      router.refresh();
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "mobile-open" : ""}`}>
        <Link className="brand" href="/" onClick={() => setMenu(false)}>
          <span className="brand-mark">
            <ShoppingBag size={19} />
          </span>
          <span>
            Ki<span>rana</span>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          {links.map(([href, name, Icon]) => (
            <Link
              key={href}
              href={href}
              className={`nav-link ${pathname === href ? "active" : ""}`}
              onClick={() => setMenu(false)}
            >
              <Icon size={18} />
              <span>{name}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {profile?.role === "SHOPKEEPER" && (
            <Link
              className="nav-link"
              href={pathname.startsWith("/shopkeeper") ? "/" : "/shopkeeper"}
            >
              <Store size={18} />
              <span>
                {pathname.startsWith("/shopkeeper")
                  ? "Marketplace"
                  : "Shopkeeper dashboard"}
              </span>
            </Link>
          )}
          {profile?.role === "ADMIN" && (
            <Link className="nav-link" href="/admin">
              <ShieldCheck size={18} />
              <span>Admin dashboard</span>
            </Link>
          )}
          <Link className="nav-link" href="/profile">
            <Settings size={18} />
            <span>Profile & settings</span>
          </Link>
          {profile ? (
            <div className="profile">
              <div className="avatar">
                {profile.name
                  .split(" ")
                  .map((x) => x[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <Link href="/profile">
                <strong>{profile.name}</strong>
                <small>{profile.role.toLowerCase()}</small>
              </Link>
              <button onClick={logout} aria-label="Sign out">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <Button asChild className="w-full mt-4">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </aside>
      {menu && (
        <button
          className="mobile-overlay"
          onClick={() => setMenu(false)}
          aria-label="Close menu"
        />
      )}
      <main>
        <header>
          <button
            className="mobile-menu"
            onClick={() => setMenu(!menu)}
            aria-label="Toggle menu"
          >
            <Menu size={22} />
          </button>
          <LocationPicker profile={profile} />
          <div className="header-actions">
            {!profile && (
              <Link className="signin-link" href="/login">
                Sign in
              </Link>
            )}
            <Link className="cart-button" href="/cart">
              <ShoppingBag size={16} /> <span>Cart</span>{" "}
              <em>{items.reduce((n, x) => n + x.quantity, 0)}</em>
            </Link>
          </div>
        </header>
        {!connected && (
          <div className="connection-banner">
            Connect your MongoDB database by setting MONGODB_URI in .env.local to
            enable the marketplace.
          </div>
        )}
        {profile?.status === "SUSPENDED" && (
          <div className="connection-banner">
            Your account is suspended. Contact the marketplace administrator.
          </div>
        )}
        {children}
        <footer className="site-footer">
          <Link className="brand-small" href="/">
            Kirana
          </Link>
          <span>
            Nearby shops. One platform. Zero delivery & handling fees.
          </span>
        </footer>
      </main>
    </div>
  );
}
