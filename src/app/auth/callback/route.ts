import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models";
import { signToken } from "@/lib/auth-utils";

export async function GET(request: NextRequest) {
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    request.nextUrl.origin;
  const redirectUri = `${origin}/auth/callback`;

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const authError = searchParams.get("error");

  if (authError) {
    const errorUrl = new URL("/login", request.url);
    errorUrl.searchParams.set(
      "error",
      `Google authentication failed: ${authError}`,
    );
    return NextResponse.redirect(errorUrl);
  }

  if (!code) {
    const errorUrl = new URL("/login", request.url);
    errorUrl.searchParams.set(
      "error",
      "No authorization code received from Google.",
    );
    return NextResponse.redirect(errorUrl);
  }

  const clientId =
    process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    const errorUrl = new URL("/login", request.url);
    errorUrl.searchParams.set(
      "error",
      "Google OAuth credentials are not properly configured on the server.",
    );
    return NextResponse.redirect(errorUrl);
  }

  try {
    // 1. Exchange authorization code for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Google token exchange error:", errorText);
      const errorUrl = new URL("/login", request.url);
      errorUrl.searchParams.set(
        "error",
        "Failed to exchange authorization code with Google.",
      );
      return NextResponse.redirect(errorUrl);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // 2. Fetch user profile from Google
    const userinfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!userinfoResponse.ok) {
      console.error(
        "Google userinfo error:",
        await userinfoResponse.text(),
      );
      const errorUrl = new URL("/login", request.url);
      errorUrl.searchParams.set(
        "error",
        "Failed to retrieve profile information from Google.",
      );
      return NextResponse.redirect(errorUrl);
    }

    const googleUser = await userinfoResponse.json();

    if (!googleUser.id || !googleUser.email) {
      const errorUrl = new URL("/login", request.url);
      errorUrl.searchParams.set(
        "error",
        "Incomplete user profile received from Google.",
      );
      return NextResponse.redirect(errorUrl);
    }

    // 3. Connect to database and find or create user
    await connectDB();

    let user = await User.findOne({ google_id: googleUser.id });

    if (!user) {
      // Check if user exists by email to link Google account
      user = await User.findOne({ email: googleUser.email.toLowerCase() });
      if (user) {
        user.google_id = googleUser.id;
        if (!user.avatar_url && googleUser.picture) {
          user.avatar_url = googleUser.picture;
          user.profile_image = googleUser.picture;
        }
        await user.save();
      }
    }

    if (!user) {
      // Create new user
      user = await User.create({
        name: googleUser.name || googleUser.email.split("@")[0],
        email: googleUser.email.toLowerCase(),
        google_id: googleUser.id,
        avatar_url: googleUser.picture || null,
        profile_image: googleUser.picture || null,
        role: "CUSTOMER",
        status: "ACTIVE",
        password_hash: null,
      });
    }

    if (user.status !== "ACTIVE" && user.status !== "active") {
      const errorUrl = new URL("/login", request.url);
      errorUrl.searchParams.set(
        "error",
        "Your account is suspended. Contact customer support.",
      );
      return NextResponse.redirect(errorUrl);
    }

    // 4. Generate JWT session token
    const token = await signToken(user._id.toString());

    // 5. Redirect and set auth cookie
    const destination = user.role === "SHOPKEEPER" ? "/shopkeeper" : "/";
    const response = NextResponse.redirect(new URL(destination, request.url));

    response.cookies.set("kirana-auth", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (err: unknown) {
    console.error("Google OAuth callback error:", err);
    const errorUrl = new URL("/login", request.url);
    errorUrl.searchParams.set(
      "error",
      "An unexpected error occurred during Google sign-in. Please try again.",
    );
    return NextResponse.redirect(errorUrl);
  }
}
