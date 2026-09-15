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
  const secret = process.env.SHOPIFY_API_SECRET;
  const provided = searchParams.get("hmac");
  const signature = provided ? hexToBytes(provided) : null;
  if (!secret || !signature) return false;

  const message = Array.from(searchParams.entries())
    .filter(([key]) => key !== "hmac")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  return crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(message)
  );
}

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Shopify custom-distribution install links first land on the configured app URL
  // with a signed shop/hmac/timestamp query. Continue that trusted handoff into
  // SyncStock's standalone OAuth authorization-code flow instead of rendering the
  // marketing homepage.
  if (pathname === "/") {
    const shop = searchParams.get("shop");
    const hmac = searchParams.get("hmac");
    if (!shop || !hmac) return NextResponse.next();

    if (!isShopifyDomain(shop) || !(await hasValidShopifyHmac(searchParams))) {
      return NextResponse.json({ error: "Invalid Shopify installation request." }, { status: 400 });
    }

    const oauthStart = new URL("/api/auth/shopify", req.url);
    oauthStart.searchParams.set("shop", shop);
    return NextResponse.redirect(oauthStart);
  }

  // Defense in depth for the OAuth callback. The route already validates the
  // state nonce; middleware additionally validates Shopify's HMAC and makes sure
  // the returning shop is the same one stored at OAuth start.
  if (pathname === "/api/auth/shopify/callback") {
    const shop = searchParams.get("shop");
    const expectedShop = req.cookies.get("shopify_oauth_shop")?.value ?? null;

    if (
      !isShopifyDomain(shop) ||
      !expectedShop ||
      shop !== expectedShop ||
      !(await hasValidShopifyHmac(searchParams))
    ) {
      return NextResponse.json({ error: "Invalid Shopify OAuth callback." }, { status: 400 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/api/auth/shopify/callback"],
};
