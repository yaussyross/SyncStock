CREATE TABLE "ComplianceRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "shopDomain" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "orderIds" JSONB,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "response" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ComplianceRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ComplianceRequest_requestId_key" ON "ComplianceRequest"("requestId");
CREATE INDEX "ComplianceRequest_userId_createdAt_idx" ON "ComplianceRequest"("userId", "createdAt");
ALTER TABLE "ComplianceRequest"
  ADD CONSTRAINT "ComplianceRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ShopTombstone" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "shopDomain" TEXT NOT NULL,
  "uninstalledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShopTombstone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopTombstone_shopDomain_key" ON "ShopTombstone"("shopDomain");
