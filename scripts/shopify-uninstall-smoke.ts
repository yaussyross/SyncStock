import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";

type Connection = { id: string; userId: string; shopDomain: string };
const shopDomain = "uninstall-test.myshopify.com";
const secret = "uninstall-test-secret";
const originalConnection: Connection = { id: "old-install", userId: "retained-user", shopDomain };
let connection: Connection | null;
let mappings: string[];
let tombstone: any;
const deliveries = new Map<string, any>();
let reads = 0;
let simultaneousReads = 0;
let releaseReads: () => void;
let readBarrier: Promise<void>;
let disappearAfterRead = false;
let transactionTail: Promise<unknown> = Promise.resolve();

// Prisma transaction-array operations are lazy. Keep that behavior in this
// persistence double so both handlers can read the same connection before the
// first transaction deletes it, then execute the transactions in order.
function operation<T>(run: () => T): PromiseLike<T> {
  return { then: (resolve, reject) => Promise.resolve().then(run).then(resolve, reject) };
}

function reset() {
  connection = { ...originalConnection };
  mappings = [originalConnection.userId];
  tombstone = null;
  deliveries.clear();
  reads = 0;
  simultaneousReads = 0;
  disappearAfterRead = false;
  readBarrier = new Promise<void>((resolve) => { releaseReads = resolve; });
  transactionTail = Promise.resolve();
}

async function main() {
  process.env.SHOPIFY_API_SECRET = secret;
  delete process.env.SHOPIFY_API_SECRET_PREVIOUS;
  (globalThis as any).prisma = {
    webhookDelivery: {
      findUnique: async ({ where }: any) => deliveries.get(where.deliveryId) ?? null,
      create: async ({ data }: any) => {
        deliveries.set(data.deliveryId, { ...data });
        return deliveries.get(data.deliveryId);
      },
      update: ({ where, data }: any) => operation(() => {
        assert.ok(deliveries.has(where.deliveryId));
        const delivery = { ...deliveries.get(where.deliveryId), ...data };
        deliveries.set(where.deliveryId, delivery);
        return delivery;
      }),
    },
    shopifyConnection: {
      findUnique: async () => {
        const snapshot = connection && { ...connection };
        reads++;
        if (simultaneousReads) {
          if (reads === simultaneousReads) releaseReads();
          await readBarrier;
        }
        if (disappearAfterRead) connection = null;
        return snapshot;
      },
      delete: ({ where }: any) => operation(() => {
        if (connection?.id !== where.id) {
          throw Object.assign(new Error("Record to delete does not exist"), { code: "P2025" });
        }
        const deleted = connection;
        connection = null;
        return deleted;
      }),
      deleteMany: ({ where }: any) => operation(() => {
        assert.deepEqual(where, { id: originalConnection.id }, "Delete only the observed installation");
        const count = connection?.id === where.id ? 1 : 0;
        if (count) connection = null;
        return { count };
      }),
    },
    productMapping: {
      deleteMany: ({ where }: any) => operation(() => {
        const before = mappings.length;
        mappings = mappings.filter((userId) => userId !== where.userId);
        return { count: before - mappings.length };
      }),
    },
    shopTombstone: {
      upsert: ({ create, update }: any) => operation(() => {
        tombstone = tombstone ? { ...tombstone, ...update } : { ...create };
        return tombstone;
      }),
    },
    $transaction: (operations: PromiseLike<unknown>[]) => {
      const result = transactionTail.then(async () => {
        for (const pending of operations) await pending;
      });
      transactionTail = result.catch(() => undefined);
      return result;
    },
  };
  const { POST } = await import("../src/app/api/webhooks/shopify/lifecycle/route");
  const request = (deliveryId: string, validSignature = true) => {
    const body = JSON.stringify({ id: 123 });
    return new NextRequest("https://example.invalid/api/webhooks/shopify/lifecycle", {
      method: "POST",
      body,
      headers: {
        "x-shopify-hmac-sha256": createHmac("sha256", validSignature ? secret : "wrong-secret").update(body).digest("base64"),
        "x-shopify-shop-domain": shopDomain,
        "x-shopify-webhook-id": deliveryId,
        "x-shopify-event-id": "same-uninstall-event",
        "x-shopify-topic": "app/uninstalled",
      },
    });
  };
  const assertCleanup = (...ids: string[]) => {
    assert.equal(connection, null);
    assert.deepEqual(mappings, []);
    assert.equal(tombstone?.userId, originalConnection.userId);
    for (const id of ids) {
      assert.equal(deliveries.get(id)?.status, "ignored");
      assert.ok(deliveries.get(id)?.processedAt instanceof Date);
    }
  };

  reset();
  simultaneousReads = 2;
  const concurrent = await Promise.all([POST(request("first-delivery")), POST(request("redelivery"))]);
  for (const response of concurrent) {
    assert.equal(response.status, 200);
    assert.equal((await response.json()).disconnected, true);
  }
  assert.equal(reads, 2, "Both handlers must observe the connection before either transaction deletes it");
  assertCleanup("first-delivery", "redelivery");

  const duplicate = await POST(request("first-delivery"));
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);
  assert.equal(reads, 2, "Completed delivery replays should not look up the connection again");

  reset();
  disappearAfterRead = true;
  assert.equal((await POST(request("deleted-after-read"))).status, 200);
  assertCleanup("deleted-after-read");

  reset();
  connection = null;
  assert.equal((await POST(request("already-disconnected"))).status, 200);
  assert.equal(deliveries.get("already-disconnected")?.status, "ignored");
  assert.equal(tombstone, null);

  reset();
  assert.equal((await POST(request("forged-uninstall", false))).status, 400);
  assert.equal(deliveries.size, 0);
  assert.equal(reads, 0);
  assert.deepEqual(connection, originalConnection);
  assert.deepEqual(mappings, [originalConnection.userId]);
  console.log("Shopify uninstall regression passed: concurrent redelivery, replay, deleted connection, and HMAC rejection");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
