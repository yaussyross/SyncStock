import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

async function main() {
  process.env.SHOPIFY_API_KEY = "reinstall-test-client";
  process.env.SHOPIFY_API_SECRET = "reinstall-test-secret";
  process.env.ENCRYPTION_KEY = "reinstall-test-encryption-only";
  process.env.APP_URL = "https://example.invalid";
  const users = new Map<string, any>();
  let connection: any = null;
  let exchanges = 0;
  (globalThis as any).prisma = {
    user: {
      upsert: async ({ where, create }: any) => {
        if (!users.has(where.email)) users.set(where.email, { id: "retained-user", ...create });
        return users.get(where.email);
      },
    },
    shopifyConnection: {
      findUnique: async () => connection,
      upsert: async ({ create, update }: any) => {
        connection = connection ? { ...connection, ...update } : { ...create };
        return connection;
      },
      update: async ({ data }: any) => (connection = { ...connection, ...data }),
    },
  };
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/admin/oauth/access_token")) {
      exchanges++;
      return Response.json({ access_token: `new-token-${exchanges}`, refresh_token: "refresh", expires_in: 3600 });
    }
    const body = JSON.parse(String(init?.body));
    assert.match(String(input), /\/graphql\.json$/);
    if (body.query.includes("SyncStockWebhooks")) {
      return Response.json({ data: { webhookSubscriptions: { nodes: [] } } });
    }
    return Response.json({ data: { webhookSubscriptionCreate: { webhookSubscription: { id: body.variables.topic }, userErrors: [] } } });
  };
  const { bootstrapEmbeddedShopifyInstall } = await import("../src/lib/shopify-install");
  const { decrypt } = await import("../src/lib/crypto");
  const token = jwt.sign({ dest: "https://reinstall-test.myshopify.com", iss: "https://reinstall-test.myshopify.com/admin", sub: "merchant" }, process.env.SHOPIFY_API_SECRET, { audience: process.env.SHOPIFY_API_KEY, expiresIn: 60 });
  const first = await bootstrapEmbeddedShopifyInstall(token);
  assert.equal(decrypt(connection.accessToken), "new-token-1");
  // Match uninstall behavior: the connection is deleted, the account remains.
  connection = null;
  const second = await bootstrapEmbeddedShopifyInstall(token);
  assert.equal(second.userId, first.userId);
  assert.equal(users.size, 1);
  assert.equal(exchanges, 2);
  assert.equal(decrypt(connection.accessToken), "new-token-2");
  assert.equal(second.lifecycleReady, true);
  await assert.rejects(() => bootstrapEmbeddedShopifyInstall("invalid-token"));
  assert.equal(exchanges, 2, "Invalid tokens must not trigger token exchange or account reuse");
  console.log("Shopify reinstall regression passed: retained account, fresh tokens, webhooks, invalid-token rejection");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
