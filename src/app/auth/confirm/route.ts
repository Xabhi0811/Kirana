import { NextResponse, type NextRequest } from "next/server";
export async function GET(request: NextRequest) {
  // Email confirmation is no longer used with custom JWT auth.
  // Redirect to login page.
  return NextResponse.redirect(new URL("/login", request.url));
}
