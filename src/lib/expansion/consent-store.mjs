/** Shared single-use consent storage. The production wrapper supplies Prisma and
 * authenticated encryption. No provider tokens, sessions or raw state are stored.
 */
export class ConsentStoreError extends Error {
  constructor(code, message) { super(message); this.name = 'ConsentStoreError'; this.code = code; }
}
const fail = (code, message) => { throw new ConsentStoreError(code, message); };
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value);
const providers = new Set(['amazon','shopify','ebay','etsy','walmart','tiktok_shop','paypal','qbo','xero']);

function recordData(record) {
  if (!record || !providers.has(record.provider) || !['sandbox','production'].includes(record.environment) || !id(record.tenantId) || !hash(record.sessionHash) || typeof record.verifier !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(record.verifier)) fail('INVALID_RECORD', 'Invalid pending consent record.');
  if (record.authorizationBinding !== undefined && !hash(record.authorizationBinding)) fail('INVALID_RECORD', 'Invalid authorization configuration binding.');
  let callback;
  try { callback = new URL(record.callback); } catch { fail('INVALID_RECORD', 'Invalid consent callback.'); }
  if (callback.protocol !== 'https:' || callback.username || callback.password || callback.search || callback.hash || callback.href !== record.callback || callback.href.length > 2048) fail('INVALID_RECORD', 'Invalid consent callback.');
  if (!Number.isSafeInteger(record.issuedAt) || !Number.isSafeInteger(record.expiresAt) || record.issuedAt < 0 || record.expiresAt - record.issuedAt < 1000 || record.expiresAt - record.issuedAt > 600000) fail('INVALID_RECORD', 'Invalid consent lifetime.');
  return { provider: record.provider, environment: record.environment, tenantId: record.tenantId, sessionHash: record.sessionHash, callback: record.callback, issuedAt: record.issuedAt, expiresAt: record.expiresAt, verifier: record.verifier, ...(record.authorizationBinding === undefined ? {} : { authorizationBinding: record.authorizationBinding }) };
}

export function createConsentStore({ client, encrypt, decrypt, clock = Date.now }) {
  const table = client?.expansionOAuthConsent;
  if (!table || ['create','delete','findMany','deleteMany'].some(name => typeof table[name] !== 'function') || typeof encrypt !== 'function' || typeof decrypt !== 'function' || typeof clock !== 'function') fail('STORE_CONFIGURATION', 'A shared database and authenticated encryption are required.');
  const now = () => { const value = clock(); if (!Number.isSafeInteger(value) || value < 0) fail('INVALID_CLOCK', 'Invalid consent-store clock.'); return value; };
  return Object.freeze({
    async insert(stateHash, input) {
      if (!hash(stateHash)) fail('INVALID_STATE_HASH', 'A hashed consent state is required.');
      // Copy before the first await so callers cannot mutate stored bindings.
      const record = recordData(input), current = now();
      if (record.issuedAt > current || record.expiresAt <= current) fail('EXPIRED_RECORD', 'Pending consent is not within its validity window.');
      const plaintext = JSON.stringify({ version: 1, stateHash, record });
      let ciphertext;
      try { ciphertext = encrypt(plaintext); } catch { fail('ENCRYPTION_FAILED', 'Pending consent could not be encrypted.'); }
      if (typeof ciphertext !== 'string' || !ciphertext.startsWith('v2:') || ciphertext.length > 16384 || ciphertext.includes(record.verifier)) fail('ENCRYPTION_FAILED', 'Pending consent requires authenticated encryption.');
      try { await table.create({ data: { stateHash, tenantId: record.tenantId, ciphertext, expiresAt: new Date(record.expiresAt) } }); }
      catch (error) {
        if (error?.code === 'P2002') fail('STATE_EXISTS', 'Pending consent state already exists.');
        fail('STORE_UNAVAILABLE', 'Pending consent could not be stored.');
      }
    },
    async take(stateHash) {
      if (!hash(stateHash)) fail('INVALID_STATE_HASH', 'A hashed consent state is required.');
      let row;
      // Prisma's primary-key delete is an atomic DELETE ... RETURNING. Exactly
      // one independent caller can receive a record; losers receive P2025.
      try { row = await table.delete({ where: { stateHash } }); }
      catch (error) {
        if (error?.code === 'P2025') return null;
        fail('STORE_UNAVAILABLE', 'Pending consent could not be consumed.');
      }
      const current = now(), expiry = new Date(row.expiresAt).valueOf();
      if (!Number.isFinite(expiry) || expiry <= current) return null;
      let envelope, record;
      try { envelope = JSON.parse(decrypt(row.ciphertext)); record = recordData(envelope.record); }
      catch { fail('INVALID_STORED_RECORD', 'Pending consent could not be verified.'); }
      // Bind encrypted data to its database key, owner and expiry to reject
      // swapped ciphertext or tampered database metadata. The row is already
      // consumed on any error and can never authorize a retry.
      if (envelope.version !== 1 || envelope.stateHash !== stateHash || row.stateHash !== stateHash || record.tenantId !== row.tenantId || record.expiresAt !== expiry || record.issuedAt > current) fail('INVALID_STORED_RECORD', 'Pending consent storage binding changed.');
      return record;
    },
    async cleanupExpired(limit = 1000) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) fail('INVALID_LIMIT', 'Clean up at most 1000 expired records at a time.');
      const cutoff = new Date(now());
      try {
        const rows = await table.findMany({ where: { expiresAt: { lte: cutoff } }, select: { stateHash: true }, orderBy: [{ expiresAt: 'asc' }, { stateHash: 'asc' }], take: limit });
        if (!rows.length) return 0;
        return (await table.deleteMany({ where: { stateHash: { in: rows.map(row => row.stateHash) }, expiresAt: { lte: cutoff } } })).count;
      } catch { fail('STORE_UNAVAILABLE', 'Expired consent cleanup could not complete.'); }
    },
    async revokeTenant(tenantId) {
      if (!id(tenantId)) fail('INVALID_TENANT', 'An explicit tenant is required.');
      try { return (await table.deleteMany({ where: { tenantId } })).count; }
      catch { fail('STORE_UNAVAILABLE', 'Pending tenant consents could not be revoked.'); }
    },
  });
}
