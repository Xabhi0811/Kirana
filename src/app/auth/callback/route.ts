import { NextResponse, type NextRequest } from "next/server";
export async function GET(request: NextRequest) {
  // OAuth and code exchange are no longer used with custom JWT auth.
  // Redirect to login page.
  const target = new URL("/login", request.url);
  target.searchParams.set(
    "error",
    "This authentication link is no longer supported. Please sign in with email and password.",
  );
  return NextResponse.redirect(target);
}
