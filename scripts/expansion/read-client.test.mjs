import test from 'node:test';
import assert from 'node:assert/strict';
import { readProviderPages } from '../../src/lib/expansion/read-client.mjs';
const request = () => ({ provider: 'ebay', environment: 'sandbox', tenantId: 'tenant-1', boundTenantId: 'tenant-1', accountId: 'seller-1', boundAccountId: 'seller-1', url: 'https://api.sandbox.ebay.com/sell/fulfillment/v1/order?limit=2&offset=0' });
const credential = () => ({ provider: 'ebay', environment: 'sandbox', tenantId: 'tenant-1', accountId: 'seller-1', accessToken: 'FICTIONAL-NOT-A-PROVIDER-TOKEN' });
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const options = (patch = {}) => ({ credential: credential(), decodePage: data => data, fetchImpl: async () => json({ records: [{ id: 1 }], nextUrl: null }), ...patch });
const code = expected => error => error.code === expected;

test('bound GET read sends auth only in headers and reports explicit nonfinancial completeness', async () => {
  let captured;
  const result = await readProviderPages(request(), options({ fetchImpl: async (url, init) => { captured = { url, init }; return json({ records: [{ id: 1 }], nextUrl: null }); } }));
  assert.equal(captured.init.method, 'GET'); assert.equal(captured.init.redirect, 'error');
  assert.equal(captured.init.headers.Authorization, 'Bearer ' + credential().accessToken);
  assert.equal(captured.url.includes(credential().accessToken), false);
  assert.equal(result.complete, true); assert.equal(result.customerReady, false);
  assert.equal(result.completenessMeaning, 'validated_page_traversal_only');
  assert.equal(JSON.stringify(result).includes(credential().accessToken), false);
});
test('two pages return one bounded complete report', async () => {
  let count = 0;
  const result = await readProviderPages(request(), options({ fetchImpl: async () => json({ records: [{ id: ++count }], nextUrl: count === 1 ? request().url.replace('offset=0', 'offset=2') : null }) }));
  assert.equal(result.records.length, 2); assert.equal(result.manifest.pages.length, 2);
});
for (const field of ['provider', 'environment', 'tenantId', 'accountId']) test('credential ' + field + ' mismatch prevents any fetch', async () => {
  let called = false;
  await assert.rejects(() => readProviderPages(request(), options({ credential: { ...credential(), [field]: 'other' }, fetchImpl: async () => { called = true; } })), code('CREDENTIAL_BINDING'));
  assert.equal(called, false);
});
test('Xero uses the bound organisation header', async () => {
  const req = { ...request(), provider: 'xero', environment: 'production', accountId: 'org-1', boundAccountId: 'org-1', url: 'https://api.xero.com/api.xro/2.0/Accounts' };
  const cred = { ...credential(), provider: 'xero', environment: 'production', accountId: 'org-1' };
  await readProviderPages(req, options({ credential: cred, fetchImpl: async (_, init) => { assert.equal(init.headers['xero-tenant-id'], 'org-1'); return json({ records: [], nextUrl: null }); } }));
});
for (const token of ['', 'bad\r\nheader', 'contains space']) test('invalid credential syntax ' + JSON.stringify(token), async () => {
  await assert.rejects(() => readProviderPages(request(), options({ credential: { ...credential(), accessToken: token } })), code('INVALID_CREDENTIAL'));
});
test('pagination never reuses mutable request scope or leaks token to a second provider', async () => {
  const req = request(); let calls = 0;
  await assert.rejects(() => readProviderPages(req, options({ fetchImpl: async () => { calls++; return json({}); }, decodePage: () => {
    Object.assign(req, { provider: 'qbo', accountId: '123', boundAccountId: '123' });
    return { records: [], nextUrl: 'https://sandbox-quickbooks.api.intuit.com/v3/company/123/query' };
  } })), code('READ_REJECTED'));
  assert.equal(calls, 1);
});
test('pagination cycles are rejected without returning partial results', async () => {
  await assert.rejects(() => readProviderPages(request(), options({ fetchImpl: async () => json({ records: [], nextUrl: request().url }) })), code('PAGING_CYCLE'));
});
for (const nextUrl of [undefined, '', 4]) test('explicit EOF required, value=' + nextUrl, async () => {
  await assert.rejects(() => readProviderPages(request(), options({ fetchImpl: async () => json({ records: [], nextUrl }) })), code('INVALID_PAGE'));
});
test('cross-origin pagination rejected before credentials are sent', async () => {
  let calls = 0;
  await assert.rejects(() => readProviderPages(request(), options({ fetchImpl: async () => { calls++; return json({ records: [], nextUrl: 'https://attacker.invalid/steal' }); } })), code('READ_REJECTED'));
  assert.equal(calls, 1);
});
test('page limit fails closed', async () => {
  await assert.rejects(() => readProviderPages(request(), options({ maxPages: 1, fetchImpl: async () => json({ records: [], nextUrl: request().url + '&page=2' }) })), code('PAGE_LIMIT'));
});
test('record limit fails closed', async () => {
  await assert.rejects(() => readProviderPages(request(), options({ maxRecords: 1, fetchImpl: async () => json({ records: [1, 2], nextUrl: null }) })), code('RECORD_LIMIT'));
});
test('streamed response-size limit works without content-length', async () => {
  await assert.rejects(() => readProviderPages(request(), options({ maxPageBytes: 4 })), code('RESPONSE_LIMIT'));
});
test('declared response-size limit is checked before reading', async () => {
  await assert.rejects(() => readProviderPages(request(), options({ maxPageBytes: 32, fetchImpl: async () => json({}, 200, { 'content-length': '9999' }) })), code('RESPONSE_LIMIT'));
});
test('total bytes are bounded across pages', async () => {
  let count = 0;
  await assert.rejects(() => readProviderPages(request(), options({ maxTotalBytes: 180, fetchImpl: async () => json({ records: ['a'.repeat(40)], nextUrl: ++count === 1 ? request().url + '&page=2' : null }) })), code('RESPONSE_LIMIT'));
});
test('invalid JSON and HTML are rejected', async () => {
  await assert.rejects(() => readProviderPages(request(), options({ fetchImpl: async () => new Response('{', { headers: { 'content-type': 'application/json' } }) })), code('INVALID_JSON'));
  await assert.rejects(() => readProviderPages(request(), options({ fetchImpl: async () => new Response('<html>secret</html>', { headers: { 'content-type': 'text/html' } }) })), code('CONTENT_TYPE'));
});
test('401 errors are sanitized and not retried', async () => {
  let calls = 0;
  await assert.rejects(() => readProviderPages(request(), options({ fetchImpl: async () => { calls++; return json({ secret: credential().accessToken }, 401); } })), error => error.code === 'HTTP_ERROR' && !error.message.includes(credential().accessToken));
  assert.equal(calls, 1);
});
test('429 retries respect Retry-After without exposing error body', async () => {
  let calls = 0, delays = [];
  const result = await readProviderPages(request(), options({ sleep: async ms => { delays.push(ms); }, fetchImpl: async () => ++calls === 1 ? json({}, 429, { 'retry-after': '2' }) : json({ records: [], nextUrl: null }) }));
  assert.deepEqual(delays, [2000]); assert.equal(result.complete, true);
});
test('retry exhaustion stops after bounded attempts', async () => {
  let calls = 0;
  await assert.rejects(() => readProviderPages(request(), options({ sleep: async () => {}, fetchImpl: async () => { calls++; return json({}, 503); } })), code('HTTP_ERROR'));
  assert.equal(calls, 5);
});
test('excessive Retry-After does not retry early', async () => {
  await assert.rejects(() => readProviderPages(request(), options({ fetchImpl: async () => json({}, 429, { 'retry-after': '120' }) })), code('HTTP_ERROR'));
});
test('fetch errors never leak credential text', async () => {
  await assert.rejects(() => readProviderPages(request(), options({ fetchImpl: async () => { throw Error(credential().accessToken); } })), error => error.code === 'NETWORK_ERROR' && !error.message.includes(credential().accessToken));
});
for (const where of ['fetch', 'decode', 'sleep', 'stream']) test('deadline bounds unresponsive ' + where, async () => {
  const never = () => new Promise(() => {});
  const patch = { deadlineMs: 20 };
  if (where === 'fetch') patch.fetchImpl = never;
  if (where === 'decode') patch.decodePage = never;
  if (where === 'sleep') { patch.fetchImpl = async () => json({}, 429, { 'retry-after': '1' }); patch.sleep = never; patch.deadlineMs = 1100; }
  if (where === 'stream') patch.fetchImpl = async () => new Response(new ReadableStream({ pull: never, cancel: never }), { headers: { 'content-type': 'application/json' } });
  await assert.rejects(() => readProviderPages(request(), options(patch)), code('TIMEOUT'));
});
test('unresponsive stream cancellation does not block size failure', async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('0123456789')); }, cancel() { return new Promise(() => {}); } });
  await assert.rejects(() => readProviderPages(request(), options({ maxPageBytes: 1, deadlineMs: 100, fetchImpl: async () => new Response(stream, { headers: { 'content-type': 'application/json' } }) })), code('RESPONSE_LIMIT'));
});
test('decoder failures do not expose provider raw data', async () => {
  await assert.rejects(() => readProviderPages(request(), options({ decodePage: () => { throw Error('PRIVATE-DATA'); } })), error => error.code === 'INVALID_PAGE' && !error.message.includes('PRIVATE-DATA'));
});
