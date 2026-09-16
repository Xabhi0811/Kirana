import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const db = await serverSupabase();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", request.url));
  }
  const token_hash = url.searchParams.get("token_hash"),
    type = url.searchParams.get("type") as EmailOtpType | null;
  if (token_hash && type) {
    const db = await serverSupabase();
    const { error } = await db.auth.verifyOtp({ token_hash, type });
    if (!error)
      return NextResponse.redirect(
        new URL(type === "recovery" ? "/reset-password" : "/", request.url),
      );
  }
  return NextResponse.redirect(
    new URL("/login?error=Confirmation%20link%20expired", request.url),
  );
}
