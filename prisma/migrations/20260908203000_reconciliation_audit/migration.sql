ALTER TABLE "SyncLog"
  ADD COLUMN "currency" TEXT,
  ADD COLUMN "shopifyTotal" TEXT,
  ADD COLUMN "qboDraftTotal" TEXT,
  ADD COLUMN "qboActualTotal" TEXT,
  ADD COLUMN "reconciliationDifference" TEXT;
