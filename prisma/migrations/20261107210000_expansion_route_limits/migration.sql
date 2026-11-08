-- Staged only. No production route or limiter is enabled by this migration.
CREATE TABLE "ExpansionRouteLimit" (
  "tenantId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
  "windowEndsAt" TIMESTAMPTZ(3) NOT NULL,
  "usageCount" INTEGER NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ExpansionRouteLimit_pkey" PRIMARY KEY ("tenantId", "action"),
  CONSTRAINT "ExpansionRouteLimit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
REVOKE ALL PRIVILEGES ON TABLE "ExpansionRouteLimit" FROM anon, authenticated;
