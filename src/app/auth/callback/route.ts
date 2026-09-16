import { NextResponse, type NextRequest } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const url = new URL(request.url),
    code = url.searchParams.get("code");
  if (code) {
    const db = await serverSupabase();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(new URL("/reset-password", request.url));
  }
  return NextResponse.redirect(
    new URL("/login?error=Invalid%20confirmation%20link", request.url),
  );
}
