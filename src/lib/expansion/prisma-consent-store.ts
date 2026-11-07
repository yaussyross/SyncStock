import { db } from '../db';
import { encrypt, decrypt } from '../crypto';
import { createConsentStore } from './consent-store.mjs';

// Server-side use only. Callers supply authenticated User.id as tenantId.
// Creating this adapter performs no query, grant, connection or token exchange.
export function createPrismaConsentStore() {
  return createConsentStore({ client: db, encrypt, decrypt });
}
