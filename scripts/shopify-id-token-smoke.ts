import jwt from "jsonwebtoken";

process.env.SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || "syncstock-test-client";
process.env.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "syncstock-test-secret";

async function main() {
  const { verifyShopifyIdToken } = await import("../src/lib/shopify-id-token");
  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    {
      dest: "https://example-shop.myshopify.com",
      iss: "https://example-shop.myshopify.com/admin",
      sub: "123",
      aud: process.env.SHOPIFY_API_KEY,
      nbf: now - 5,
      iat: now,
      exp: now + 60,
    },
    process.env.SHOPIFY_API_SECRET!,
    { algorithm: "HS256" }
  );

  const claims = verifyShopifyIdToken(token);
  if (claims.dest !== "https://example-shop.myshopify.com") throw new Error("Valid token was not accepted");

  let rejected = false;
  try {
    const bad = jwt.sign(
      {
        dest: "https://attacker.example.com",
        iss: "https://attacker.example.com/admin",
        sub: "123",
        aud: process.env.SHOPIFY_API_KEY,
        nbf: now - 5,
        iat: now,
        exp: now + 60,
      },
      process.env.SHOPIFY_API_SECRET!,
      { algorithm: "HS256" }
    );
    verifyShopifyIdToken(bad);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("Invalid Shopify origin was accepted");

  console.log("Shopify ID token smoke checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
