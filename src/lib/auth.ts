import "server-only";
import { redirect } from "next/navigation";
import { serverSupabase, configured } from "./supabase/server";
import type { Profile, Role } from "./types";
export async function currentProfile(): Promise<Profile | null> {
  if (!configured()) return null;
  const db = await serverSupabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  const { data } = await db
    .from("users")
    .select("id,name,email,phone,role,avatar_url,status")
    .eq("id", user.id)
    .single();
  return data as Profile | null;
}
export async function requireRole(roles: Role[]) {
  const p = await currentProfile();
  if (!p) redirect("/login");
  if (p.status !== "ACTIVE" || !roles.includes(p.role)) redirect("/");
  return p;
}
