import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { withOrderQuota, lockQuotaUser, SyncLeaseLostError, QuotaReservationBusyError } from "../src/lib/sync-quota";
import { PLAN_LIMITS } from "../src/lib/plans";

// Explicit isolated DB only. Never silently use app/production credentials.
const databaseUrl = process.env.QUOTA_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Set QUOTA_TEST_DATABASE_URL to an isolated local PostgreSQL database with migrations applied.");
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "::1", "[::1]", "postgres"].includes(url.hostname)) {
  throw new Error("Quota smoke refuses non-local/non-CI PostgreSQL hosts.");
}
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const users: string[] = [];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function fixture(tier = "trial", used = 19) {
  const id = `quota-smoke-${randomUUID()}`;
  await db.user.create({ data: { id, email: `${id}@example.invalid`, planTier: tier,
    subscriptionStatus: tier === "trial" ? "trial" : "active", orderQuotaUsed: used,
    quotaPeriodEnd: new Date(Date.now() + 86_400_000),
  } });
  users.push(id);
  return id;
}
async function log(userId: string, shopifyOrderId: string) {
  return db.syncLog.create({ data: { userId, shopifyOrderId, status: "pending" } });
}
const read = (userId: string, shopifyOrderId: string) => db.syncLog.findUniqueOrThrow({
  where: { userId_shopifyOrderId: { userId, shopifyOrderId } },
});
async function main() {
  for (const tier of ["trial", "solo_100", "scale_250", "empire_1000", "starter", "growth"]) {
    const limit = PLAN_LIMITS[tier];
    assert(Number.isFinite(limit), `Missing finite plan ${tier}`);
    const user = await fixture(tier, limit - 1);
    await Promise.all(Array.from({ length: 8 }, (_, i) => log(user, String(i))));
    let created = 0;
    const capResults = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => withOrderQuota(db, user, String(i), async (lease) => {
      created++;
      await lease.beginMutation("creating");
      await wait(30);
      await lease.succeed(`receipt-${i}`);
    })));
    for (const result of capResults) if (result.status === "rejected") assert(result.reason instanceof QuotaReservationBusyError);
    assert.equal(created, 1, `${tier}: exactly one remote write at last slot`);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user } })).orderQuotaUsed, limit);
    assert.equal(await db.syncLog.count({ where: { userId: user, status: "success" } }), 1);
  }

  const duplicate = await fixture();
  await log(duplicate, "same");
  let creates = 0;
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => withOrderQuota(db, duplicate, "same", async (lease) => {
    creates++;
    await wait(40);
    await lease.succeed("one");
  })));
  assert.equal(creates, 1);
  for (const result of results) if (result.status === "rejected") assert(result.reason instanceof SyncLeaseLostError);
  await withOrderQuota(db, duplicate, "same", async () => { throw new Error("Successful order ran twice"); });
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: duplicate } })).orderQuotaUsed, 20);

  const failure = await fixture();
  await log(failure, "fails");
  await assert.rejects(withOrderQuota(db, failure, "fails", async (lease) => {
    await lease.update({ status: "failed", errorMessage: "simulated error", attempts: { increment: 1 } });
    throw new Error("simulated error");
  }), /simulated error/);
  assert.equal((await read(failure, "fails")).quotaReserved, false);
  assert.equal((await read(failure, "fails")).attempts, 1, "retry error log committed");

  await withOrderQuota(db, failure, "fails", async (lease) => {
    assert.equal(lease.priorWriteState, null, "no-write provider failure permits a fresh retry");
    await lease.beginMutation("creating"); await lease.succeed("provider-retry");
  });
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: failure } })).orderQuotaUsed, 20);

  const finalization = await fixture();
  await log(finalization, "remote-success");
  let injectFailure = true;
  const faultingDb = {
    $transaction: (callback: any, options: any) => db.$transaction(async (tx) => {
      const wrapped = new Proxy(tx, { get(target, prop) {
        if (prop !== "user") return Reflect.get(target, prop);
        return new Proxy(tx.user, { get(delegate, key) {
          if (key !== "update") return Reflect.get(delegate, key);
          return async (args: any) => {
            if (injectFailure && args.data.orderQuotaUsed?.increment) {
              injectFailure = false; throw new Error("injected finalization failure");
            }
            return tx.user.update(args);
          };
        } });
      } });
      return callback(wrapped);
    }, options),
  } as unknown as PrismaClient;
  const remoteReceipts = new Map<string, string>();
  let remoteCreates = 0;
  const attempt = () => withOrderQuota(faultingDb, finalization, "remote-success", async (lease) => {
    let receipt = remoteReceipts.get("SS-order");
    if (!receipt) {
      assert.equal(lease.priorWriteState, null);
      await lease.beginMutation("creating");
      remoteCreates++; receipt = "receipt-already-in-qbo"; remoteReceipts.set("SS-order", receipt);
    }
    await lease.succeed(receipt);
  });
  await assert.rejects(attempt(), /injected finalization failure/);
  const rolledBack = await read(finalization, "remote-success");
  assert.notEqual(rolledBack.status, "success");
  assert.equal(rolledBack.quotaReserved, true); assert.equal(rolledBack.qboWriteState, "creating");
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: finalization } })).orderQuotaUsed, 19);
  await attempt(); await attempt();
  assert.equal(remoteCreates, 1);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: finalization } })).orderQuotaUsed, 20);

  const uncertain = await fixture();
  await log(uncertain, "uncertain");
  await log(uncertain, "next");
  await assert.rejects(withOrderQuota(db, uncertain, "uncertain", async (lease) => {
    await lease.beginMutation("creating");
    throw new Error("remote response lost");
  }), /remote response lost/);
  assert.equal((await read(uncertain, "uncertain")).quotaReserved, true);
  await assert.rejects(withOrderQuota(db, uncertain, "next", async () => { throw new Error("Ambiguous write lost its slot"); }), QuotaReservationBusyError);
  await withOrderQuota(db, uncertain, "uncertain", async (lease) => {
    assert.equal(lease.priorWriteState, "creating");
    await lease.succeed("receipt-recovered-by-docnumber");
  });
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: uncertain } })).orderQuotaUsed, 20);

  const renewal = await fixture("solo_100", 99);
  await log(renewal, "held");
  await assert.rejects(withOrderQuota(db, renewal, "held", async (lease) => {
    await lease.beginMutation("creating");
    throw new Error("crash");
  }), /crash/);
  await db.$transaction(async (tx) => {
    await lockQuotaUser(tx, renewal);
    await tx.user.update({ where: { id: renewal }, data: { orderQuotaUsed: 0 } });
  });
  assert.equal((await read(renewal, "held")).quotaReserved, true, "renewal preserved in-flight reservation");
  await withOrderQuota(db, renewal, "held", async (lease) => lease.succeed("after-renewal"));
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: renewal } })).orderQuotaUsed, 1);

  const expired = await fixture();
  await log(expired, "stale");
  let resume!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const parked = new Promise<void>((resolve) => { resume = resolve; });
  const old = withOrderQuota(db, expired, "stale", async (lease) => {
    started(); await parked; await lease.beginMutation("creating");
  });
  await ready;
  await db.syncLog.update({ where: { userId_shopifyOrderId: { userId: expired, shopifyOrderId: "stale" } },
    data: { syncLeaseExpiresAt: new Date(0) } });
  await withOrderQuota(db, expired, "stale", async (lease) => lease.succeed("new-owner"));
  resume();
  await assert.rejects(old, SyncLeaseLostError);
  assert.equal((await read(expired, "stale")).status, "success", "stale cleanup did not overwrite newer success");

  console.log("Atomic sync quota DB smoke passed: exact caps, duplicate jobs, error commits, uncertain writes, renewal carry-forward, stale-owner fencing.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  // Delete only this run's random fixtures, never truncate shared tables.
  await db.syncLog.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});
