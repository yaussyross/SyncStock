/** Server-only bounded GET transport. No OAuth exchange, token persistence or writes. */
import { createHash } from 'node:crypto';
import { validateReadRequest, retryDelay } from './read-safety.mjs';

export class ProviderReadError extends Error {
  constructor(code, message) { super(message); this.name = 'ProviderReadError'; this.code = code; }
}
const fail = (code, message) => { throw new ProviderReadError(code, message); };
const digest = value => createHash('sha256').update(value).digest('hex');
const bounded = (value, min, max, label) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('INVALID_LIMIT', `Invalid ${label} limit.`);
  return value;
};
const timeoutError = () => new ProviderReadError('TIMEOUT', 'Provider read exceeded its time budget.');
function abortable(operation, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(timeoutError());
    const abort = () => reject(timeoutError());
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(operation).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
function cancelBody(body) { try { void body?.cancel().catch(() => {}); } catch { /* Cleanup never blocks the deadline. */ } }

async function readBoundedJson(response, maxBytes, signal) {
  const type = response.headers.get('content-type') || '';
  if (!/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(type)) fail('CONTENT_TYPE', 'Provider did not return JSON.');
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) fail('RESPONSE_LIMIT', 'Provider response exceeds the allowed size.');
  if (!response.body) fail('EMPTY_RESPONSE', 'Provider returned an empty response.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      if (signal.aborted) fail('TIMEOUT', 'Provider read exceeded its time budget.');
      const { value, done } = await abortable(reader.read(), signal);
      if (signal.aborted) fail('TIMEOUT', 'Provider read exceeded its time budget.');
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) fail('RESPONSE_LIMIT', 'Provider response exceeds the allowed size.');
      chunks.push(Buffer.from(value));
    }
    const bytes = Buffer.concat(chunks);
    let parsed;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { fail('INVALID_JSON', 'Provider response is not valid UTF-8 JSON.'); }
    return { parsed, bytes: size, sha256: digest(bytes) };
  } finally {
    signal.removeEventListener('abort', abort);
    try { void reader.cancel().catch(() => {}); } catch { /* No raw provider error is exposed. */ }
    try { reader.releaseLock(); } catch { /* An unresponsive stream cannot block cleanup. */ }
  }
}

function pause(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new ProviderReadError('TIMEOUT', 'Provider read exceeded its time budget.'));
    const done = () => { signal.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(done, milliseconds);
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new ProviderReadError('TIMEOUT', 'Provider read exceeded its time budget.')); };
    signal.addEventListener('abort', abort, { once: true });
  });
}

/**
 * credential and decodePage must come from trusted server code, never request JSON.
 * The decoder must explicitly return { records: [], nextUrl: string|null } using
 * the documented provider paging scheme. A missing next field is not EOF.
 * Returning complete:true proves traversal only, not financial completeness,
 * provider account ownership, settlement, posting permission or launch readiness.
 */
