-- Secure authentication fields
ALTER TABLE "User"
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "stripeSubscriptionId" TEXT,
  ADD COLUMN "subscriptionStatus" TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN "quotaPeriodStart" TIMESTAMP(3),
  ADD COLUMN "quotaPeriodEnd" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_stripeSubscriptionId_key" ON "User"("stripeSubscriptionId");

-- Store Shopify lifecycle webhook subscription ids so reconnects and cleanup stay auditable.
ALTER TABLE "ShopifyConnection"
  ADD COLUMN "refundWebhookId" TEXT,
  ADD COLUMN "cancelledWebhookId" TEXT,
  ADD COLUMN "uninstallWebhookId" TEXT;

-- Refunds and cancellations are captured separately from successful paid-order syncs.
CREATE TABLE "OrderAdjustment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "shopifyOrderId" TEXT NOT NULL,
  "orderNumber" TEXT,
  "shopifyEventId" TEXT,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'needs_review',
  "amount" TEXT,
  "currency" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderAdjustment_userId_status_idx" ON "OrderAdjustment"("userId", "status");
CREATE INDEX "OrderAdjustment_userId_shopifyOrderId_idx" ON "OrderAdjustment"("userId", "shopifyOrderId");
CREATE UNIQUE INDEX "OrderAdjustment_userId_shopifyEventId_kind_key"
  ON "OrderAdjustment"("userId", "shopifyEventId", "kind");

ALTER TABLE "OrderAdjustment"
  ADD CONSTRAINT "OrderAdjustment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
