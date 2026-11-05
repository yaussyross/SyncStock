ALTER TABLE "SyncLog"
  ADD COLUMN "quotaReserved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "syncLeaseToken" TEXT,
  ADD COLUMN "syncLeaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "qboWriteState" TEXT;
CREATE INDEX "SyncLog_userId_quotaReserved_idx" ON "SyncLog"("userId", "quotaReserved");

ALTER TABLE "User" ADD COLUMN "shopifyBillingCheckedAt" TIMESTAMP(3);
