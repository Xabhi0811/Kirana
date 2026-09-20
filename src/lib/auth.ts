import "server-only";
import { redirect } from "next/navigation";
import { connectDB } from "./db";
import { User } from "./models";
import { getAuthUserId } from "./auth-utils";
import type { Profile, Role } from "./types";

export function configured(): boolean {
  return !!process.env.MONGODB_URI;
}

export async function currentProfile(): Promise<Profile | null> {
  if (!configured()) return null;
  const userId = await getAuthUserId();
  if (!userId) return null;
  await connectDB();
  const user = await User.findById(userId)
    .select("name email phone role avatar_url status")
    .lean();
  if (!user) return null;
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    avatar_url: user.avatar_url,
    status: user.status,
  };
}

export async function requireRole(roles: Role[]) {
  const p = await currentProfile();
  if (!p) redirect("/login");
  if (p.status !== "ACTIVE" || !roles.includes(p.role)) redirect("/");
  return p;
}
