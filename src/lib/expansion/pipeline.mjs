/** A bounded, tenant-scoped local preview. Never opens a provider connection. */
import { EXPERIENCES } from './registry.mjs';
import { identifier, normalizeBatch } from './source-adapters/normalize.mjs';
import { evidenceToCandidate } from './source-adapters/candidate-bridge.mjs';
import { compileDestination, aggregatePreviews } from './accounting-acceptance/destination-preview.mjs';

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function compileExperiencePreview({ experienceId, scope, entries }) {
  const experience = EXPERIENCES.find(item => item.id === experienceId);
  if (!experience) fail('UNKNOWN_EXPERIENCE', 'Choose one of the 16 registered connection experiences.');
  identifier(scope?.merchantId, 'merchant');
  identifier(scope?.destinationTenantId, 'destination tenant');
  if (!scope?.sourceAccounts || typeof scope.sourceAccounts !== 'object' || Array.isArray(scope.sourceAccounts)) {
    fail('SOURCE_BINDING', 'Explicit source account bindings are required.');
  }
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 1000) {
    fail('BATCH_LIMIT', 'A preview requires 1 to 1000 complete evidence records.');
  }
  const sources = new Set();
  for (const entry of entries) {
    const row = entry?.evidence;
    const mapping = entry?.mapping;
    if (!row || !mapping || !entry.destinationContext) fail('MISSING_INPUT', 'Evidence, mapping and destination context are all required.');
    if (experience.source !== 'multichannel' && row.source !== experience.source) fail('SOURCE_MISMATCH', 'The evidence does not belong to this connection experience.');
    if (row.merchantId !== scope.merchantId || mapping.merchantId !== scope.merchantId) fail('MERCHANT_MISMATCH', 'A preview cannot combine different merchants.');
    if (!Object.hasOwn(scope.sourceAccounts, row.source) || scope.sourceAccounts[row.source] !== row.sourceAccountId) fail('SOURCE_BINDING', 'The evidence source account is not bound to this preview.');
    identifier(scope.sourceAccounts[row.source], 'source account');
    if (mapping.destination !== experience.destination || mapping.destinationTenantId !== scope.destinationTenantId || entry.destinationContext.tenantId !== scope.destinationTenantId) fail('DESTINATION_MISMATCH', 'Destination mappings must match the bound accounting tenant.');
    sources.add(row.source);
  }
  if (experience.source === 'multichannel' && sources.size < 2) fail('MULTICHANNEL_SOURCES', 'A multichannel preview requires at least two distinct sources.');
  // Validate the whole batch before producing any output. This catches competing
  // economic events as well as changed source payloads on a duplicate event ID.
  const normalized = normalizeBatch(entries.map(entry => entry.evidence));
  // Compile duplicate rows too: changed account mappings on an otherwise exact
  // source replay must fail instead of being silently discarded.
  const artifacts = entries.map(entry => compileDestination(evidenceToCandidate(entry.evidence, entry.mapping), entry.destinationContext));
  const aggregation = aggregatePreviews(artifacts);
  return freeze({
    experienceId, mode: 'local_preview_only', customerReady: false,
    providerAcceptanceTested: false, transportEnabled: false, remoteCalls: 0,
    sources: [...sources].sort(), inputRecords: entries.length,
    duplicateSourceRecords: normalized.duplicateKeys.length,
    uniqueEvents: aggregation.uniqueEvents, groups: aggregation.groups,
  });
}
