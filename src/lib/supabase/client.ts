"use client";
import { createBrowserClient } from "@supabase/ssr";
export function browserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error("Kirana needs a Supabase project connection.");
  return createBrowserClient(url, key);
}
