import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getQuotaState } from "./quota";

// Longer than the worker's HTTP deadline. A replacement may only reconcile an
// uncertain remote write; expiry never releases a quota reservation.
export const SYNC_LEASE_MS = 3 * 60_000;
const transactionOptions = { maxWait: 10_000, timeout: 10_000, isolationLevel: "ReadCommitted" as const };

export class SyncLeaseLostError extends Error {
  constructor() { super("Another attempt owns this order sync; retry later."); }
}

export class QuotaReservationBusyError extends Error {
  constructor() { super("The remaining order allowance is reserved by another sync. Retry after it finishes."); }
}

/** Billing resets must acquire this same lock before comparing/updating usage. */
export async function lockQuotaUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
}

export async function withOrderQuota(
  database: PrismaClient,
  userId: string,
  shopifyOrderId: string,
  run: (lease: {
    priorWriteState: string | null;
    update: (data: Prisma.SyncLogUpdateInput) => Promise<void>;
    beginMutation: (state: "creating" | "rollback") => Promise<void>;
    clearMutation: () => Promise<void>;
    succeed: (qboInvoiceId: string) => Promise<void>;
  }) => Promise<void>,
) {
  const where = { userId_shopifyOrderId: { userId, shopifyOrderId } };
  const token = randomUUID();
  const claim = await database.$transaction(async (tx) => {
    await lockQuotaUser(tx, userId);
    const [user, log] = await Promise.all([
      tx.user.findUnique({ where: { id: userId } }),
      tx.syncLog.findUnique({ where }),
    ]);
    if (!user || !log) throw new Error("Order sync user or log not found");
    // A successful log is authoritative even if an old row lacks its QBO ID.
    if (log.status === "success") return null;
    if (log.syncLeaseToken && log.syncLeaseExpiresAt && log.syncLeaseExpiresAt > new Date()) {
      throw new SyncLeaseLostError();
    }
    if (!log.quotaReserved) {
      const reserved = await tx.syncLog.count({ where: { userId, quotaReserved: true } });
      if (!getQuotaState({ ...user, orderQuotaUsed: user.orderQuotaUsed + reserved }).allowed) {
        if (getQuotaState(user).allowed) {
          // Temporary reservations are not a consumed allowance. Keep this job
          // retryable so a mapping/provider failure can free the slot for it.
          throw new QuotaReservationBusyError();
        }
        await tx.syncLog.update({ where, data: {
          status: "skipped_quota_exceeded",
          errorMessage: "Sync paused: subscription or order allowance is unavailable.",
        } });
        return null;
      }
    }
    // Existing reservations may be reconciled after cancellation/period expiry:
    // their remote accounting effect might already exist and must be recorded.
    await tx.syncLog.update({ where, data: {
      quotaReserved: true, syncLeaseToken: token,
      syncLeaseExpiresAt: new Date(Date.now() + SYNC_LEASE_MS),
    } });
    return { priorWriteState: log.qboWriteState };
  }, transactionOptions);
  if (!claim) return;

  async function owned<T>(action: (tx: Prisma.TransactionClient) => Promise<T>) {
    return database.$transaction(async (tx) => {
      await lockQuotaUser(tx, userId);
      const log = await tx.syncLog.findUniqueOrThrow({ where });
      if (log.syncLeaseToken !== token || !log.syncLeaseExpiresAt || log.syncLeaseExpiresAt <= new Date()) {
        throw new SyncLeaseLostError();
      }
      await tx.syncLog.update({ where, data: { syncLeaseExpiresAt: new Date(Date.now() + SYNC_LEASE_MS) } });
      return action(tx);
    }, transactionOptions);
  }
  const update = async (data: Prisma.SyncLogUpdateInput) => {
    await owned((tx) => tx.syncLog.update({ where, data }));
  };
  try {
    await run({
      priorWriteState: claim.priorWriteState,
      update,
      beginMutation: async (state) => {
        await owned(async (tx) => {
          if (state === "creating") {
            // A reservation is not permission to create after cancellation,
            // expiry or downgrade. Existing remote receipts remain recoverable.
            const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
            const reserved = await tx.syncLog.count({ where: { userId, quotaReserved: true } });
            if (!getQuotaState({ ...user, orderQuotaUsed: user.orderQuotaUsed + reserved - 1 }).allowed) {
              throw new Error("Subscription or order allowance changed before QuickBooks creation. Retry after billing is restored.");
            }
          }
          await tx.syncLog.update({ where, data: { qboWriteState: state } });
        });
      },
      clearMutation: () => update({ qboWriteState: null }),
      succeed: async (qboInvoiceId) => {
        await owned(async (tx) => {
          await tx.syncLog.update({ where, data: {
            status: "success", qboInvoiceId, errorMessage: null,
            quotaReserved: false, qboWriteState: null,
            syncLeaseToken: null, syncLeaseExpiresAt: null,
          } });
          await tx.user.update({ where: { id: userId }, data: { orderQuotaUsed: { increment: 1 } } });
        });
      },
    });
  } finally {
    // Commit cleanup independently of the caller's retry exception. Never free
    // an uncertain write or overwrite a newer owner's result.
    await database.$transaction(async (tx) => {
      await lockQuotaUser(tx, userId);
      const log = await tx.syncLog.findUnique({ where });
      if (log?.syncLeaseToken !== token) return;
      await tx.syncLog.update({ where, data: {
        quotaReserved: Boolean(log.qboWriteState),
        syncLeaseToken: null, syncLeaseExpiresAt: null,
      } });
    }, transactionOptions);
  }
}
