import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

// Load the production orchestrator and quota helper. Only persistence and QBO
// transport are replaced; these tests do not duplicate the sync decision tree.
const requireFromRepo = createRequire(path.join(process.cwd(), "package.json"));
const dbPath = requireFromRepo.resolve("./src/lib/db.ts");
const qboPath = requireFromRepo.resolve("./src/lib/qbo.ts");
const syncPath = requireFromRepo.resolve("./src/lib/sync.ts");
const previousModules = new Map([dbPath, qboPath, syncPath].map((file) => [file, requireFromRepo.cache[file]]));

type Receipt = { Id: string; TotalAmt: number; DocNumber: string };
type ProviderMode = "success" | "uncertain_missing" | "lookup_failure"
  | "mismatch_rollback_success" | "mismatch_rollback_failure" | "mismatch_rollback_ambiguous" | "lease_loss_after_create";
function fixture(orderId: string, mapped = true) {
  let user = { id: "test-user", planTier: "trial", subscriptionStatus: "trial", orderQuotaUsed: 19 };
  let log: any = { id: `log-${orderId}`, userId: user.id, shopifyOrderId: orderId,
    status: "pending", quotaReserved: false, qboWriteState: null, attempts: 0,
    syncLeaseToken: null, syncLeaseExpiresAt: null };
  let transactionTail = Promise.resolve();
  let failUserUpdate = false;
  let activeTransactions = 0;
  const provider = { mode: "success" as ProviderMode, creates: 0, lookups: 0, deletes: 0, clients: 0,
    receipts: new Map<string, Receipt>() };
  const mappings = mapped ? [{ shopifyVariantId: "variant-1", shopifySku: "sku-1", qboItemId: "item-1" }] : [];
  const apply = (row: any, data: any) => {
    for (const [field, value] of Object.entries(data)) {
      row[field] = value && typeof value === "object" && "increment" in value
        ? (row[field] || 0) + Number((value as any).increment) : value;
    }
    return structuredClone(row);
  };
  const db: any = {
    productMapping: { findMany: async () => structuredClone(mappings) },
    accountingSettings: { findUnique: async () => null },
    $transaction: async (run: any) => {
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      const snapshot = structuredClone({ user, log });
      activeTransactions++;
      let locked = false;
      const check = () => assert(locked, "Quota/log writes require the User row lock");
      const tx = {
        $queryRaw: async (sql: TemplateStringsArray) => {
          assert.match(sql.join("?"), /FROM "User".*FOR UPDATE/);
          locked = true; return [{ id: user.id }];
        },
        user: {
          findUnique: async () => { check(); return structuredClone(user); },
          findUniqueOrThrow: async () => { check(); return structuredClone(user); },
          update: async ({ data }: any) => {
            check();
            if (failUserUpdate) { failUserUpdate = false; throw new Error("injected finalization failure"); }
            return apply(user, data);
          },
        },
        syncLog: {
          findUnique: async () => { check(); return structuredClone(log); },
          findUniqueOrThrow: async () => { check(); return structuredClone(log); },
          count: async () => { check(); return log.quotaReserved ? 1 : 0; },
          update: async ({ data }: any) => { check(); return apply(log, data); },
        },
      };
      try { return await run(tx); }
      catch (error) { user = snapshot.user; log = snapshot.log; throw error; }
      finally { activeTransactions--; release(); }
    },
  };
  return { db, provider, user: () => user, log: () => log,
    assertOutsideTransaction: () => assert.equal(activeTransactions, 0, "QBO must not run inside a DB transaction"),
    failNextUserUpdate: () => { failUserUpdate = true; },
  };
}
let active: ReturnType<typeof fixture>;
const transport = {
  getQboClientForUser: async (userId: string) => {
    active.assertOutsideTransaction(); assert.equal(userId, "test-user");
    active.provider.clients++; return { fakeQbo: true };
  },
  findSalesReceiptByDocNumber: async (_client: unknown, docNumber: string) => {
    active.assertOutsideTransaction(); active.provider.lookups++;
    if (active.provider.mode === "lookup_failure") throw new Error("provider lookup unavailable before write");
    return structuredClone(active.provider.receipts.get(docNumber) ?? null);
  },
  createSalesReceipt: async (_client: unknown, docNumber: string, lines: any[], tax: number) => {
    active.assertOutsideTransaction(); active.provider.creates++;
    assert.equal(lines[0].qboItemId, "item-1"); assert.equal(tax, 0);
    assert.equal(active.log().qboWriteState, "creating", "Remote write intent must already be durable");
    assert.equal(active.log().quotaReserved, true);
    if (active.provider.mode === "uncertain_missing") throw new Error("QBO response timed out; outcome unknown");
    const mismatch = active.provider.mode.startsWith("mismatch_") || active.provider.mode === "lease_loss_after_create";
    const receipt = { Id: `receipt-${docNumber}`, TotalAmt: mismatch ? 11 : 10, DocNumber: docNumber };
    active.provider.receipts.set(docNumber, receipt);
    if (active.provider.mode === "lease_loss_after_create") {
      // A replacement took ownership while the old remote request was in flight.
      Object.assign(active.log(), { syncLeaseToken: "replacement-owner", syncLeaseExpiresAt: new Date(Date.now() + 60_000) });
    }
    return structuredClone(receipt);
  },
  deleteSalesReceipt: async (_client: unknown, receipt: Receipt) => {
    active.assertOutsideTransaction(); active.provider.deletes++;
    assert.equal(active.log().qboWriteState, "rollback", "Rollback intent must be durable before deletion");
    if (active.provider.mode === "mismatch_rollback_failure") throw new Error("provider rejected rollback");
    if (!["mismatch_rollback_success", "mismatch_rollback_ambiguous"].includes(active.provider.mode)) {
      throw new Error("Unexpected deletion in recovery test");
    }
    active.provider.receipts.delete(receipt.DocNumber);
    if (active.provider.mode === "mismatch_rollback_ambiguous") throw new Error("rollback response lost; outcome unknown");
    return { Id: receipt.Id, status: "Deleted" };
  },
  getSalesReceiptById: async (_client: unknown, id: string) => {
    active.assertOutsideTransaction();
    const receipt = [...active.provider.receipts.values()].find((row) => row.Id === id);
    assert(receipt, "Hydrated receipt must already exist"); return structuredClone(receipt);
  },
};
function mockModule(file: string, exports: unknown) {
  requireFromRepo.cache[file] = { id: file, filename: file, loaded: true, exports } as NodeModule;
}
const order = (id: string) => ({ id, name: `#${id}`, currency: "USD", total_price: "10.00",
  total_tax: "0.00", total_discounts: "0.00", line_items: [
    { variant_id: "variant-1", sku: "sku-1", title: "Widget", quantity: 1, price: "10.00" },
  ] });

