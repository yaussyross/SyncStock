import type { PrismaClient } from "@prisma/client";
import { isAuthVersion, MAX_AUTH_VERSION, revokeFirstPartySessions } from "./first-party-session.mjs";

// A request deadline is not cancellation. Bound pool acquisition and database
// work as well; callers must still treat timeout/connection loss as uncertain.
export async function revokeSessionsWithPrisma(client: PrismaClient, userId: string, expectedAuthVersion: number): Promise<boolean> {
  if (!isAuthVersion(expectedAuthVersion) || expectedAuthVersion === MAX_AUTH_VERSION) return false;
  return client.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '1000ms'`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '1500ms'`;
    return revokeFirstPartySessions(tx.user, userId, expectedAuthVersion);
  }, { maxWait: 1000, timeout: 2000 });
}
