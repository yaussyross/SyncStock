import type { PrismaClient } from '@prisma/client';
import { inspectExpansionDatabaseSecurity } from './database-security.mjs';

/** No cache: every invocation inspects the actual pooled connection's role.
 * SET LOCAL is transaction-scoped configuration, not a grant or data mutation.
 * Query timeout and pool/transaction deadlines bound database work. Exceptions
 * deliberately collapse to a fixed safe verdict without logging their contents.
 */
export function createPrismaDatabaseSecurityGate(db: Pick<PrismaClient, '$transaction'>) {
  return async (): Promise<boolean> => {
    try {
      return await db.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 1000');
        return inspectExpansionDatabaseSecurity((sql: string) => tx.$queryRawUnsafe(sql));
      }, { maxWait: 250, timeout: 1500 });
    } catch { return false; }
  };
}
