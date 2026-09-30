import { createHmac, timingSafeEqual } from "node:crypto";

type RawWebhookBody = string | Uint8Array;

function configuredSecrets() {
  return [process.env.SHOPIFY_API_SECRET, process.env.SHOPIFY_API_SECRET_PREVIOUS]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

export function verifyShopifyWebhook(rawBody: RawWebhookBody, providedHmac: string | null) {
  if (!providedHmac) return false;

  let provided: Buffer;
  try {
    provided = Buffer.from(providedHmac, "base64");
  } catch {
    return false;
  }

  // Shopify signs HTTPS webhook deliveries with HMAC-SHA256, so the decoded
  // digest is always 32 bytes. Reject malformed values before comparing.
  if (provided.length !== 32) return false;

  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : Buffer.from(rawBody);

  for (const secret of new Set(configuredSecrets())) {
    const expected = createHmac("sha256", secret).update(body).digest();
    if (timingSafeEqual(expected, provided)) return true;
  }

  return false;
}
