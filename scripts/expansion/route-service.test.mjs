import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { readExpansionRouteConfig } from '../../src/lib/expansion/route-config.mjs';
import { createExpansionRoutes } from '../../src/lib/expansion/route-service.mjs';
import { authorizationBindingForClient, exchangeProviderCode } from '../../src/lib/expansion/provider-oauth.mjs';
import { bindConnectionAccount } from '../../src/lib/expansion/account-binding.mjs';
import { setup, grant, NOW } from './token-test-helpers.mjs';
const ORIGIN = 'https://example.invalid', SECRET = 'synthetic-session-key-not-a-real-secret';
const ID = '12345678-1234-4234-8234-123456789012';
const env = (patch = {}) => ({ NODE_ENV: 'production', EXPANSION_QUERY_LOG_POLICY_VERIFIED:'true', EXPANSION_OAUTH_ENABLED: 'true', EXPANSION_APP_ORIGIN: ORIGIN,
  NEXTAUTH_SECRET: SECRET, ENCRYPTION_KEY: 'synthetic-encryption-key-not-real-secret', EXPANSION_XERO_ENABLED: 'true',
  EXPANSION_XERO_CLIENT_ID: 'synthetic-client', EXPANSION_XERO_CLIENT_SECRET: 'synthetic-provider-secret',
  EXPANSION_XERO_CALLBACK_URL: `${ORIGIN}/api/expansion/oauth/xero/callback`, ...patch });
