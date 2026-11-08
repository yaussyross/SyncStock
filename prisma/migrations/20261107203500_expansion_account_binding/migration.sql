-- Staged only. No provider identities or connections are created by migration.
ALTER TABLE "ExpansionOAuthGrant"
  ADD COLUMN "providerAccountId" TEXT,
  ADD COLUMN "providerConnectionId" TEXT,
  ADD COLUMN "accountVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "accountBindingKey" VARCHAR(64);
CREATE UNIQUE INDEX "ExpansionOAuthGrant_accountBindingKey_key" ON "ExpansionOAuthGrant"("accountBindingKey");
