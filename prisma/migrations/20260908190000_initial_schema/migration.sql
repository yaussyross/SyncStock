-- Original application tables, required before the incremental beta migrations.
CREATE TABLE "User" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "email" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "stripeCustomerId" TEXT,
 "planTier" TEXT NOT NULL DEFAULT 'trial',
 "orderQuotaUsed" INTEGER NOT NULL DEFAULT 0,
 "quotaResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "ShopifyConnection" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL,
 "shopDomain" TEXT NOT NULL, "accessToken" TEXT NOT NULL,
 "scope" TEXT NOT NULL, "webhookId" TEXT,
 "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ShopifyConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ShopifyConnection_userId_key" ON "ShopifyConnection"("userId");
CREATE UNIQUE INDEX "ShopifyConnection_shopDomain_key" ON "ShopifyConnection"("shopDomain");
CREATE TABLE "QboConnection" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL,
 "realmId" TEXT NOT NULL, "accessToken" TEXT NOT NULL,
 "refreshToken" TEXT NOT NULL, "tokenExpiry" TIMESTAMP(3) NOT NULL,
 "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "QboConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QboConnection_userId_key" ON "QboConnection"("userId");
CREATE TABLE "ProductMapping" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL,
 "shopifySku" TEXT NOT NULL, "shopifyTitle" TEXT,
 "qboItemId" TEXT NOT NULL, "qboItemName" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ProductMapping_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductMapping_userId_shopifySku_key" ON "ProductMapping"("userId", "shopifySku");
CREATE TABLE "SyncLog" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL,
 "shopifyOrderId" TEXT NOT NULL, "orderNumber" TEXT, "qboInvoiceId" TEXT,
 "status" TEXT NOT NULL, "errorMessage" TEXT,
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "SyncLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SyncLog_userId_status_idx" ON "SyncLog"("userId", "status");
CREATE UNIQUE INDEX "SyncLog_userId_shopifyOrderId_key" ON "SyncLog"("userId", "shopifyOrderId");
