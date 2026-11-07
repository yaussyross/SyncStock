import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { syntheticShopEmail } from "../src/lib/shopify-shop-account";

async function main() {
  // Explicit opt-in to a disposable local DB; never fall back to app credentials.
  const url = process.env.SYNCSTOCK_REDACTION_TEST_DATABASE_URL;
  assert.ok(url, "Set SYNCSTOCK_REDACTION_TEST_DATABASE_URL to a migrated disposable local database");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname), "Tests require a local database");
  const db = new PrismaClient({ datasources: { db: { url } } });
  const prefix = `redaction-${randomUUID()}`;
  const userIds: string[] = [];
  const shops: string[] = [];
  let serial = 0;
  let failDelete = false;
  let conflicts = 0;
  let transactionAttempts = 0;
  const originalTransaction = db.$transaction.bind(db);
  // Inject failures around REAL transactions so rollback and retry assertions
  // exercise Prisma and SQL constraints, not an in-memory model of the schema.
  const routeDb = new Proxy(db, {
    get(target, prop) {
      if (prop === "$transaction") return async (callback: any, options: any) => {
        if (Array.isArray(callback)) return originalTransaction(callback, options);
        transactionAttempts++;
        if (conflicts > 0) {
          conflicts--;
          throw new Prisma.PrismaClientKnownRequestError("test serialization conflict", {
            code: "P2034", clientVersion: Prisma.prismaVersion.client,
          });
        }
        return originalTransaction(async (tx) => callback(failDelete ? new Proxy(tx, {
          get(client, key) {
            if (key === "feedback") return { deleteMany: async () => { throw new Error("injected deletion failure"); } };
            return Reflect.get(client, key);
          },
        }) : tx), options);
      };
      return Reflect.get(target, prop);
    },
  });
  (globalThis as any).prisma = routeDb;
  process.env.SHOPIFY_API_SECRET = "shop-redaction-test-secret";
  delete process.env.SHOPIFY_API_SECRET_PREVIOUS;
  const { POST } = await import("../src/app/api/webhooks/shopify/compliance/route");

  const newShop = () => {
    const shop = `${prefix}-${++serial}.myshopify.com`;
    shops.push(shop);
    return shop;
  };
  async function seed(shop = newShop(), email = syntheticShopEmail(shop)) {
    const userId = `${prefix}-${++serial}`;
    userIds.push(userId);
    await db.user.create({ data: {
      id: userId, email, stripeCustomerId: `cus_${userId}`, stripeSubscriptionId: `sub_${userId}`,
      subscriptionStatus: "active", planTier: "growth", orderQuotaUsed: 42,
      shopifyConnection: { create: { shopDomain: shop, accessToken: "encrypted-shop-token", scope: "read_orders" } },
      qboConnection: { create: { realmId: "shared-realm", accessToken: "encrypted-qbo-token", refreshToken: "encrypted-refresh", tokenExpiry: new Date() } },
      accountingSettings: { create: { shippingQboItemId: "shipping" } },
      productMappings: { create: { shopifyVariantId: "same-variant", qboItemId: "item" } },
      syncLogs: { create: { shopifyOrderId: "same-order", status: "success", qboInvoiceId: "receipt" } },
      orderAdjustments: { create: { shopifyOrderId: "same-order", kind: "refund", details: { note: "private" } } },
      complianceRequests: { create: { requestId: userId, shopDomain: shop, kind: "customers_data_request", response: { private: true } } },
      feedback: { create: { message: "private feedback" } },
    } });
    await db.shopTombstone.create({ data: { userId, shopDomain: shop } });
    await db.webhookDelivery.create({ data: { deliveryId: userId, shopDomain: shop, topic: "orders/paid" } });
    return { shop, userId };
  }
  async function snapshot(userId: string, shop: string) {
    return {
      user: await db.user.findUnique({ where: { id: userId } }),
      qbo: await db.qboConnection.findMany({ where: { userId } }),
      accounting: await db.accountingSettings.findMany({ where: { userId } }),
      mappings: await db.productMapping.findMany({ where: { userId } }),
      logs: await db.syncLog.findMany({ where: { userId } }),
      adjustments: await db.orderAdjustment.findMany({ where: { userId } }),
      requests: await db.complianceRequest.findMany({ where: { OR: [{ userId }, { shopDomain: shop }] } }),
      feedback: await db.feedback.findMany({ where: { userId } }),
      connections: await db.shopifyConnection.findMany({ where: { userId } }),
      tombstones: await db.shopTombstone.findMany({ where: { shopDomain: shop } }),
      deliveries: await db.webhookDelivery.findMany({ where: { shopDomain: shop } }),
    };
  }
  async function assertErased(record: { userId: string; shop: string }) {
    const state = await snapshot(record.userId, record.shop);
    assert.equal(state.user, null, "shop-scoped account and billing state must be erased");
    for (const [model, rows] of Object.entries(state)) {
      if (model !== "user") assert.deepEqual(rows, [], `${model} must be erased`);
    }
  }
  async function send(shop: string, options: { body?: string; hmac?: string; deliveryId?: string; triggeredAt?: string | null } = {}) {
    const body = options.body ?? JSON.stringify({ shop_id: 123, shop_domain: shop });
    return POST(new NextRequest("http://localhost/api/webhooks/shopify/compliance", {
      method: "POST", body,
      headers: {
        "content-type": "application/json", "x-shopify-topic": "shop/redact",
        "x-shopify-shop-domain": shop, "x-shopify-webhook-id": options.deliveryId ?? `${prefix}-delivery`,
        ...(options.triggeredAt === null ? {} : { "x-shopify-triggered-at": options.triggeredAt ?? new Date().toISOString() }),
        "x-shopify-hmac-sha256": options.hmac ?? createHmac("sha256", process.env.SHOPIFY_API_SECRET!).update(body).digest("base64"),
      },
    }));
  }
  let passed = 0;
  const pass = (name: string) => { passed++; console.log(`PASS: ${name}`); };
  try {
    const unrelated = await seed();
    const unrelatedBefore = await snapshot(unrelated.userId, unrelated.shop);
    const complete = await seed();
    assert.equal((await send(complete.shop)).status, 200);
    await assertErased(complete);
    assert.deepEqual(await snapshot(unrelated.userId, unrelated.shop), unrelatedBefore);
    pass("complete erasure of all 11 models; unrelated shop with same QBO realm/order/variant preserved");

    for (const deliveryId of [`${prefix}-delivery`, `${prefix}-different-delivery`]) {
      const response = await send(complete.shop, { deliveryId });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { received: true, redacted: true });
      await assertErased(complete);
    }
    pass("same-ID and different-ID duplicate deliveries");

    const partial = await seed();
    await db.shopifyConnection.deleteMany({ where: { userId: partial.userId } });
    await db.qboConnection.deleteMany({ where: { userId: partial.userId } });
    await db.accountingSettings.deleteMany({ where: { userId: partial.userId } });
    await db.feedback.deleteMany({ where: { userId: partial.userId } });
    assert.equal((await send(partial.shop)).status, 200);
    await assertErased(partial);
    pass("tombstone-only ownership with partially missing children");

    const liveOnly = await seed();
    await db.shopTombstone.deleteMany({ where: { shopDomain: liveOnly.shop } });
    assert.equal((await send(liveOnly.shop)).status, 200);
    await assertErased(liveOnly);
    pass("live connection without tombstone");

    const orphan = await seed();
    await db.shopifyConnection.deleteMany({ where: { userId: orphan.userId } });
    await db.shopTombstone.deleteMany({ where: { shopDomain: orphan.shop } });
    assert.equal((await send(orphan.shop)).status, 200);
    await assertErased(orphan);
    pass("synthetic identity recovers old-handler orphan account");

    const missing = { userId: `${prefix}-missing`, shop: newShop() };
    await db.shopTombstone.create({ data: { userId: missing.userId, shopDomain: missing.shop } });
    await db.webhookDelivery.create({ data: { deliveryId: missing.userId, shopDomain: missing.shop } });
    assert.equal((await send(missing.shop)).status, 200);
    await assertErased(missing);
    const deliveryOnly = newShop();
    await db.webhookDelivery.create({ data: { deliveryId: `${prefix}-delivery-only`, shopDomain: deliveryOnly } });
    assert.equal((await send(deliveryOnly)).status, 200);
    assert.equal(await db.webhookDelivery.count({ where: { shopDomain: deliveryOnly } }), 0);
    assert.equal((await send(newShop())).status, 200);
    pass("dangling tombstone, delivery-only and completely absent shop");

    const protectedAccount = await seed();
    const before = await snapshot(protectedAccount.userId, protectedAccount.shop);
    assert.equal((await send(protectedAccount.shop, { hmac: "invalid" })).status, 401);
    assert.equal((await send(protectedAccount.shop, { body: JSON.stringify({ shop_domain: unrelated.shop }) })).status, 400);
    assert.equal((await send(protectedAccount.shop, { body: "{}" })).status, 400);
    assert.equal((await send(protectedAccount.shop, { body: "{" })).status, 400);
    assert.equal((await send(protectedAccount.shop, { triggeredAt: null })).status, 400);
    assert.equal((await send(protectedAccount.shop, { triggeredAt: "invalid" })).status, 400);
    assert.deepEqual(await snapshot(protectedAccount.userId, protectedAccount.shop), before);
    pass("invalid HMAC, domain, JSON or event timestamp cannot delete data");

    failDelete = true;
    assert.equal((await send(protectedAccount.shop)).status, 500);
    assert.deepEqual(await snapshot(protectedAccount.userId, protectedAccount.shop), before);
    failDelete = false;
    assert.equal((await send(protectedAccount.shop)).status, 200);
    await assertErased(protectedAccount);
    pass("mid-transaction failure rolls back credentials and all earlier deletes; retry succeeds");

    const retried = await seed();
    conflicts = 1;
    transactionAttempts = 0;
    assert.equal((await send(retried.shop)).status, 200);
    assert.equal(transactionAttempts, 2);
    await assertErased(retried);
    const exhausted = await seed();
    const exhaustedBefore = await snapshot(exhausted.userId, exhausted.shop);
    conflicts = 3;
    transactionAttempts = 0;
    assert.equal((await send(exhausted.shop)).status, 500);
    assert.equal(transactionAttempts, 3);
    assert.deepEqual(await snapshot(exhausted.userId, exhausted.shop), exhaustedBefore);
    assert.equal((await send(exhausted.shop)).status, 200);
    await assertErased(exhausted);
    pass("serialization conflicts retry with a bound and never acknowledge failure as completion");

    const legacy = await seed(newShop(), `${prefix}@example.invalid`);
    const legacyBefore = await snapshot(legacy.userId, legacy.shop);
    assert.equal((await send(legacy.shop)).status, 500);
    assert.deepEqual(await snapshot(legacy.userId, legacy.shop), legacyBefore);
    pass("standalone login requires ownership review and remains untouched");

    const conflict = await seed();
    await db.shopTombstone.update({ where: { shopDomain: conflict.shop }, data: { userId: unrelated.userId } });
    const conflictBefore = await snapshot(conflict.userId, conflict.shop);
    assert.equal((await send(conflict.shop)).status, 500);
    assert.deepEqual(await snapshot(conflict.userId, conflict.shop), conflictBefore);
    pass("live/tombstone owner disagreement fails atomically");

    const moved = await seed();
    const movedShop = newShop();
    await db.shopifyConnection.update({ where: { userId: moved.userId }, data: { shopDomain: movedShop } });
    const movedBefore = await snapshot(moved.userId, moved.shop);
    assert.equal((await send(moved.shop)).status, 500);
    assert.deepEqual(await snapshot(moved.userId, moved.shop), movedBefore);
    pass("stale tombstone cannot delete an account now connected to a different shop");

    const shared = await seed();
    const otherShop = newShop();
    await db.shopTombstone.create({ data: { userId: shared.userId, shopDomain: otherShop } });
    const sharedBefore = await snapshot(shared.userId, shared.shop);
    assert.equal((await send(shared.shop)).status, 500);
    assert.deepEqual(await snapshot(shared.userId, shared.shop), sharedBefore);
    await db.shopTombstone.deleteMany({ where: { shopDomain: otherShop } });
    await db.complianceRequest.create({ data: { userId: shared.userId, shopDomain: otherShop, requestId: `${prefix}-other`, kind: "customers_redact" } });
    const requestBefore = await snapshot(shared.userId, shared.shop);
    assert.equal((await send(shared.shop)).status, 500);
    assert.deepEqual(await snapshot(shared.userId, shared.shop), requestBefore);
    assert.deepEqual(await snapshot(unrelated.userId, unrelated.shop), unrelatedBefore);
    pass("other-shop tombstones and compliance records prevent user-wide deletion");

    const concurrent = await seed();
    const responses = await Promise.all([send(concurrent.shop), send(concurrent.shop)]);
    assert.deepEqual(responses.map((response) => response.status), [200, 200]);
    await assertErased(concurrent);
    pass("concurrent duplicate delivery");

    const firstInstall = await seed();
    const eventTime = new Date();
    const oldDelivery = { triggeredAt: eventTime.toISOString(), deliveryId: `${prefix}-old-install` };
    assert.equal((await send(firstInstall.shop, oldDelivery)).status, 200);
    await assertErased(firstInstall);
    const reinstall = await seed(firstInstall.shop);
    const later = new Date(eventTime.getTime() + 1000);
    await db.user.update({ where: { id: reinstall.userId }, data: { createdAt: later } });
    await db.shopifyConnection.update({ where: { userId: reinstall.userId }, data: { installedAt: later } });
    let reinstallBefore = await snapshot(reinstall.userId, reinstall.shop);
    const stale = await send(reinstall.shop, oldDelivery);
    assert.equal(stale.status, 200);
    assert.deepEqual(await stale.json(), { received: true, ignored: true, reason: "newer_shop_lifecycle" });
    assert.deepEqual(await snapshot(reinstall.userId, reinstall.shop), reinstallBefore);
    // The account can also be reused, then uninstalled again before the old retry.
    await db.user.update({ where: { id: reinstall.userId }, data: { createdAt: new Date(eventTime.getTime() - 1000) } });
    reinstallBefore = await snapshot(reinstall.userId, reinstall.shop);
    assert.equal((await send(reinstall.shop, oldDelivery)).status, 200);
    assert.deepEqual(await snapshot(reinstall.userId, reinstall.shop), reinstallBefore);
    await db.shopifyConnection.deleteMany({ where: { userId: reinstall.userId } });
    await db.shopTombstone.update({ where: { shopDomain: reinstall.shop }, data: { uninstalledAt: later } });
    reinstallBefore = await snapshot(reinstall.userId, reinstall.shop);
    assert.equal((await send(reinstall.shop, oldDelivery)).status, 200);
    assert.deepEqual(await snapshot(reinstall.userId, reinstall.shop), reinstallBefore);
    assert.equal((await send(reinstall.shop, { triggeredAt: new Date(later.getTime() + 1000).toISOString() })).status, 200);
    await assertErased(reinstall);
    pass("old delivery preserves a later same-shop installation and uninstall; newer redaction succeeds");
    console.log(`Shop redaction: ${passed} regression groups passed`);
  } finally {
    // Remove only this run's fixtures; never truncate tables or remove other users.
    const where = { userId: { in: userIds } };
    await db.$transaction([
      db.productMapping.deleteMany({ where }), db.syncLog.deleteMany({ where }),
      db.orderAdjustment.deleteMany({ where }), db.complianceRequest.deleteMany({ where }),
      db.qboConnection.deleteMany({ where }), db.accountingSettings.deleteMany({ where }),
      db.feedback.deleteMany({ where }), db.shopifyConnection.deleteMany({ where }),
      db.shopTombstone.deleteMany({ where: { shopDomain: { in: shops } } }),
      db.webhookDelivery.deleteMany({ where: { shopDomain: { in: shops } } }),
      db.user.deleteMany({ where: { id: { in: userIds } } }),
    ]);
    await db.$disconnect();
  }
}

const watchdog = setTimeout(() => {
  console.error("Shop redaction tests timed out before completion");
  process.exit(1);
}, 60_000);
main().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => clearTimeout(watchdog));