const token = (payload = {}, options = {}) => jwt.sign({ userId: 'tenant-1', iat: NOW / 1000, ...payload }, SECRET, { issuer: 'syncstock', expiresIn: '30d', algorithm: 'HS256', ...options });
const sessionToken = token();
const configuredBinding = () => authorizationBindingForClient(readExpansionRouteConfig(env()).clients.xero);
const summary = (patch = {}) => ({ clientId: 'synthetic-client', authorizationBinding: configuredBinding(), connectionId: ID, tenantId: 'tenant-1', provider: 'xero', environment: 'production', version: 1, status: 'available', accountStatus: 'unbound', providerAccountId: null, customerReady: false, ...patch });
function request(path, { method = 'GET', cookie = `session=${sessionToken}`, origin, headers = {}, body, host = ORIGIN } = {}) {
  return new Request(host + path, { method, headers: { ...(cookie === null ? {} : { cookie }), ...(method === 'POST' ? { origin: origin === undefined ? ORIGIN : origin } : {}), ...headers }, ...(body === undefined ? {} : { body }) });
}
function fixture(patch = {}) {
  const calls = { user: 0, stores: 0, fetch: 0, insert: 0, list: 0, bind: 0 }, pending = new Map(), database = setup();
  const consentStore = { async insert(key, value) { pending.set(key, structuredClone(value)); }, async take(key) { const value = pending.get(key); pending.delete(key); return value ?? null; } };
  const deps = {
    env: env(), findUser: async id => { calls.user++; return { id }; },
    loadStores: async () => { calls.stores++; return { consentStore, tokenStore: database.store }; },
    exchangeCode: (input, options) => exchangeProviderCode(input, { ...options, fetchImpl: async () => { calls.fetch++; return new Response(JSON.stringify({ access_token: 'PRIVATE-access-token', refresh_token: 'PRIVATE-refresh-token', expires_in: 1800, token_type: 'Bearer' }), { headers: { 'content-type': 'application/json' } }); } }),
    listAccounts: async binding => { calls.list++; return { ...binding, provider: 'xero', accounts: [{ accountId: 'account-1', label: 'Synthetic account', providerConnectionId: 'PRIVATE-provider-connection', accessToken: 'PRIVATE-access' }], customerReady: false }; },
    bindAccount: async binding => { calls.bind++; return summary({ ...binding, version: binding.version + 1, accountStatus: 'bound', providerAccountId: 'account-1', accessToken: 'PRIVATE-access' }); },
    clock: () => NOW, rateLimit:async()=>({allowed:true,retryAfterSeconds:0}), ...patch,
  };
  return { routes: createExpansionRoutes(deps), deps, calls, pending, database };
}
const startRequest = (options = {}) => request('/api/expansion/oauth/xero/start', { method: 'POST', ...options });
const start = f => f.routes.start(startRequest(), 'xero');
async function state(f) { const r = await start(f); assert.equal(r.status, 200); return new URL((await r.json()).authorizationUrl).searchParams.get('state'); }
const callbackRequest = (state, suffix = '&code=synthetic-code', options) => request(`/api/expansion/oauth/xero/callback?state=${state}${suffix}`, options);
const accountsRequest = (options) => request(`/api/expansion/connections/${ID}/accounts`, options);
const bindRequest = (body = { accountId: 'account-1', version: 1 }, options = {}) => request(`/api/expansion/connections/${ID}/bind`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...options });
function withSummary(patch = {}) {
  const tokenStore = { getSummary: async () => summary() };
  return fixture({ loadStores: async () => ({ tokenStore }), ...patch });
}
async function redacted(response) {
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  const text = await response.text();
  assert.doesNotMatch(text, /PRIVATE|synthetic-provider-secret|synthetic-session|authorizationCode|refreshToken|accessToken/);
  return text;
}
for (const flag of [undefined, '', 'false', '1', 'TRUE']) test(`default-off ${flag} never queries or invokes a dependency`, async () => {
  const f = fixture({ env: env({ EXPANSION_OAUTH_ENABLED: flag }) });
  for (const [operation, req, id] of [['start', startRequest(), 'xero'], ['callback', callbackRequest('a'.repeat(43)), 'xero'], ['accounts', accountsRequest(), ID], ['bind', bindRequest(), ID], ['status', request(`/api/expansion/connections/${ID}`), ID]]) {
    const response = await f.routes[operation](req, id); assert.equal(response.status, 404); await redacted(response);
  }
  assert.deepEqual(f.calls, { user: 0, stores: 0, fetch: 0, insert: 0, list: 0, bind: 0 });
});
for (const patch of [
  { EXPANSION_QUERY_LOG_POLICY_VERIFIED:undefined }, { EXPANSION_QUERY_LOG_POLICY_VERIFIED:'false' }, { NODE_ENV: 'development' }, { NEXTAUTH_SECRET: '' }, { ENCRYPTION_KEY: '' }, { EXPANSION_APP_ORIGIN: 'http://example.invalid' },
  { EXPANSION_APP_ORIGIN: ORIGIN + '/' }, { EXPANSION_APP_ORIGIN: 'https://name:password@example.invalid' },
  { EXPANSION_XERO_CLIENT_SECRET: '' }, { EXPANSION_XERO_CALLBACK_URL: 'https://evil.invalid/callback' },
  { VERCEL_ENV: 'preview' }, { VERCEL: '1', VERCEL_ENV: 'development' }, { VERCEL_ENV: 'preview', EXPANSION_OAUTH_PREVIEW_ORIGIN: 'https://other.invalid' },
]) test(`invalid config fails before queries ${JSON.stringify(patch)}`, async () => {
  const f = fixture({ env: env(patch) }); const response = await start(f); assert.equal(response.status, 503); await redacted(response); assert.equal(f.calls.user, 0); assert.equal(f.calls.stores, 0);
});
test('explicit matching preview origin is required and accepted', async () => {
  const f = fixture({ env: env({ VERCEL_ENV: 'preview', EXPANSION_OAUTH_PREVIEW_ORIGIN: ORIGIN }) }); assert.equal((await start(f)).status, 200);
});
test('configuration uses fixed read scopes, exact callbacks and RuName', () => {
  const config = readExpansionRouteConfig(env({ EXPANSION_EBAY_ENABLED: 'true', EXPANSION_EBAY_ENVIRONMENT: 'production', EXPANSION_EBAY_CLIENT_ID: 'synthetic-ebay', EXPANSION_EBAY_CLIENT_SECRET: 'synthetic-ebay-secret', EXPANSION_EBAY_RU_NAME: 'Synthetic-RuName', EXPANSION_EBAY_CALLBACK_URL: `${ORIGIN}/api/expansion/oauth/ebay/callback`, EXPANSION_EBAY_SCOPES: 'malicious-write-scope' }));
  assert.deepEqual(config.clients.ebay.scopes, ['https://api.ebay.com/oauth/api_scope/commerce.identity.readonly', 'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly']);
  assert.deepEqual(config.clients.xero.scopes, ['accounting.settings.read', 'offline_access']); assert.equal(config.setupUrl, `${ORIGIN}/settings/connections`);
});
for (const origin of ['', 'null', 'https://evil.invalid', ORIGIN + '/', ORIGIN.toUpperCase(), 'http://example.invalid']) test(`POST exact CSRF origin ${origin}`, async () => {
  const f = fixture(); assert.equal((await f.routes.start(startRequest({ origin }), 'xero')).status, 403); assert.equal(f.calls.user, 0); assert.equal(f.calls.stores, 0);
});
test('spoofed Host never determines callback or redirect; preview URL cannot use production config', async () => {
  const f = fixture(); const response = await f.routes.start(startRequest({ headers: { host: 'evil.invalid', 'x-forwarded-host': 'evil.invalid' } }), 'xero');
  assert.equal(response.status, 200); const result = await response.json(); assert.equal(new URL(result.authorizationUrl).searchParams.get('redirect_uri'), env().EXPANSION_XERO_CALLBACK_URL);
  assert.equal((await f.routes.start(startRequest({ host: 'https://evil.invalid' }), 'xero')).status, 403);
});
for (const [label, cookie, auth] of [
  ['missing cookie with bearer', null, `Bearer ${sessionToken}`], ['invalid cookie with bearer', 'session=bad', `Bearer ${sessionToken}`],
  ['duplicate cookie', `session=${sessionToken}; session=${sessionToken}`], ['wrong issuer', `session=${token({}, { issuer: 'shopify' })}`],
  ['wrong algorithm', `session=${token({}, { algorithm: 'HS384' })}`], ['missing user', `session=${token({ userId: null })}`],
  ['expired', `session=${token({}, { expiresIn: -1 })}`], ['future issued', `session=${token({ iat: NOW / 1000 + 1 })}`],
]) test(`web authentication rejects ${label}`, async () => {
  const f = fixture(); const response = await f.routes.start(startRequest({ cookie, headers: { authorization: auth || '' } }), 'xero'); assert.equal(response.status, 401); await redacted(response); assert.equal(f.calls.user, 0); assert.equal(f.calls.stores, 0);
});
test('deleted user cannot authorize even with a valid signed session', async () => { const f = fixture({ findUser: async () => null }); assert.equal((await start(f)).status, 401); assert.equal(f.calls.stores, 0); });
test('successful start has no provider call and binds tenant plus hash of full web session', async () => {
  const f = fixture(); const response = await start(f); assert.equal(response.status, 200); const output = JSON.parse(await redacted(response)); assert.equal(f.calls.fetch, 0); assert.equal(output.provider, 'xero');
  const record = [...f.pending.values()][0]; assert.equal(record.tenantId, 'tenant-1'); assert.equal(record.sessionHash, createHash('sha256').update(createHash('sha256').update(sessionToken).digest('hex')).digest('hex'));
  assert.equal(JSON.stringify(record).includes(sessionToken), false);
});
for (const suffix of ['?userId=other', '?mobile=1', '?returnUrl=https://evil.invalid', '?scope=write']) test('start rejects browser query '+suffix, async () => {
  const f = fixture(); const response = await f.routes.start(request('/api/expansion/oauth/xero/start' + suffix, { method: 'POST' }), 'xero'); assert.equal(response.status, 400); assert.equal(f.calls.user, 0);
});
test('start rejects browser object claims and unsupported providers', async () => {
  const f = fixture(); assert.equal((await f.routes.start(startRequest({ headers: { 'content-type': 'application/json' }, body: '{"tenantId":"other"}' }), 'xero')).status, 400);
  assert.equal((await f.routes.start(startRequest(), '__proto__')).status, 404); assert.equal(f.calls.user, 0);
});
test('schema/store unavailability prevents state creation or provider exchange', async () => {
  const f = fixture({ loadStores: async () => { throw Error('PRIVATE missing database migration'); } });
  for (const response of [await start(f), await f.routes.callback(callbackRequest('a'.repeat(43)), 'xero')]) { assert.equal(response.status, 503); await redacted(response); }
  assert.equal(f.calls.fetch, 0); assert.equal(f.pending.size, 0);
});
test('callback stores unbound encrypted grant before same-origin UUID-only redirect', async () => {
  const f = fixture(), key = await state(f); const response = await f.routes.callback(callbackRequest(key), 'xero'); assert.equal(response.status, 303); await redacted(response);
  const url = new URL(response.headers.get('location')); assert.equal(url.origin, ORIGIN); assert.equal(url.pathname, '/settings/connections'); assert.deepEqual([...url.searchParams.keys()], ['connection']);
  const stored = await f.database.store.getSummary({ tenantId: 'tenant-1', connectionId: url.searchParams.get('connection') }); assert.equal(stored.accountStatus, 'unbound'); assert.equal(stored.customerReady, false); assert.equal(f.calls.fetch, 1); assert.equal(f.pending.size, 0);
  const again = await f.routes.callback(callbackRequest(key), 'xero'); assert.equal(again.headers.get('location'), `${ORIGIN}/settings/connections`); assert.equal(f.calls.fetch, 1);
});
for (const query of ['&state=other&code=a', '&code=a&code=b', '&error=access_denied&error=other', '&code=a&error=access_denied']) test('callback ambiguity is rejected before queries '+query, async () => {
  const f = fixture(); const response = await f.routes.callback(callbackRequest('a'.repeat(43), query), 'xero'); assert.equal(response.status, 400); await redacted(response); assert.equal(f.calls.user, 0); assert.equal(f.calls.stores, 0); assert.equal(f.calls.fetch, 0);
});
for (const [label, cookie] of [['different session', `session=${token({ nonce: 'different' })}`], ['different user', `session=${token({ userId: 'tenant-2' })}`]]) test('callback consumes but never exchanges '+label, async () => {
  const f = fixture(), key = await state(f); const response = await f.routes.callback(callbackRequest(key, '&code=PRIVATE-code', { cookie }), 'xero'); assert.equal(response.status, 303); assert.equal(response.headers.get('location'), `${ORIGIN}/settings/connections`); await redacted(response); assert.equal(f.calls.fetch, 0); assert.equal(f.pending.size, 0);
});
test('provider errors are state-bound, consumed and never exposed or followed', async () => {
  const f = fixture(), key = await state(f); const response = await f.routes.callback(callbackRequest(key, '&error=access_denied&error_description=PRIVATE-token&error_uri=https://evil.invalid'), 'xero');
  assert.equal(response.headers.get('location'), `${ORIGIN}/settings/connections`); await redacted(response); assert.equal(f.calls.fetch, 0); assert.equal(f.pending.size, 0);
});
test('storage failure after exchange never exposes a secret or retries the code', async () => {
  const f = fixture(), original = f.deps.loadStores;
  const routes = createExpansionRoutes({ ...f.deps, loadStores: async tenant => { const s = await original(tenant); return { ...s, tokenStore: { insertUnboundGrant: async () => { throw Error('PRIVATE-token'); } } }; } });
  const key = await state(f), response = await routes.callback(callbackRequest(key), 'xero'); assert.equal(response.headers.get('location'), `${ORIGIN}/settings/connections`); await redacted(response); assert.equal(f.calls.fetch, 1);
  await routes.callback(callbackRequest(key), 'xero'); assert.equal(f.calls.fetch, 1);
});
test('accounts response is allowlisted and passes only server-derived current binding', async () => {
  let observed; const f = withSummary({ listAccounts: async binding => { observed = binding; return { ...binding, provider: 'xero', accounts: [{ accountId: 'account-1', label: 'Synthetic', providerConnectionId: 'PRIVATE-connection', token: 'PRIVATE-token' }] }; } });
  const response = await f.routes.accounts(accountsRequest(), ID); assert.equal(response.status, 200); const output = JSON.parse(await redacted(response));
  assert.deepEqual(observed, { tenantId: 'tenant-1', connectionId: ID, version: 1 }); assert.deepEqual(output.accounts, [{ accountId: 'account-1', label: 'Synthetic' }]); assert.equal('tenantId' in output.connection, false);
});
test('different tenant/connection returns no account data', async () => {
  const f = withSummary({ loadStores: async () => ({ tokenStore: { getSummary: async () => summary({ tenantId: 'other' }) } }) });
  assert.equal((await f.routes.accounts(accountsRequest(), ID)).status, 404); assert.equal(f.calls.list, 0);
});
test('GET account/status requests do not mutate or use browser query claims', async () => {
  const f = withSummary(); const response = await f.routes.status(request(`/api/expansion/connections/${ID}`), ID); assert.equal(response.status, 200); assert.equal(f.calls.bind, 0); assert.equal(f.calls.fetch, 0);
  assert.equal((await f.routes.accounts(request(`/api/expansion/connections/${ID}/accounts?version=100&tenantId=other`), ID)).status, 400);
  assert.equal((await f.routes.accounts(accountsRequest({ headers: { 'sec-fetch-site': 'cross-site' } }), ID)).status, 403);
});
for (const value of [{ accountId: 'account-1', version: 1, tenantId: 'other' }, { accountId: 'account-1', version: 1, provider: 'ebay' }, { accountId: 'account-1', version: '1' }, { accountId: 'account-1', version: 0 }, { accountId: 'account-1' }, { accountId: '', version: 1 }, ['account-1', 1]]) test('bind rejects invalid/browser-owned fields '+JSON.stringify(value), async () => {
  const f = withSummary(); assert.equal((await f.routes.bind(bindRequest(value), ID)).status, 400); assert.equal(f.calls.bind, 0);
});
test('bind rejects oversized or non-JSON input before loading stores', async () => {
  const f = fixture();
  for (const options of [{ body: 'x'.repeat(1025) }, { headers: { 'content-type': 'text/plain' } }, { headers: { 'content-type': 'application/json', 'content-length': '99999' } }]) assert.equal((await f.routes.bind(bindRequest(undefined, options), ID)).status, 400);
  assert.equal(f.calls.stores, 0);
});
test('bind requires exact same-origin POST and current server revision', async () => {
  const f = withSummary(); assert.equal((await f.routes.bind(bindRequest(undefined, { origin: 'https://evil.invalid' }), ID)).status, 403);
  assert.equal((await f.routes.bind(bindRequest({ accountId: 'account-1', version: 2 }), ID)).status, 409); assert.equal(f.calls.bind, 0);
});
test('bind passes selected ID with trusted tenant/revision, emits safe incremented summary', async () => {
  let observed; const f = withSummary({ bindAccount: async (binding, selected) => { observed = { binding, selected }; return summary({ version: 2, accountStatus: 'bound', providerAccountId: 'account-1', refreshToken: 'PRIVATE-secret' }); } });
  const response = await f.routes.bind(bindRequest(), ID); assert.equal(response.status, 200); const output = JSON.parse(await redacted(response));
  assert.deepEqual(observed, { binding: { tenantId: 'tenant-1', connectionId: ID, version: 1 }, selected: 'account-1' }); assert.equal(output.connection.version, 2); assert.equal(output.connection.customerReady, false);
});
test('account adapter errors are redacted without logging', async () => {
  const f = withSummary({ listAccounts: async () => { throw Error('PRIVATE-provider-error'); } }); const response = await f.routes.accounts(accountsRequest(), ID); assert.equal(response.status, 503); await redacted(response);
});
test('required limiter receives tenant only and failure stops before stores', async () => {
  let observed; const f = fixture({ rateLimit: async (...args) => { observed = args; return {allowed:false,retryAfterSeconds:60}; } }); assert.equal((await start(f)).status, 429); assert.deepEqual(observed, ['start', 'tenant-1']); assert.equal(f.calls.stores, 0);
});
test('GET can never initiate OAuth consent or bind an account', async () => {
  const f = fixture(); assert.equal((await f.routes.start(startRequest({ method: 'GET' }), 'xero')).status, 405); assert.equal((await f.routes.bind(request(`/api/expansion/connections/${ID}/bind`), ID)).status, 405); assert.equal(f.calls.user, 0);
});
test('unknown callback fields are ignored and cannot change scope, identity or fixed redirect', async () => {
  const f = fixture(), key = await state(f);
  const response = await f.routes.callback(callbackRequest(key, '&code=synthetic-code&scope=write_everything&session_state=PRIVATE-value&returnUrl=https://evil.invalid&next=//evil.invalid&tenantId=other'), 'xero');
  assert.equal(response.status, 303); const location = new URL(response.headers.get('location'));
  assert.equal(location.origin, ORIGIN); assert.equal(location.pathname, '/settings/connections'); assert.deepEqual([...location.searchParams.keys()], ['connection']);
  const credential = await f.database.store.getAccessCredential({ tenantId: 'tenant-1', connectionId: location.searchParams.get('connection'), version: 1 });
  assert.deepEqual(credential.scopes, ['accounting.settings.read', 'offline_access']); await redacted(response);
});
for (const query of ['&code=a&' + Array.from({ length: 32 }, (_, i) => `x${i}=v`).join('&'), '&code=a&extra=' + 'a'.repeat(4097), '&code=a&' + 'k'.repeat(129) + '=a']) test('callback ancillary bounds are enforced', async () => {
  const f = fixture(); assert.equal((await f.routes.callback(callbackRequest('a'.repeat(43), query), 'xero')).status, 400); assert.equal(f.calls.user, 0);
});
for (const raw of ['{"accountId":"first","accountId":"account-1","version":1}', '{"accountId":"account-1","version":0,"version":1}', '{"accountId":"account-1","ver\\u0073ion":0,"version":1}']) test('duplicate JSON fields fail closed '+raw, async () => {
  const f = withSummary(); assert.equal((await f.routes.bind(bindRequest(undefined, { body: raw }), ID)).status, 400); assert.equal(f.calls.bind, 0);
});
test('body parsing is time-bounded even if stream and cancellation never settle', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const f = fixture({ bodyReadTimeoutMs: 15 });
  const req = new Request(ORIGIN + '/api/expansion/oauth/xero/start', { method: 'POST', headers: { origin: ORIGIN, cookie: `session=${sessionToken}`, 'content-type': 'application/json' }, body: new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { return new Promise(() => {}); } }), duplex: 'half' });
  const pending=f.routes.start(req,'xero');t.mock.timers.tick(16);const response=await pending;assert.equal(response.status,400); assert.equal(f.calls.user, 0); assert.equal(f.calls.stores, 0);
});
test('aborted request stops hung body read before auth or storage', async () => {
  const f = fixture(), controller = new AbortController();
  const req = new Request(ORIGIN + '/api/expansion/oauth/xero/start', { method: 'POST', headers: { origin: ORIGIN, cookie: `session=${sessionToken}`, 'content-type': 'application/json' }, body: new ReadableStream({ pull() { return new Promise(() => {}); } }), duplex: 'half', signal: controller.signal });
  const pending = f.routes.start(req, 'xero'); controller.abort(); assert.equal((await pending).status, 400); assert.equal(f.calls.user, 0);
});
test('safe status includes bound provider account ID without token material', async () => {
  const f = withSummary({ loadStores: async () => ({ tokenStore: { getSummary: async () => summary({ accountStatus: 'bound', providerAccountId: 'account-1', accessToken: 'PRIVATE-token' }) } }) });
  const response = await f.routes.status(request(`/api/expansion/connections/${ID}`), ID); assert.equal(response.status, 200); assert.equal(JSON.parse(await redacted(response)).connection.providerAccountId, 'account-1');
});
test('parallel callbacks exchange and persist at most one grant', async () => {
  const f = fixture(), key = await state(f); const results = await Promise.all(Array.from({ length: 10 }, () => f.routes.callback(callbackRequest(key), 'xero')));
  assert.equal(f.calls.fetch, 1); assert.equal(f.database.rows.size, 1); assert.equal(results.filter(r => new URL(r.headers.get('location')).searchParams.has('connection')).length, 1);
});
test('256-character provider account IDs survive safe listing and binding boundary', async () => {
  const longId = 'a'.repeat(256); const f = withSummary({
    listAccounts: async binding => ({ ...binding, provider: 'xero', accounts: [{ accountId: longId, label: 'Synthetic account' }] }),
    bindAccount: async () => summary({ version: 2, accountStatus: 'bound', providerAccountId: longId }),
  });
  assert.equal((await f.routes.accounts(accountsRequest(), ID)).status, 200);
  assert.equal((await f.routes.bind(bindRequest({ accountId: longId, version: 1 }), ID)).status, 200);
});
test('repeated binding of same verified account remains idempotent through real service/store', async () => {
  const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; let reads = 0;
  const f = fixture({ bindAccount: (binding, selected, options) => bindConnectionAccount(binding, selected, {
    ...options, fetchImpl: async () => { reads++; return new Response(JSON.stringify([{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', tenantId: accountId, tenantType: 'ORGANISATION', tenantName: 'Synthetic organization' }]), { headers: { 'content-type': 'application/json' } }); },
  }) });
  await f.database.store.insertUnboundGrant(grant({ grantId: ID, authorizationBinding: configuredBinding() }));
  const first = await f.routes.bind(bindRequest({ accountId, version: 1 }), ID); assert.equal(first.status, 200); assert.equal((await first.json()).connection.version, 2);
  const repeated = await f.routes.bind(bindRequest({ accountId, version: 2 }), ID); assert.equal(repeated.status, 200);
  const result = JSON.parse(await redacted(repeated)); assert.equal(result.connection.version, 2); assert.equal(result.connection.providerAccountId, accountId); assert.equal(reads, 2);
});
test('unchanged revision cannot represent first-time binding', async () => {
  const f = withSummary({ bindAccount: async () => summary({ accountStatus: 'bound', providerAccountId: 'account-1' }) });
  assert.equal((await f.routes.bind(bindRequest(), ID)).status, 503);
});
for (const patch of [{ clientId: 'previous-application' }, { authorizationBinding: 'a'.repeat(64) }]) test('old app/client binding is rejected before discovery '+JSON.stringify(patch), async () => {
  const f = withSummary({ loadStores: async () => ({ tokenStore: { getSummary: async () => summary(patch) } }) });
  assert.equal((await f.routes.accounts(accountsRequest(), ID)).status, 404);
  assert.equal((await f.routes.bind(bindRequest(), ID)).status, 404);
  assert.equal(f.calls.list, 0); assert.equal(f.calls.bind, 0);
});
test('configured client ID change requires fresh consent before account operations', async () => {
  const f = withSummary({ env: env({ EXPANSION_XERO_CLIENT_ID: 'changed-application' }) });
  assert.equal((await f.routes.accounts(accountsRequest(), ID)).status, 404); assert.equal(f.calls.list, 0);
});
test('secret rotation preserves existing app binding and server-only app metadata is stripped', async () => {
  const f = withSummary({ env: env({ EXPANSION_XERO_CLIENT_SECRET: 'rotated-synthetic-provider-secret' }) });
  const response = await f.routes.accounts(accountsRequest(), ID); assert.equal(response.status, 200);
  const output = await response.json(); assert.equal('clientId' in output.connection, false); assert.equal('authorizationBinding' in output.connection, false);
});
for(const limiter of [null,undefined,()=>true,async()=>false,async()=>({allowed:false,retryAfterSeconds:0}),async()=>({allowed:true,retryAfterSeconds:'PRIVATE'}),async()=>{throw Error('PRIVATE DB URL')}])test('missing or malformed limiter fails closed '+String(limiter),async()=>{const f=fixture({rateLimit:limiter});const response=await start(f);assert.equal(response.status,503);await redacted(response);assert.equal(f.calls.stores,0);assert.equal(f.pending.size,0);});
for(const operation of ['start','callback','accounts','bind','status'])test('shared denial blocks '+operation+' before storage/provider and carries Retry-After',async()=>{let calls=0,seen;const f=fixture({rateLimit:async(...args)=>{calls++;seen=args;return{allowed:false,retryAfterSeconds:83}}});const req=operation==='start'?startRequest():operation==='callback'?callbackRequest('a'.repeat(43)):operation==='accounts'?accountsRequest():operation==='bind'?bindRequest():request(`/api/expansion/connections/${ID}`);const response=await f.routes[operation](req,['start','callback'].includes(operation)?'xero':ID);assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'83');await redacted(response);assert.equal(calls,1);assert.deepEqual(seen,[operation,'tenant-1']);assert.equal(f.calls.stores,0);assert.equal(f.calls.fetch,0);assert.equal(f.calls.bind,0);assert.equal(f.calls.list,0);});
test('kill switch never initializes or calls a shared limiter',async()=>{let calls=0;const f=fixture({env:env({EXPANSION_OAUTH_ENABLED:'false'}),rateLimit:async()=>{calls++;throw Error('must not be called')}});assert.equal((await start(f)).status,404);assert.equal(calls,0);assert.equal(f.calls.user,0);});
test('invalid cookie cannot spend another tenant quota',async()=>{let calls=0;const f=fixture({rateLimit:async()=>{calls++;return{allowed:true,retryAfterSeconds:0}}});assert.equal((await f.routes.start(startRequest({cookie:'session=invalid'}),'xero')).status,401);assert.equal(calls,0);});
