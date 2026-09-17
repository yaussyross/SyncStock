import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { buildShopifyOAuthMessage, verifyShopifySignature, verifyShopifyWebhook } from "../src/lib/shopify-signatures";

async function main() {
  process.env.SHOPIFY_API_SECRET = "  test-current  ";
  process.env.SHOPIFY_API_SECRET_PREVIOUS = "test-previous";
  const message = "code=test&shop=test.myshopify.com&state=test&timestamp=123";
  for (const secret of ["test-current", "test-previous"]) {
    const signature = createHmac("sha256", secret).update(message).digest();
    assert.equal(await verifyShopifySignature(message, signature), true);
    assert.equal(await verifyShopifyWebhook(message, signature.toString("base64")), true);
    assert.equal(await verifyShopifySignature(message + "tampered", signature), false);
  }

  const oauthParams = new URLSearchParams();
  oauthParams.set("timestamp", "123");
  oauthParams.set("shop", "test.myshopify.com");
  oauthParams.set("host", "admin.shopify.com/store/test+shop=/a b~*");
  oauthParams.set("code", "abc/123+");
  oauthParams.set("state", "nonce");
  oauthParams.set("hmac", "ignored");
  assert.equal(
    buildShopifyOAuthMessage(oauthParams),
    "code=abc%2F123%2B&host=admin.shopify.com%2Fstore%2Ftest%2Bshop%3D%2Fa%20b%7E*&shop=test.myshopify.com&state=nonce&timestamp=123"
  );

  assert.equal(await verifyShopifySignature(message, createHmac("sha256", "untrusted").update(message).digest()), false);
  assert.equal(await verifyShopifyWebhook(message, "invalid"), false);
  delete process.env.SHOPIFY_API_SECRET_PREVIOUS;
  assert.equal(await verifyShopifySignature(message, createHmac("sha256", "test-previous").update(message).digest()), false);
  delete process.env.SHOPIFY_API_SECRET;
  assert.equal(await verifyShopifySignature(message, new Uint8Array(32)), false);
  console.log("Shopify signature rotation and OAuth canonicalization checks passed");
}
main().catch(error => { console.error(error); process.exit(1); });
