import { db } from '../db';
import { encrypt, decrypt } from '../crypto';
import { createTokenStore } from './token-store.mjs';
// Server-only adapter. No credentials, migrations or requests are created here.
export function createPrismaTokenStore() {
  return createTokenStore({client:db,encrypt,decrypt});
}
