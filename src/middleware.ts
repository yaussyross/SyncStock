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
  // shop/host/timestamp metadata. This first hop performs no privileged action;
  // it only starts SyncStock's own OAuth flow. The shop is strictly validated as
  // a myshopify.com hostname. The actual OAuth callback remains protected by the
  // browser-bound state nonce plus Shopify HMAC verification before any access
  // token is accepted.
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

  // Defense in depth for the OAuth callback. The route validates the state nonce;
  // middleware also validates Shopify's HMAC and requires the returning shop to
  // match the shop stored when OAuth began.
  if (pathname === "/api/auth/shopify/callback") {
    const shop = searchParams.get("shop");
    const expectedShop = req.cookies.get("shopify_oauth_shop")?.value ?? null;

    const reason = !isShopifyDomain(shop) ? "invalid_shop"
      : !expectedShop ? "missing_connection_cookie"
      : shop !== expectedShop ? "shop_mismatch"
      : !(process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_API_SECRET_PREVIOUS) ? "missing_signing_secret"
      : !(await hasValidShopifyHmac(searchParams)) ? "signature_mismatch" : null;
    if (reason) {
      // No callback parameters, cookie values, or credentials enter logs.
      console.warn("[shopify oauth] Callback rejected:", reason);
      return NextResponse.json({ error: "Invalid Shopify OAuth callback.", reason }, { status: 400 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/api/auth/shopify/callback"],
};
