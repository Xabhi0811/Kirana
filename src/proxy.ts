import { NextResponse, type NextRequest } from "next/server";
export async function proxy(request: NextRequest) {
  // Authentication and authorization are handled by the server routes.
  return NextResponse.next({ request });
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
