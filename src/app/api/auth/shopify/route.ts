import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import jwt from "jsonwebtoken";

const oauthCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 600,
  path: "/",
};

// Step 1 of Shopify OAuth: redirect merchant to Shopify's permission screen.
// Triggered when user enters their shop domain on the "Connect Shopify" page
// (web) or the Connect Shopify screen (mobile app).
export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop");
  if (process.env.SYNCSTOCK_SANDBOX === "true") {
    if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
      return NextResponse.json({ error: "Sandbox Shopify credentials still need to be configured." }, { status: 503 });
    }
    if (!process.env.SANDBOX_SHOP_DOMAIN || shop !== process.env.SANDBOX_SHOP_DOMAIN) {
      return NextResponse.json({ error: "Only the approved development store can connect to this sandbox." }, { status: 403 });
    }
  }
  const isMobile = req.nextUrl.searchParams.get("mobile") === "1";
  const mobileToken = req.nextUrl.searchParams.get("token");

  if (!shop || !shop.endsWith(".myshopify.com")) {
    return NextResponse.json(
      { error: "Invalid shop domain. Expected format: your-store.myshopify.com" },
      { status: 400 }
    );
  }

  let mobileUserId: string | null = null;
  if (isMobile) {
    if (!mobileToken) {
      return NextResponse.json({ error: "Missing mobile session token." }, { status: 401 });
    }
    try {
      const payload = jwt.verify(mobileToken, process.env.NEXTAUTH_SECRET!) as { userId: string };
      mobileUserId = payload.userId;
    } catch {
      return NextResponse.json({ error: "Invalid or expired mobile session." }, { status: 401 });
    }
  }

  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${process.env.APP_URL}/api/auth/shopify/callback`;

  const installUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${process.env.SHOPIFY_API_KEY}` +
    `&scope=${process.env.SHOPIFY_SCOPES}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  const res = NextResponse.redirect(installUrl);
  // Shopify returns through a cross-site top-level navigation. Explicit Lax,
  // Secure cookies match Shopify's standalone OAuth guidance and keep the
  // browser-bound state/shop values available for callback validation.
  res.cookies.set("shopify_oauth_state", state, oauthCookieOptions);
  res.cookies.set("shopify_oauth_shop", shop, oauthCookieOptions);
  if (mobileUserId) {
    res.cookies.set("shopify_oauth_mobile_user", mobileUserId, oauthCookieOptions);
  }
  return res;
}
