import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createConsentStore } from '../src/lib/expansion/consent-store.mjs';
import { beginConsent, consumeConsent } from '../src/lib/expansion/oauth-guard.mjs';

async function main() {
  // Never fall back to application credentials or a production database.
  const url = process.env.SYNCSTOCK_EXPANSION_TEST_DATABASE_URL;
  assert.ok(url, 'Set SYNCSTOCK_EXPANSION_TEST_DATABASE_URL to a disposable migrated local database');
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname), 'Requires a local test database');
  process.env.ENCRYPTION_KEY = 'synthetic-consent-test-encryption-key-only';
  const { encrypt, decrypt } = await import('../src/lib/crypto');
  const one = new PrismaClient({ datasources: { db: { url } } });
  const two = new PrismaClient({ datasources: { db: { url } } });
  const prefix = `consent-test-${randomUUID()}`;
  const userIds: string[] = [];
  const callback = 'https://example.invalid/xero/callback';
  const storeOne = createConsentStore({ client: one, encrypt, decrypt });
  const storeTwo = createConsentStore({ client: two, encrypt, decrypt });
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  let groups = 0;
  try {
    const owner = await one.user.create({ data: { email: `${prefix}@example.invalid` } });
    const other = await one.user.create({ data: { email: `${prefix}-other@example.invalid` } });
    userIds.push(owner.id, other.id);
    const context = { provider: 'xero', environment: 'production', tenantId: owner.id, sessionId: 'synthetic-session' };
    const start = () => beginConsent(context, { store: storeOne, allowedCallbacks: [callback], callbackUrl: callback });
    const args = (state: string) => ({ state, context, callbackUrl: callback, authorizationCode: 'SYNTHETIC-NOT-A-PROVIDER-CODE' });
    const consume = (state: string, store = storeTwo) => consumeConsent(args(state), { store, allowedCallbacks: [callback] });

    const first = await start();
    const saved = await one.expansionOAuthConsent.findUniqueOrThrow({ where: { stateHash: hash(first.state) } });
    assert.ok(saved.ciphertext.startsWith('v2:'));
    assert.equal(saved.ciphertext.includes(first.state), false);
    assert.equal(saved.ciphertext.includes(context.sessionId), false);
    const consumed = await consume(first.state);
    assert.equal(saved.ciphertext.includes(consumed.verifier), false);
    assert.equal(consumed.tenantId, owner.id);
    await assert.rejects(() => consume(first.state)); groups++;

    const concurrent = await start();
    const races = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => consume(concurrent.state, i % 2 ? storeOne : storeTwo)));
    assert.equal(races.filter(result => result.status === 'fulfilled').length, 1, 'Exactly one independent client must consume state'); groups++;
    for (const result of races) if (result.status === 'rejected') assert.match(String(result.reason?.message), /Consent state missing or already used/, 'Race losers must be consumed-state misses, not infrastructure errors');

    const duplicate = await start();
    const duplicateRow = await one.expansionOAuthConsent.findUniqueOrThrow({ where: { stateHash: hash(duplicate.state) } });
    await assert.rejects(() => one.expansionOAuthConsent.create({ data: { stateHash: duplicateRow.stateHash, tenantId: owner.id, ciphertext: duplicateRow.ciphertext, expiresAt: duplicateRow.expiresAt } }));
    await consume(duplicate.state); groups++;

    const wrongOwner = await start();
    await assert.rejects(() => consumeConsent({ ...args(wrongOwner.state), context: { ...context, tenantId: other.id } }, { store: storeTwo, allowedCallbacks: [callback] }));
    await assert.rejects(() => consume(wrongOwner.state)); groups++;

    const tampered = await start();
    await one.expansionOAuthConsent.update({ where: { stateHash: hash(tampered.state) }, data: { tenantId: other.id } });
    await assert.rejects(() => consume(tampered.state));
    assert.equal(await one.expansionOAuthConsent.count({ where: { stateHash: hash(tampered.state) } }), 0); groups++;

    const expired = await start();
    await one.expansionOAuthConsent.update({ where: { stateHash: hash(expired.state) }, data: { expiresAt: new Date(Date.now() - 1) } });
    assert.equal(await storeTwo.take(hash(expired.state)), null); groups++;

    for (let i = 0; i < 3; i++) { const value = await start(); await one.expansionOAuthConsent.update({ where: { stateHash: hash(value.state) }, data: { expiresAt: new Date(Date.now() - 1000) } }); }
    const active = await start();
    assert.equal(await storeTwo.cleanupExpired(2), 2); assert.equal(await storeTwo.cleanupExpired(2), 1);
    assert.ok(await consume(active.state)); groups++;

    const pending = await start();
    const unrelated = await beginConsent({ ...context, tenantId: other.id }, { store: storeOne, allowedCallbacks: [callback], callbackUrl: callback });
    assert.equal(await storeTwo.revokeTenant(owner.id), 1);
    assert.equal(await one.expansionOAuthConsent.count({ where: { stateHash: hash(pending.state) } }), 0);
    assert.equal(await one.expansionOAuthConsent.count({ where: { stateHash: hash(unrelated.state) } }), 1); groups++;

    await start();
    await one.user.delete({ where: { id: owner.id } });
    assert.equal(await two.expansionOAuthConsent.count({ where: { tenantId: owner.id } }), 0, 'Tenant deletion cascades pending consent cleanup');
    assert.equal(await two.expansionOAuthConsent.count({ where: { tenantId: other.id } }), 1); groups++;

    const orphanState = 'd'.repeat(64);
    await assert.rejects(() => one.expansionOAuthConsent.create({ data: { stateHash: orphanState, tenantId: 'nonexistent-user', ciphertext: 'synthetic', expiresAt: new Date(Date.now() + 1000) } })); groups++;
    console.log(`Expansion consent PostgreSQL checks passed: ${groups} groups, separate-client race, encrypted state, tenant isolation and deletion cascade.`);
  } finally {
    await one.user.deleteMany({ where: { id: { in: userIds } } });
    await Promise.all([one.$disconnect(), two.$disconnect()]);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
