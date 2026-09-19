ALTER TABLE "ShopifyConnection"
  ADD COLUMN "refreshToken" TEXT,
  ADD COLUMN "accessTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "refreshTokenExpiresAt" TIMESTAMP(3);
