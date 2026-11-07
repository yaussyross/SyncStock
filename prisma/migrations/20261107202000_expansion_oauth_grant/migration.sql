-- Staged only. Stores encrypted grants and durable refresh claims, never plaintext tokens.
CREATE TABLE "ExpansionOAuthGrant" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "authorizationBinding" VARCHAR(64) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'available',
  "ciphertext" TEXT,
  "refreshFingerprint" VARCHAR(64) NOT NULL,
  "initialGrantFingerprint" VARCHAR(64) NOT NULL,
  "claimHash" VARCHAR(64),
  "claimStartedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExpansionOAuthGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpansionOAuthGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ExpansionOAuthGrant_tenantId_status_idx" ON "ExpansionOAuthGrant"("tenantId", "status");
CREATE INDEX "ExpansionOAuthGrant_status_claimStartedAt_idx" ON "ExpansionOAuthGrant"("status", "claimStartedAt");
REVOKE ALL PRIVILEGES ON TABLE "ExpansionOAuthGrant" FROM anon, authenticated;
CREATE UNIQUE INDEX "ExpansionOAuthGrant_refreshFingerprint_key" ON "ExpansionOAuthGrant"("refreshFingerprint");
CREATE UNIQUE INDEX "ExpansionOAuthGrant_initialGrantFingerprint_key" ON "ExpansionOAuthGrant"("initialGrantFingerprint");