async function main() {
  mockModule(dbPath, { db: new Proxy({}, { get: (_target, field) => Reflect.get(active.db, field) }) });
  mockModule(qboPath, transport);
  delete requireFromRepo.cache[syncPath];
  const { processOrderSync } = requireFromRepo(syncPath) as typeof import("../src/lib/sync");

  active = fixture("101");
  await processOrderSync("test-user", order("101"));
  await processOrderSync("test-user", order("101"));
  assert.equal(active.provider.creates, 1); assert.equal(active.provider.lookups, 1);
  assert.equal(active.user().orderQuotaUsed, 20); assert.equal(active.log().status, "success");
  assert.equal(active.log().qboInvoiceId, "receipt-SS-101"); assert.equal(active.log().quotaReserved, false);

  active = fixture("102"); active.failNextUserUpdate();
  await assert.rejects(processOrderSync("test-user", order("102")), /injected finalization failure/);
  assert.equal(active.provider.receipts.size, 1, "QBO success survives local DB rollback");
  assert.equal(active.provider.creates, 1); assert.equal(active.user().orderQuotaUsed, 19);
  assert.equal(active.log().status, "failed"); assert.equal(active.log().attempts, 1);
  assert.equal(active.log().quotaReserved, true); assert.equal(active.log().qboWriteState, "creating");
  await processOrderSync("test-user", order("102"));
  await processOrderSync("test-user", order("102"));
  assert.equal(active.provider.lookups, 2, "Actual retry queried QBO by stable DocNumber");
  assert.equal(active.provider.creates, 1, "Actual retry must never recreate existing QBO receipt");
  assert.equal(active.provider.deletes, 0); assert.equal(active.user().orderQuotaUsed, 20);
  assert.equal(active.log().status, "success"); assert.equal(active.log().qboInvoiceId, "receipt-SS-102");
  assert.equal(active.log().quotaReserved, false); assert.equal(active.log().qboWriteState, null);

  active = fixture("103"); active.provider.mode = "uncertain_missing";
  await assert.rejects(processOrderSync("test-user", order("103")), /outcome unknown/);
  active.provider.mode = "success"; // Recovery must still refuse another write.
  await assert.rejects(processOrderSync("test-user", order("103")), /uncertain outcome.*no receipt was found/);
  assert.equal(active.provider.creates, 1); assert.equal(active.provider.receipts.size, 0);
  assert.equal(active.provider.lookups, 2); assert.equal(active.log().quotaReserved, true);
  assert.equal(active.log().qboWriteState, "creating"); assert.equal(active.user().orderQuotaUsed, 19);
  assert.match(active.log().errorMessage, /No second receipt was created/);

  active = fixture("104", false);
  await processOrderSync("test-user", order("104"));
  assert.equal(active.log().status, "skipped_no_mapping"); assert.equal(active.log().quotaReserved, false);
  assert.equal(active.log().qboWriteState, null); assert.equal(active.user().orderQuotaUsed, 19);
  assert.equal(active.provider.clients, 0); assert.equal(active.provider.creates, 0);

  active = fixture("105"); active.provider.mode = "lookup_failure";
  await assert.rejects(processOrderSync("test-user", order("105")), /provider lookup unavailable/);
  assert.equal(active.log().quotaReserved, false); assert.equal(active.log().qboWriteState, null);
  active.provider.mode = "success";
  await processOrderSync("test-user", order("105"));
  assert.equal(active.provider.creates, 1); assert.equal(active.user().orderQuotaUsed, 20);
  assert.equal(active.log().status, "success");

  active = fixture("106"); active.provider.mode = "mismatch_rollback_success";
  await processOrderSync("test-user", order("106"));
  assert.equal(active.provider.creates, 1); assert.equal(active.provider.deletes, 1);
  assert.equal(active.provider.receipts.size, 0); assert.equal(active.user().orderQuotaUsed, 19);
  assert.equal(active.log().status, "blocked_reconciliation"); assert.equal(active.log().qboInvoiceId, null);
  assert.equal(active.log().quotaReserved, false, "Confirmed rollback releases its slot");
  assert.equal(active.log().qboWriteState, null); assert.equal(active.log().qboActualTotal, "11.00");

  for (const mode of ["mismatch_rollback_failure", "mismatch_rollback_ambiguous"] as const) {
    const id = mode === "mismatch_rollback_failure" ? "107" : "108";
    active = fixture(id); active.provider.mode = mode;
    await processOrderSync("test-user", order(id));
    assert.equal(active.provider.creates, 1); assert.equal(active.provider.deletes, 1);
    assert.equal(active.provider.receipts.size, mode === "mismatch_rollback_failure" ? 1 : 0);
    assert.equal(active.log().status, "reconciliation_failed_qbo");
    assert.match(active.log().errorMessage, /Automatic rollback failed.*Do not retry/);
    assert.equal(active.log().quotaReserved, true); assert.equal(active.log().qboWriteState, "rollback");
    assert.equal(active.user().orderQuotaUsed, 19);
    await assert.rejects(processOrderSync("test-user", order(id)), /rollback has an uncertain outcome.*Manual review/);
    assert.equal(active.provider.creates, 1, "Rollback recovery must not create another receipt");
    assert.equal(active.provider.deletes, 1, "Rollback recovery must not repeat a possibly completed deletion");
    assert.equal(active.log().quotaReserved, true); assert.equal(active.log().qboWriteState, "rollback");
    assert.notEqual(active.log().status, "success"); assert.match(active.log().errorMessage, /Manual review is required/);
    assert.equal(active.user().orderQuotaUsed, 19);
  }

  active = fixture("109"); active.provider.mode = "lease_loss_after_create";
  await assert.rejects(processOrderSync("test-user", order("109")), /Another attempt owns this order sync/);
  assert.equal(active.provider.creates, 1); assert.equal(active.provider.receipts.size, 1);
  assert.equal(active.provider.deletes, 0, "Stale owner must not delete its mismatched remote receipt");
  assert.notEqual(active.log().status, "success"); assert.equal(active.user().orderQuotaUsed, 19);
  assert.equal(active.log().quotaReserved, true); assert.equal(active.log().qboWriteState, "creating");
  assert.equal(active.log().syncLeaseToken, "replacement-owner", "Stale cleanup must not clear the new owner");
  // When that lease expires, actual recovery queries the existing mismatch and
  // sends it to review, without any second create, delete, or quota completion.
  active.log().syncLeaseExpiresAt = new Date(0);
  active.provider.mode = "success";
  await processOrderSync("test-user", order("109"));
  assert.equal(active.provider.creates, 1); assert.equal(active.provider.deletes, 0);
  assert.equal(active.provider.lookups, 2); assert.equal(active.log().status, "reconciliation_failed_qbo");
  assert.equal(active.log().quotaReserved, true); assert.equal(active.user().orderQuotaUsed, 19);

  console.log("Actual processOrderSync recovery smoke passed: normal/duplicate, remote-success/DB-failure, uncertain write, missing mapping, provider retry, confirmed/failed/ambiguous rollback, and lease loss after remote create.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const [file, previous] of previousModules) {
    if (previous) requireFromRepo.cache[file] = previous;
    else delete requireFromRepo.cache[file];
  }
});
