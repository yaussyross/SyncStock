import jwt, { JwtPayload } from "jsonwebtoken";

export interface ShopifyIdTokenClaims extends JwtPayload {
  dest: string;
  iss: string;
  sub: string;
}

export function verifyShopifyIdToken(token: string): ShopifyIdTokenClaims {
  const clientId = process.env.SHOPIFY_API_KEY;
  const clientSecret = process.env.SHOPIFY_API_SECRET;
  if (!clientId || !clientSecret) throw new Error("Shopify app credentials are not configured");

  const payload = jwt.verify(token, clientSecret, {
    algorithms: ["HS256"],
    audience: clientId,
    clockTolerance: 5,
  }) as ShopifyIdTokenClaims;

  if (!payload.dest || !payload.iss || !payload.sub) throw new Error("Incomplete Shopify ID token");

  const destination = new URL(payload.dest);
  const issuer = new URL(payload.iss);
  if (
    destination.protocol !== "https:" ||
    !destination.hostname.endsWith(".myshopify.com") ||
    issuer.hostname !== destination.hostname ||
    !issuer.pathname.startsWith("/admin")
  ) {
    throw new Error("Invalid Shopify ID token origin");
  }

  return payload;
}

export function shopDomainFromIdToken(token: string) {
  return new URL(verifyShopifyIdToken(token).dest).hostname;
}
