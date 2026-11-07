import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPERIENCES, SOURCES } from '../../src/lib/expansion/registry.mjs';
import { compileExperiencePreview } from '../../src/lib/expansion/pipeline.mjs';
import { evidence, mapping } from '../../src/lib/expansion/source-adapters/fixtures.mjs';
import { syntheticDestinationContext } from '../../src/lib/expansion/accounting-acceptance/fixtures.mjs';
import { evidenceToCandidate } from '../../src/lib/expansion/source-adapters/candidate-bridge.mjs';
function input(source = 'ebay', destination = 'qbo') {
  const sources = source === 'multichannel' ? SOURCES : [source];
  return { experienceId: `${source}-${destination}`, scope: { merchantId: 'fictional-merchant', destinationTenantId: `fictional-${destination}`, sourceAccounts: Object.fromEntries(sources.map(s => [s, `fictional-${s}`])) }, entries: sources.map(s => {
    const e = evidence(s), m = mapping(s, destination), candidate = evidenceToCandidate(e, m);
    return { evidence: e, mapping: m, destinationContext: syntheticDestinationContext(candidate) };
  }) };
}
for (const experience of EXPERIENCES) test('one local pipeline: ' + experience.id, () => {
  const result = compileExperiencePreview(input(experience.source, experience.destination));
  assert.equal(result.uniqueEvents, experience.source === 'multichannel' ? 7 : 1);
  assert.equal(result.customerReady, false); assert.equal(result.transportEnabled, false); assert.equal(result.remoteCalls, 0);
  assert.equal(Object.isFrozen(result.groups), true);
});
test('same source replay deduplicates after checking all mappings', () => {
  const value = input(); value.entries.push(structuredClone(value.entries[0]));
  const result = compileExperiencePreview(value); assert.equal(result.uniqueEvents, 1); assert.equal(result.duplicateSourceRecords, 1);
});
test('changed mapping on source replay is held', () => {
  const value = input(); value.entries.push(structuredClone(value.entries[0]));
  value.entries[1].mapping.lines[0].accountId = 'other-account';
  value.entries[1].destinationContext.accounts[0].id = 'other-account';
  assert.throws(() => compileExperiencePreview(value), error => error.code === 'EVENT_PAYLOAD_CONFLICT');
});
for (const field of ['merchant', 'source-account', 'destination', 'source']) test('pipeline isolates ' + field, () => {
  const value = input();
  if (field === 'merchant') value.entries[0].evidence.merchantId = 'other';
  if (field === 'source-account') value.entries[0].evidence.sourceAccountId = 'other';
  if (field === 'destination') value.entries[0].destinationContext.tenantId = 'other';
  if (field === 'source') value.entries[0].evidence.source = 'paypal';
  assert.throws(() => compileExperiencePreview(value));
});
test('multichannel requires at least two actual providers', () => {
  const value = input(); value.experienceId = 'multichannel-qbo';
  assert.throws(() => compileExperiencePreview(value), error => error.code === 'MULTICHANNEL_SOURCES');
});
test('one bad record rejects the entire batch', () => {
  const value = input('multichannel'); value.entries[6].evidence.reportComplete = false;
  assert.throws(() => compileExperiencePreview(value), error => error.code === 'INCOMPLETE_EVIDENCE');
});
test('cross-provider economic overlap is held', () => {
  const value = input('multichannel'); value.entries[1].evidence.economicEventId = value.entries[0].evidence.economicEventId;
  assert.throws(() => compileExperiencePreview(value), error => error.code === 'ECONOMIC_OVERLAP');
});
