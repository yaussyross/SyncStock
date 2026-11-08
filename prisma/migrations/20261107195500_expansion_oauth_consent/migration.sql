-- Isolated pending OAuth consent storage. This migration creates no grants,
-- credentials, provider connections, tokens or externally reachable endpoints.
CREATE TABLE "ExpansionOAuthConsent" (
  "stateHash" VARCHAR(64) NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpansionOAuthConsent_pkey" PRIMARY KEY ("stateHash"),
  CONSTRAINT "ExpansionOAuthConsent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ExpansionOAuthConsent_expiresAt_idx" ON "ExpansionOAuthConsent"("expiresAt");
CREATE INDEX "ExpansionOAuthConsent_tenantId_expiresAt_idx" ON "ExpansionOAuthConsent"("tenantId", "expiresAt");
REVOKE ALL PRIVILEGES ON TABLE "ExpansionOAuthConsent" FROM anon, authenticated;
