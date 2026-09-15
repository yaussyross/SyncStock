CREATE TABLE IF NOT EXISTS "Feedback" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'feedback',
  "rating" INTEGER,
  "message" TEXT NOT NULL,
  "page" TEXT,
  "status" TEXT NOT NULL DEFAULT 'new',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Feedback_rating_check" CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 5))
);

CREATE INDEX IF NOT EXISTS "Feedback_userId_createdAt_idx" ON "Feedback"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");

REVOKE ALL PRIVILEGES ON TABLE "Feedback" FROM anon, authenticated;
