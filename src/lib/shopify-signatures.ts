// During rotation, accept only the two explicitly configured app secrets.
// OAuth token exchange continues to use SHOPIFY_API_SECRET (the new secret).
export async function verifyShopifySignature(message: string, signature: Uint8Array) {
  const secrets = [process.env.SHOPIFY_API_SECRET, process.env.SHOPIFY_API_SECRET_PREVIOUS]
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value));

  for (const secret of new Set(secrets)) {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    if (
      await crypto.subtle.verify(
        "HMAC",
        key,
        new Uint8Array(signature),
        new TextEncoder().encode(message)
      )
    ) {
      return true;
    }
  }
  return false;
}

// Mirrors Shopify's current ProcessedQuery/stringifyQueryForAdmin behavior:
// sort keys, serialize through URLSearchParams, then use %20 rather than + for spaces.
export function buildShopifyOAuthMessage(searchParams: URLSearchParams) {
  const normalized: Record<string, string> = Object.create(null);

  for (const [key, value] of searchParams.entries()) {
    if (key === "hmac" || key === "signature") continue;
    const existing = normalized[key];
    normalized[key] = existing === undefined ? value : `${existing},${value}`;
  }

  const processed = new URLSearchParams();
  Object.keys(normalized)
    .sort((left, right) => left.localeCompare(right))
    .forEach(key => processed.append(key, normalized[key]));

  return processed.toString().replace(/\+/g, "%20");
}

export async function verifyShopifyWebhook(rawBody: string, provided: string | null) {
  if (!provided || !/^[A-Za-z0-9+/]{43}=$/.test(provided)) return false;
  return verifyShopifySignature(
    rawBody,
    Uint8Array.from(atob(provided), c => c.charCodeAt(0))
  );
}
