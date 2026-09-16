// During rotation, accept only the two explicitly configured app secrets.
// OAuth token exchange continues to use SHOPIFY_API_SECRET (the new secret).
export async function verifyShopifySignature(message: string, signature: Uint8Array) {
  const secrets = [process.env.SHOPIFY_API_SECRET, process.env.SHOPIFY_API_SECRET_PREVIOUS]
    .filter((value): value is string => Boolean(value));
  for (const secret of new Set(secrets)) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    if (await crypto.subtle.verify("HMAC", key, new Uint8Array(signature), new TextEncoder().encode(message))) return true;
  }
  return false;
}

function encodeShopifyQueryComponent(value: string) {
  // Shopify signs OAuth callback parameters using percent encoding. URLSearchParams
  // decodes values for us, so re-encode deterministically before verification.
  return encodeURIComponent(value).replace(/[!'()*]/g, char =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function buildShopifyOAuthMessage(searchParams: URLSearchParams) {
  return Array.from(searchParams.entries())
    .filter(([key]) => key !== "hmac")
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${encodeShopifyQueryComponent(key)}=${encodeShopifyQueryComponent(value)}`)
    .join("&");
}

export async function verifyShopifyWebhook(rawBody: string, provided: string | null) {
  if (!provided || !/^[A-Za-z0-9+/]{43}=$/.test(provided)) return false;
  return verifyShopifySignature(rawBody, Uint8Array.from(atob(provided), c => c.charCodeAt(0)));
}
