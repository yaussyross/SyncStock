import crypto from "crypto";

// Keep installation and redaction on the same deterministic, shop-scoped identity.
export function syntheticShopEmail(shop: string) {
  const key = crypto.createHash("sha256").update(shop).digest("hex").slice(0, 24);
  return `shopify-${key}@shops.syncstock.invalid`;
}