export async function readProviderPages(request, {
  credential, decodePage, fetchImpl = globalThis.fetch,
  maxPages = 25, maxRecords = 1000, maxPageBytes = 2 * 1024 * 1024,
  maxTotalBytes = 8 * 1024 * 1024, deadlineMs = 30000,
  sleep = pause, clock = Date.now,
} = {}) {
  bounded(maxPages, 1, 100, 'page'); bounded(maxRecords, 1, 10000, 'record');
  bounded(maxPageBytes, 1, 8 * 1024 * 1024, 'page byte');
  bounded(maxTotalBytes, 1, 32 * 1024 * 1024, 'total byte');
  bounded(deadlineMs, 1, 120000, 'deadline');
  if (typeof decodePage !== 'function' || typeof fetchImpl !== 'function' || typeof sleep !== 'function' || typeof clock !== 'function') fail('TRUSTED_ADAPTER_REQUIRED', 'A trusted provider paging adapter is required.');
  const initial = validateReadRequest(request);
  const binding = Object.freeze({ provider: initial.provider, environment: initial.environment, tenantId: initial.tenantId, boundTenantId: initial.tenantId, accountId: initial.accountId, boundAccountId: initial.accountId, method: 'GET' });
  if (!credential || ['provider', 'environment', 'tenantId', 'accountId'].some(key => credential[key] !== initial[key])) fail('CREDENTIAL_BINDING', 'The credential does not match the bound provider account.');
  if (typeof credential.accessToken !== 'string' || !credential.accessToken || credential.accessToken.length > 16384 || /[\s\x00-\x1f\x7f]/.test(credential.accessToken)) fail('INVALID_CREDENTIAL', 'A valid bound access credential is required.');
  const headers = { Authorization: `Bearer ${credential.accessToken}`, Accept: 'application/json' };
  if (initial.provider === 'xero') headers['xero-tenant-id'] = initial.accountId;
  const start = clock();
  if (!Number.isFinite(start)) fail('INVALID_CLOCK', 'A valid clock is required.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  const remaining = () => {
    const now = clock();
    if (!Number.isFinite(now) || now < start) fail('INVALID_CLOCK', 'Provider read clock moved backwards.');
    const ms = deadlineMs - (now - start);
    if (controller.signal.aborted || ms <= 0) fail('TIMEOUT', 'Provider read exceeded its time budget.');
    return ms;
  };
  const records = [], pages = [], seen = new Set();
  let url = initial.url, totalBytes = 0;
  try {
    while (url !== null) {
      remaining();
      if (pages.length >= maxPages) fail('PAGE_LIMIT', 'Provider pagination exceeded the allowed page count.');
      const pageRequest = validateReadRequest({ ...binding, url });
      if (seen.has(pageRequest.url)) fail('PAGING_CYCLE', 'Provider pagination repeated a page.');
      seen.add(pageRequest.url);
      let response;
      for (let attempt = 0; ; attempt++) {
        remaining();
        try {
          const pending = Promise.resolve(fetchImpl(pageRequest.url, { method: 'GET', headers: { ...headers }, redirect: 'error', signal: controller.signal }));
          // An injected transport may ignore abort. Dispose of a late response
          // without extending the caller's deadline or exposing partial data.
          void pending.then(late => { if (controller.signal.aborted) cancelBody(late?.body); }, () => {});
          response = await abortable(pending, controller.signal);
        } catch {
          if (controller.signal.aborted) fail('TIMEOUT', 'Provider read exceeded its time budget.');
          fail('NETWORK_ERROR', 'Provider read failed before a usable response.');
        }
        remaining();
        if (response.redirected || (response.url && response.url !== pageRequest.url)) { cancelBody(response.body); fail('REDIRECT_BLOCKED', 'Provider redirects are not permitted.'); }
        if (response.status >= 200 && response.status < 300) break;
        const delay = retryDelay({ status: response.status, attempt, retryAfter: response.headers.get('retry-after'), now: clock() });
        cancelBody(response.body);
        if (delay === null) fail('HTTP_ERROR', `Provider read returned HTTP ${response.status}.`);
        if (delay >= remaining()) fail('TIMEOUT', 'Provider retry exceeds its time budget.');
        await abortable(sleep(delay, controller.signal), controller.signal);
      }
      let body;
      try { body = await abortable(readBoundedJson(response, Math.min(maxPageBytes, maxTotalBytes - totalBytes), controller.signal), controller.signal); }
      catch (error) { cancelBody(response.body); throw error; }
      totalBytes += body.bytes;
      remaining();
      let page;
      try { page = await abortable(decodePage(body.parsed, { provider: initial.provider, environment: initial.environment, accountId: initial.accountId, pageNumber: pages.length + 1, signal: controller.signal }), controller.signal); }
      catch (error) { if (error instanceof ProviderReadError && error.code === 'TIMEOUT') throw error; fail('INVALID_PAGE', 'Provider page could not be validated by its adapter.'); }
      remaining();
      if (!page || !Array.isArray(page.records) || !Object.hasOwn(page, 'nextUrl') || !(page.nextUrl === null || (typeof page.nextUrl === 'string' && page.nextUrl.length > 0 && page.nextUrl.length <= 8192))) fail('INVALID_PAGE', 'Provider paging adapter returned an invalid page.');
      if (records.length + page.records.length > maxRecords) fail('RECORD_LIMIT', 'Provider response exceeds the allowed record count.');
      records.push(...page.records);
      pages.push({ number: pages.length + 1, urlHash: digest(pageRequest.url), bodyHash: body.sha256, bytes: body.bytes, records: page.records.length });
      url = page.nextUrl;
    }
    return { provider: initial.provider, environment: initial.environment, tenantId: initial.tenantId, accountId: initial.accountId, complete: true, completenessMeaning: 'validated_page_traversal_only', providerAcceptanceTested: false, customerReady: false, records, manifest: { pages, totalBytes } };
  } catch (error) {
    if (error instanceof ProviderReadError) throw error;
    fail('READ_REJECTED', 'Provider read was rejected; no partial report is returned.');
  } finally { clearTimeout(timer); controller.abort(); }
}
