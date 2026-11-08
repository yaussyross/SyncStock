import { createExpansionRoutes } from './route-service.mjs';

// Importing a disabled route must not initialize Prisma, Redis or encryption,
// inspect a credential, perform a query, or contact a provider.
export function expansionRoutes() {
  return createExpansionRoutes({
    env: process.env,
    verifyDatabaseSecurity: async () => {
      const [{db},{createPrismaDatabaseSecurityGate}]=await Promise.all([import('../db'),import('./prisma-database-security')]);
      return createPrismaDatabaseSecurityGate(db)();
    },
    rateLimit: async (action: string,tenantId: string) => {
      const [{db},{createPrismaRouteLimiter}]=await Promise.all([import('../db'),import('./prisma-route-limiter')]);
      return createPrismaRouteLimiter(db)(action,tenantId);
    },
    findUser: async (id: string) => {
      const { db } = await import('../db');
      return db.user.findUnique({ where: { id }, select: { id: true, authVersion: true } });
    },
    loadStores: async (tenantId: string) => {
      const [{ db }, { createPrismaConsentStore }, { createPrismaTokenStore }] = await Promise.all([
        import('../db'), import('./prisma-consent-store'), import('./prisma-token-store'),
      ]);
      // Selecting all modeled scalar fields checks both tables/columns before
      // consuming a one-time state or attempting any external token exchange.
      // Empty tables still force schema validation. Rows are discarded unlogged.
      await Promise.all([
        db.expansionOAuthConsent.findFirst({ where: { tenantId } }),
        db.expansionOAuthGrant.findFirst({ where: { tenantId } }),
      ]);
      return { consentStore: createPrismaConsentStore(), tokenStore: createPrismaTokenStore() };
    },
    listAccounts: async (...args: Parameters<typeof import('./account-binding.mjs').listConnectionAccounts>) => {
      const { listConnectionAccounts } = await import('./account-binding.mjs');
      return listConnectionAccounts(...args);
    },
    disconnect: async (...args: Parameters<typeof import('./disconnect-connection.mjs').disconnectConnection>) => {
      const { disconnectConnection } = await import('./disconnect-connection.mjs');
      return disconnectConnection(...args);
    },
    bindAccount: async (...args: Parameters<typeof import('./account-binding.mjs').bindConnectionAccount>) => {
      const { bindConnectionAccount } = await import('./account-binding.mjs');
      return bindConnectionAccount(...args);
    },
  });
}
