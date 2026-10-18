import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import crypto from "node:crypto";
import { NextRequest } from "next/server";

const require = createRequire(path.join(process.cwd(), "route-test.js"));
let user: any;
let log: any;
let providerCalls = 0;
let queueCalls = 0;
let processed = 0;
let providerDown = false;
const mock = (file: string, exports: any) => {
  const id = require.resolve(path.join(process.cwd(), file));
  require.cache[id] = { id, filename: id, loaded: true, exports } as any;
};
mock("src/lib/session.ts", { getCurrentUser: async () => user });
mock("src/lib/db.ts", { db: {
  user: { findUnique: async () => user },
  syncLog: {
    findFirst: async ({ where }: any) => log && where.userId === log.userId && where.id === log.id ? { ...log } : null,
    updateMany: async ({ where, data }: any) => {
      if (where.status?.in && !where.status.in.includes(log.status)) return { count: 0 };
      Object.assign(log, data); return { count: 1 };
    },
  },
} });
mock("src/lib/shopify-billing.ts", { ensureCurrentBillingPeriod: async (u: any) => {
  providerCalls++; if (providerDown) throw new Error("provider offline"); return u;
} });
mock("src/lib/queue.ts", { syncQueue: { add: async () => { queueCalls++; } } });
mock("src/lib/shopify.ts", {
  ensureFreshShopifyConnection: async () => ({ shopDomain: "test.myshopify.com", accessToken: "test" }),
  fetchShopifyOrderForRetry: async () => ({ id: "order-1", line_items: [] }),
});
mock("src/lib/sync.ts", { processOrderSync: async () => { processed++; } });
const reset = (state: string, reserved = true) => {
  user = { id: "owner", planTier: "solo_100", subscriptionStatus: state === "cancelled" ? "inactive" : "active",
    orderQuotaUsed: state === "downgraded" ? 777 : 100,
    quotaPeriodEnd: new Date(state === "expired" ? "2020-01-01" : "2099-01-01") };
  log = { id: "log-1", userId: "owner", shopifyOrderId: "order-1", status: "failed", attempts: 5,
    qboInvoiceId: null, quotaReserved: reserved, qboWriteState: reserved ? "creating" : null };
  providerCalls = 0; queueCalls = 0; processed = 0;
};
const req = () => new NextRequest("http://localhost/api/retry", { method: "POST", body: JSON.stringify({ syncLogId: "log-1" }) });
async function main() {
  const plain = await import("../src/app/api/sync/retry/route");
  const embedded = await import("../src/app/api/shopify/embedded/retry/route");
  for (const route of [plain, embedded]) {
    for (const state of ["cancelled", "expired", "downgraded", "capped"]) {
      reset(state); providerDown = true;
      const response = await route.POST(req());
      assert.equal(response.status, 200, `${state}: reserved remote result must remain recoverable after automatic retries exhaust`);
      assert.equal(queueCalls, 1); assert.equal(providerCalls, 0);
      assert.equal(log.quotaReserved, true); assert.equal(log.qboWriteState, "creating");
      assert.equal((await route.POST(req())).status, 409, "duplicate click must not enqueue twice");
      assert.equal(queueCalls, 1);
      reset(state, false); providerDown = false;
      assert.equal((await route.POST(req())).status, 403, `${state}: no reservation means no paid allowance bypass`);
    }
    reset("cancelled"); log.userId = "other-owner";
    assert.equal((await route.POST(req())).status, 404, "recovery still requires log ownership");
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  process.env.WORKER_SIGNING_PUBLIC_KEY_B64 = Buffer.from(publicKey.export({ type: "spki", format: "pem" })).toString("base64");
  const processor = await import("../src/app/api/internal/process-order/route");
  const workerReq = () => {
    const body = JSON.stringify({ userId: "owner", syncLogId: "log-1" });
    const timestamp = String(Date.now());
    const signature = crypto.sign(null, Buffer.from(`${timestamp}.${body}`), privateKey).toString("base64url");
    return new NextRequest("http://localhost/api/internal/process-order", { method: "POST", body, headers: {
      "x-syncstock-worker-timestamp": timestamp, "x-syncstock-worker-signature": signature,
    } });
  };
  reset("cancelled"); providerDown = true;
  assert.equal((await processor.POST(workerReq())).status, 200);
  assert.equal(providerCalls, 0); assert.equal(processed, 1, "worker must deliver reserved recovery to query-only sync path");
  reset("cancelled", false);
  assert.equal((await processor.POST(workerReq())).status, 503);
  assert.equal(processed, 0, "unreserved work must still verify billing");
  console.log("Actual retry and worker routes preserve owned reserved recovery after cancellation, expiry, downgrade, quota cap and provider outage; duplicate clicks and normal quota gates remain enforced.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
