-- Staged only; no provider calls, credentials, or live enablement.
ALTER TABLE "ExpansionOAuthGrant"
  ADD COLUMN "disconnectOutcome" TEXT,
  ADD COLUMN "disconnectAccountId" TEXT,
  ADD COLUMN "disconnectConnectionId" TEXT,
  ADD COLUMN "disconnectAttemptHash" VARCHAR(64),
  ADD COLUMN "disconnectStartedAt" TIMESTAMP(3),
  ADD CONSTRAINT "ExpansionOAuthGrant_disconnect_check" CHECK (
    ("disconnectOutcome" IS NULL AND "disconnectAccountId" IS NULL AND "disconnectConnectionId" IS NULL AND "disconnectAttemptHash" IS NULL AND "disconnectStartedAt" IS NULL)
    OR ("disconnectOutcome" IS NOT NULL AND "disconnectOutcome" IN ('local_only','outcome_unknown','disconnected') AND "status" = 'revoked' AND "ciphertext" IS NULL
      AND "provider" = 'xero' AND "environment" = 'production'
      AND "providerAccountId" IS NULL AND "providerConnectionId" IS NULL AND "accountBindingKey" IS NULL AND "accountVerifiedAt" IS NULL
      AND "claimHash" IS NULL AND "claimStartedAt" IS NULL
      AND "disconnectAttemptHash" IS NOT NULL AND "disconnectStartedAt" IS NOT NULL
      AND ("disconnectOutcome" = 'local_only' OR ("disconnectAccountId" IS NOT NULL AND "disconnectConnectionId" IS NOT NULL)))
  );
