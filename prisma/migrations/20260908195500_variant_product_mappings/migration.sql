-- Migrate product mappings from SKU identity to Shopify variant identity.
-- Existing pre-beta rows are preserved with a legacy synthetic variant key and
-- continue to work through SKU fallback until the merchant re-saves them.

ALTER TABLE "ProductMapping"
ADD COLUMN "shopifyVariantId" TEXT;

UPDATE "ProductMapping"
SET "shopifyVariantId" = 'legacy:' || "id";

ALTER TABLE "ProductMapping"
ALTER COLUMN "shopifyVariantId" SET NOT NULL,
ALTER COLUMN "shopifySku" DROP NOT NULL;

ALTER TABLE "ProductMapping"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DROP INDEX IF EXISTS "ProductMapping_userId_shopifySku_key";

CREATE UNIQUE INDEX "ProductMapping_userId_shopifyVariantId_key"
ON "ProductMapping"("userId", "shopifyVariantId");

CREATE INDEX "ProductMapping_userId_shopifySku_idx"
ON "ProductMapping"("userId", "shopifySku");
