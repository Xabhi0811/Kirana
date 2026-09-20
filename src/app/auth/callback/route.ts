import { NextResponse, type NextRequest } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const url = new URL(request.url),
    code = url.searchParams.get("code"),
    googleFlow = url.searchParams.get("flow") === "google";
  const loginFailure = (message: string) => {
    const target = new URL("/login", request.url);
    target.searchParams.set("error", message);
    return NextResponse.redirect(target);
  };
  if (url.searchParams.has("error"))
    return loginFailure(
      googleFlow
        ? "Google sign-in was cancelled or could not be completed."
        : "This authentication link is invalid or has expired.",
    );
  if (code) {
    const db = await serverSupabase();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error && googleFlow) {
      const {
        data: { user },
      } = await db.auth.getUser();
      const { data: profile, error: profileError } = user
        ? await db
            .from("users")
            .select("role,status")
            .eq("id", user.id)
            .maybeSingle()
        : { data: null, error: null };
      if (profileError || !profile) {
        await db.auth.signOut();
        return loginFailure(
          "Your Google account was verified, but your Kirana profile could not be created.",
        );
      }
      if (profile.status !== "ACTIVE") {
        await db.auth.signOut();
        return loginFailure(
          "Your account is suspended. Contact customer support.",
        );
      }
      return NextResponse.redirect(
        new URL(
          profile.role === "SHOPKEEPER"
            ? "/shopkeeper"
            : profile.role === "ADMIN"
              ? "/admin"
              : "/",
          request.url,
        ),
      );
    }
    if (!error)
      return NextResponse.redirect(new URL("/reset-password", request.url));
  }
  return loginFailure(
    googleFlow
      ? "Google sign-in could not be completed. Please try again."
      : "This authentication link is invalid or has expired.",
  );
}
