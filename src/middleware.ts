import { buildShopifyOAuthMessage, verifyShopifySignature } from "./lib/shopify-signatures";
import { NextRequest, NextResponse } from "next/server";

function isShopifyDomain(shop: string | null) {
  return Boolean(shop && /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop));
}

function hexToBytes(hex: string) {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function hasValidShopifyHmac(searchParams: URLSearchParams) {
  const provided = searchParams.get("hmac");
  const signature = provided ? hexToBytes(provided) : null;
  if (!signature) return false;
  return verifyShopifySignature(buildShopifyOAuthMessage(searchParams), signature);
}

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Shopify custom-distribution links first land on the configured app URL with
  // shop/host/timestamp metadata. Keep this compatibility path for the isolated
  // development app; the public production app uses /shopify/app + App Bridge.
  if (pathname === "/") {
    const shop = searchParams.get("shop");
    if (!shop) return NextResponse.next();

    if (!isShopifyDomain(shop)) {
      return NextResponse.json({ error: "Invalid Shopify shop domain." }, { status: 400 });
    }

    const oauthStart = new URL("/api/auth/shopify", req.url);
    oauthStart.searchParams.set("shop", shop);
    return NextResponse.redirect(oauthStart);
  }

  // App Store embedded UI: Shopify requires frame-ancestors to include the
  // authenticated shop plus admin.shopify.com. Initial App Home requests carry
  // the shop query parameter; protected API data is still gated by an ID token.
  if (pathname.startsWith("/shopify/app")) {
    const shop = searchParams.get("shop");
    if (shop && !isShopifyDomain(shop)) {
      return NextResponse.json({ error: "Invalid Shopify shop domain." }, { status: 400 });
    }
    const ancestors = ["https://admin.shopify.com"];
    if (shop) ancestors.unshift(`https://${shop}`);
    const res = NextResponse.next();
    res.headers.set("Content-Security-Policy", `frame-ancestors ${ancestors.join(" ")};`);
    return res;
  }

  // Defense in depth for the legacy OAuth callback. The route validates the
  // state nonce; middleware also validates Shopify's HMAC and returning shop.
  if (pathname === "/api/auth/shopify/callback") {
    const shop = searchParams.get("shop");
    const expectedShop = req.cookies.get("shopify_oauth_shop")?.value ?? null;

    const reason = !isShopifyDomain(shop) ? "invalid_shop"
      : !expectedShop ? "missing_connection_cookie"
      : shop !== expectedShop ? "shop_mismatch"
      : !(process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_API_SECRET_PREVIOUS) ? "missing_signing_secret"
      : !(await hasValidShopifyHmac(searchParams)) ? "signature_mismatch" : null;
    if (reason) {
      console.warn("[shopify oauth] Callback rejected:", reason);
      return NextResponse.json({ error: "Invalid Shopify OAuth callback.", reason }, { status: 400 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/shopify/app/:path*", "/api/auth/shopify/callback"],
};
