CREATE TABLE "AccountingSettings" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "shippingQboItemId" TEXT,
  "shippingQboItemName" TEXT,
  "tipsQboItemId" TEXT,
  "tipsQboItemName" TEXT,
  "dutiesQboItemId" TEXT,
  "dutiesQboItemName" TEXT,
  "additionalFeeQboItemId" TEXT,
  "additionalFeeQboItemName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingSettings_userId_key" ON "AccountingSettings"("userId");

ALTER TABLE "AccountingSettings"
  ADD CONSTRAINT "AccountingSettings_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
