import assert from "node:assert/strict";
import { withOrderQuota, lockQuotaUser, SyncLeaseLostError, QuotaReservationBusyError } from "../src/lib/sync-quota";

// Deterministic transaction model for fast local checks. The separate DB smoke
// exercises the same production helper against real PostgreSQL row locks.
function memoryDatabase(limitUsed = 19, tier = "trial") {
  let user = { id: "user", planTier: tier, subscriptionStatus: tier === "trial" ? "trial" : "active", orderQuotaUsed: limitUsed, quotaPeriodEnd: new Date(Date.now() + 86_400_000) };
  let logs = new Map<string, any>();
  let queue = Promise.resolve();
  let failUserUpdate = false;
  const key = (where: any) => where.userId_shopifyOrderId.shopifyOrderId;
  const apply = (row: any, data: any) => {
    for (const [name, value] of Object.entries(data)) {
      row[name] = value && typeof value === "object" && "increment" in value
        ? (row[name] || 0) + (value as any).increment : value;
    }
    return structuredClone(row);
  };
  const db: any = {
    $transaction: async (run: any) => {
      const previous = queue;
      let release!: () => void;
      queue = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      const snapshot = structuredClone({ user, logs });
      let locked = false;
      const checkLock = () => assert(locked, "User row must be locked before quota/log operations");
      const tx = {
        $queryRaw: async (sql: TemplateStringsArray) => {
          assert.match(sql.join("?"), /FROM "User".*FOR UPDATE/);
          locked = true; return [{ id: "user" }];
        },
        user: {
          findUnique: async () => { checkLock(); return structuredClone(user); },
          findUniqueOrThrow: async () => { checkLock(); return structuredClone(user); },
          update: async ({ data }: any) => {
            checkLock();
            if (failUserUpdate) { failUserUpdate = false; throw new Error("injected finalization failure"); }
            return apply(user, data);
          },
        },
        syncLog: {
          findUnique: async ({ where }: any) => { checkLock(); return structuredClone(logs.get(key(where))); },
          findUniqueOrThrow: async ({ where }: any) => { checkLock(); return structuredClone(logs.get(key(where))); },
          count: async () => { checkLock(); return [...logs.values()].filter((row) => row.quotaReserved).length; },
          update: async ({ where, data }: any) => { checkLock(); return apply(logs.get(key(where)), data); },
        },
      };
      try { return await run(tx); }
      catch (error) { user = snapshot.user; logs = snapshot.logs; throw error; }
      finally { release(); }
    },
  };
  return { db, user: () => user, row: (id: string) => logs.get(id),
    failNextUserUpdate: () => { failUserUpdate = true; },
    add: (id: string) => logs.set(id, { status: "pending", quotaReserved: false, qboWriteState: null, attempts: 0 }),
  };
}
async function main() {
  const cap = memoryDatabase();
  for (let i = 0; i < 20; i++) cap.add(String(i));
  let creates = 0;
  const capResults = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => withOrderQuota(cap.db, "user", String(i), async (lease) => {
    creates++;
    await lease.beginMutation("creating");
    await lease.succeed("receipt");
  })));
  for (const result of capResults) if (result.status === "rejected") assert(result.reason instanceof QuotaReservationBusyError);
  assert.equal(creates, 1); assert.equal(cap.user().orderQuotaUsed, 20);

  const dup = memoryDatabase(); dup.add("same");
  let runs = 0;
  const duplicateResults = await Promise.allSettled(Array.from({ length: 8 }, () => withOrderQuota(dup.db, "user", "same", async (lease) => {
    runs++; await lease.succeed("receipt");
  })));
  assert.equal(runs, 1); assert.equal(dup.user().orderQuotaUsed, 20);
  for (const result of duplicateResults) if (result.status === "rejected") assert(result.reason instanceof SyncLeaseLostError);

  const failed = memoryDatabase(); failed.add("one"); failed.add("two");
  await assert.rejects(withOrderQuota(failed.db, "user", "one", async (lease) => {
    await lease.update({ status: "failed", attempts: { increment: 1 } }); throw new Error("before write");
  }), /before write/);
  assert.equal(failed.row("one").status, "failed"); assert.equal(failed.row("one").attempts, 1);
  assert.equal(failed.row("one").quotaReserved, false);
  await assert.rejects(withOrderQuota(failed.db, "user", "one", async (lease) => {
    await lease.beginMutation("creating"); throw new Error("lost response");
  }), /lost response/);
  assert.equal(failed.row("one").quotaReserved, true);
  await assert.rejects(withOrderQuota(failed.db, "user", "two", async () => { throw new Error("reservation overshoot"); }), QuotaReservationBusyError);
  assert.equal(failed.row("two").status, "pending", "temporary reservations keep waiting orders retryable");
  await withOrderQuota(failed.db, "user", "one", async (lease) => {
    assert.equal(lease.priorWriteState, "creating"); await lease.succeed("recovered");
  });
  assert.equal(failed.user().orderQuotaUsed, 20);
  await withOrderQuota(failed.db, "user", "one", async () => { throw new Error("double count"); });
  // A provider failure before a write frees capacity and remains safely retryable.
  const provider = memoryDatabase(); provider.add("provider");
  await assert.rejects(withOrderQuota(provider.db, "user", "provider", async () => {
    throw new Error("provider lookup failed before any write");
  }), /provider lookup failed/);
  assert.equal(provider.row("provider").quotaReserved, false);
  await withOrderQuota(provider.db, "user", "provider", async (lease) => {
    assert.equal(lease.priorWriteState, null);
    await lease.beginMutation("creating"); await lease.succeed("provider-retry");
  });
  assert.equal(provider.user().orderQuotaUsed, 20);

  // Remote success is outside the transaction; failure of the counter update
  // must roll back the success log, preserving the reservation for reconciliation.
  const finalize = memoryDatabase(); finalize.add("remote-success");
  const remoteReceipts = new Map<string, string>();
  let remoteCreates = 0;
  const syncRemote = () => withOrderQuota(finalize.db, "user", "remote-success", async (lease) => {
    let receipt = remoteReceipts.get("SS-order"); // Simulated stable DocNumber lookup.
    if (!receipt) {
      assert.equal(lease.priorWriteState, null);
      await lease.beginMutation("creating");
      remoteCreates++; receipt = "existing-receipt"; remoteReceipts.set("SS-order", receipt);
    }
    await lease.succeed(receipt);
  });
  finalize.failNextUserUpdate();
  await assert.rejects(syncRemote(), /injected finalization failure/);
  assert.equal(finalize.user().orderQuotaUsed, 19);
  assert.notEqual(finalize.row("remote-success").status, "success");
  assert.equal(finalize.row("remote-success").quotaReserved, true);
  assert.equal(finalize.row("remote-success").qboWriteState, "creating");
  await syncRemote(); await syncRemote();
  assert.equal(remoteCreates, 1); assert.equal(finalize.user().orderQuotaUsed, 20);
  assert.equal(finalize.row("remote-success").quotaReserved, false);

  // Reclaim a crashed reservation; no successful attempt may be overwritten.
  const reclaimed = memoryDatabase(); reclaimed.add("stale");
  Object.assign(reclaimed.row("stale"), { quotaReserved: true, syncLeaseToken: "dead-owner",
    syncLeaseExpiresAt: new Date(0), qboWriteState: "creating" });
  await withOrderQuota(reclaimed.db, "user", "stale", async (lease) => {
    assert.equal(lease.priorWriteState, "creating"); await lease.succeed("found-after-crash");
  });
  assert.equal(reclaimed.user().orderQuotaUsed, 20);

  // Renewal is actually concurrent with the remote operation, not just later.
  const renewal = memoryDatabase(99, "solo_100"); renewal.add("in-flight");
  let resume!: () => void; let started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const parked = new Promise<void>((resolve) => { resume = resolve; });
  const running = withOrderQuota(renewal.db, "user", "in-flight", async (lease) => {
    await lease.beginMutation("creating"); started(); await parked; await lease.succeed("after-renewal");
  });
  await ready;
  await renewal.db.$transaction(async (tx: any) => {
    await lockQuotaUser(tx, "user"); await tx.user.update({ data: { orderQuotaUsed: 0 } });
  });
  assert.equal(renewal.row("in-flight").quotaReserved, true);
  resume(); await running; assert.equal(renewal.user().orderQuotaUsed, 1);

  // Upgrade preserves usage and opens headroom; downgrade never resets usage.
  const change = memoryDatabase(100, "solo_100"); change.add("upgrade"); change.add("downgrade");
  await withOrderQuota(change.db, "user", "upgrade", async () => { throw new Error("old cap bypassed"); });
  await change.db.$transaction(async (tx: any) => {
    await lockQuotaUser(tx, "user"); await tx.user.update({ data: { planTier: "scale_250" } });
  });
  await withOrderQuota(change.db, "user", "upgrade", async (lease) => {
    await lease.beginMutation("creating"); await lease.succeed("upgraded");
  });
  assert.equal(change.user().orderQuotaUsed, 101);
  await change.db.$transaction(async (tx: any) => {
    await lockQuotaUser(tx, "user"); await tx.user.update({ data: { planTier: "solo_100" } });
  });
  await withOrderQuota(change.db, "user", "downgrade", async () => { throw new Error("downgraded cap bypassed"); });
  assert.equal(change.user().orderQuotaUsed, 101);
  assert.equal(change.row("downgrade").status, "skipped_quota_exceeded");
  console.log("Atomic quota model smoke passed: concurrent caps/duplicates, failed-write recovery, remote-success/DB-failure exactly-once finalization, stale reservations, in-flight renewal, and plan changes.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
