import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { projectExpansionLogEvent, serializeExpansionLogEvent } from '../../src/lib/expansion/safe-logging.mjs';

const SAFE = Object.freeze({ action: 'callback', provider: 'xero', environment: 'production', status: 302, reason: 'none' });
const EXPECTED = { event: 'expansion.http', ...SAFE };
const EMPTY = { event: 'expansion.http', action: 'unknown', provider: 'unknown', environment: 'unknown', status: null, reason: 'unspecified' };
const SECRET = 'SYNTHETIC_PRIVATE_\"\\%2F_\r\n_FAKE_LOG_ENTRY';
const CALLBACK = `https://example.invalid/api/expansion/oauth/xero/callback?code=${encodeURIComponent(SECRET)}&state=${encodeURIComponent(SECRET)}`;
const fields = Object.keys(SAFE);
const decoded = value => JSON.parse(serializeExpansionLogEvent(value));

test('projection retains only reviewed route metadata and has a bounded immutable shape', () => {
  const projected = projectExpansionLogEvent(SAFE);
  assert.equal(Object.getPrototypeOf(projected), null);
  assert.equal(Object.isFrozen(projected), true);
  assert.deepEqual({ ...projected }, EXPECTED);
  assert.throws(() => { projected.url = CALLBACK; }, TypeError);
  assert.notEqual(projected, projectExpansionLogEvent(SAFE));
  assert.ok(serializeExpansionLogEvent(SAFE).length < 250);
});

for (const [field, values] of Object.entries({
  action: ['start', 'callback', 'status', 'accounts', 'bind', 'disconnect'], provider: ['xero', 'ebay'],
  environment: ['production', 'sandbox'], status: [200, 302, 303, 400, 401, 403, 404, 405, 409, 429, 503],
  reason: ['none', 'not_found', 'sign_in_required', 'forbidden', 'invalid_request', 'method_not_allowed', 'connection_changed', 'try_again_later', 'disconnect_unavailable', 'expansion_unavailable'],
})) test(`known ${field} values are retained without alteration`, () => {
  for (const value of values) assert.equal(decoded({ ...SAFE, [field]: value })[field], value);
});

for (const field of ['code', 'state', 'access_token', 'refresh_token', 'id_token', 'authorizationCode', 'accessToken',
  'refreshToken', 'clientSecret', 'session', 'cookie', 'set-cookie', 'authorization', 'Authorization', 'x-api-key',
  'url', 'path', 'pathname', 'query', 'search', 'searchParams', 'requestPath', 'proxy.path', 'referer', 'location',
  'message', 'stack', 'cause', 'error_description', 'error_uri', 'requestId', 'tenantId', 'connectionId', 'accountId', 'event']) {
  test(`drops untrusted ${field} entirely`, () => {
    const input = { ...SAFE, [field]: `${CALLBACK}#${SECRET}` };
    assert.deepEqual(decoded(input), EXPECTED);
    assert.equal(input[field], `${CALLBACK}#${SECRET}`);
  });
}

test('drops auth headers, cookies, request bodies, provider responses and nested error chains', () => {
  const error = new Error(`OAuth failed: ${CALLBACK}`, { cause: new Error(SECRET) });
  error.code = SECRET; error.stack = SECRET; error.response = { data: { access_token: SECRET, refresh_token: SECRET } };
  const input = { ...SAFE, request: new Request(CALLBACK, { headers: { authorization: 'Bearer synthetic-token', cookie: 'session=synthetic-session' } }),
    headers: new Headers({ authorization: 'Bearer synthetic-token', cookie: 'session=synthetic-session', 'set-cookie': 'session=synthetic-session' }),
    cookies: [{ name: 'session', value: SECRET }], body: Buffer.from(SECRET), response: { location: CALLBACK, body: SECRET },
    error, context: { token: SECRET, query: new URLSearchParams({ code: SECRET, state: SECRET }) } };
  assert.deepEqual(decoded(input), EXPECTED);
  assert.deepEqual(decoded(error), EMPTY);
});

for (const [label, value] of [
  ['raw secret', SECRET], ['absolute callback', CALLBACK], ['path injection', `/api/expansion/oauth/${SECRET}/callback`],
  ['query injection', `?innocent=${SECRET}`], ['nested URL', new URL(CALLBACK)],
  ['query object', new URLSearchParams({ code: SECRET, state: SECRET })],
  ['JSON', JSON.stringify({ harmless: SECRET })], ['percent encoding', encodeURIComponent(SECRET)],
  ['double encoding', encodeURIComponent(encodeURIComponent(SECRET))], ['base64', Buffer.from(SECRET).toString('base64')],
  ['control characters', `callback\r\n${SECRET}`], ['uppercase enum', 'CALLBACK'], ['whitespace', 'callback '],
  ['string status', '303'], ['infinite status', Infinity], ['nan status', NaN], ['bigint', 303n],
  ['symbol', Symbol(SECRET)], ['object', { value: SECRET }], ['array', [SECRET]], ['error', new Error(SECRET)],
  ['boxed string', new String('callback')], ['boxed number', new Number(303)],
]) test(`no ${label} can be smuggled through an allowlisted field`, () => {
  for (const field of fields) assert.equal(decoded({ ...SAFE, [field]: value })[field], EMPTY[field]);
});

test('does not inspect recursively linked, deeply nested or large opaque structures', () => {
  const root = { secret: SECRET }; root.self = root;
  let deep = root;
  for (let depth = 0; depth < 20000; depth++) deep = { child: deep };
  const array = [root]; array.push(array);
  const input = { ...SAFE, context: { root, deep, array, huge: SECRET.repeat(10000) } };
  input.self = input;
  assert.deepEqual(decoded(input), EXPECTED);
  for (const field of fields) assert.equal(decoded({ ...SAFE, [field]: root })[field], EMPTY[field]);
  assert.equal(root.self, root);
});

test('never invokes input getters, toJSON, custom inspection or primitive coercion', () => {
  let calls = 0;
  const fail = () => { calls++; throw new Error(SECRET); };
  const input = { ...SAFE, toJSON: fail, toString: fail, valueOf: fail,
    [Symbol.toPrimitive]: fail, [Symbol.for('nodejs.util.inspect.custom')]: fail };
  for (const key of ['url', 'query', 'headers', 'error', 'context']) Object.defineProperty(input, key, { get: fail });
  assert.deepEqual(decoded(input), EXPECTED);
  for (const field of fields) {
    const accessor = { ...SAFE }; Object.defineProperty(accessor, field, { get: fail });
    assert.equal(decoded(accessor)[field], EMPTY[field]);
    assert.equal(decoded({ ...SAFE, [field]: input })[field], EMPTY[field]);
  }
  assert.equal(calls, 0);
});

test('ignores inherited values and prototype pollution keys', () => {
  const inherited = Object.create({ ...SAFE, toJSON: () => SECRET });
  assert.deepEqual(decoded(inherited), EMPTY);
  const input = Object.assign(Object.create(null), SAFE);
  input.__proto__ = { action: SECRET }; input.constructor = SECRET; input.prototype = SECRET;
  input[Symbol(SECRET)] = SECRET;
  assert.deepEqual(decoded(input), EXPECTED);
});

test('does not enumerate or access ordinary properties of a proxy', () => {
  let reads = 0;
  const input = new Proxy(SAFE, {
    ownKeys() { throw new Error(SECRET); }, get() { throw new Error(SECRET); },
    getOwnPropertyDescriptor(target, key) { reads++; return Reflect.getOwnPropertyDescriptor(target, key); },
  });
  assert.deepEqual(decoded(input), EXPECTED); assert.equal(reads, fields.length);
});

test('throwing and revoked proxies fail closed without reflecting thrown data', () => {
  const throwing = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error(SECRET); } });
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  assert.deepEqual(decoded(throwing), EMPTY); assert.deepEqual(decoded(revoked.proxy), EMPTY);
});

test('invalid whole inputs remain bounded and do not throw or coerce', () => {
  for (const value of [undefined, null, true, false, 303, 303n, SECRET, Symbol(SECRET), () => SECRET, [SECRET], new Error(SECRET)]) {
    assert.deepEqual(decoded(value), EMPTY);
  }
});

test('serialized output is a single JSON record without a raw or encoded credential', () => {
  const output = serializeExpansionLogEvent({ ...SAFE, code: SECRET, path: CALLBACK, error: new Error(SECRET) });
  assert.deepEqual(JSON.parse(output), EXPECTED);
  assert.doesNotMatch(output, /SYNTHETIC|PRIVATE|FAKE|example|[\r\n]/);
});

test('import and projection have no logging side effects and do not intercept unrelated logs', () => {
  const moduleUrl = new URL('../../src/lib/expansion/safe-logging.mjs', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const before = [console.log, console.warn, console.error, console.info, console.debug, process.stdout.write, process.stderr.write];
    const { serializeExpansionLogEvent } = await import(${JSON.stringify(moduleUrl)});
    serializeExpansionLogEvent({ action: 'callback', code: 'SYNTHETIC_PRIVATE' });
    assert.deepEqual([console.log, console.warn, console.error, console.info, console.debug, process.stdout.write, process.stderr.write], before);
    console.log('unrelated ordinary application log');
    console.error('unrelated ordinary error log');
  `], { encoding: 'utf8', timeout: 5000 });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, 'unrelated ordinary application log\n');
  assert.equal(child.stderr, 'unrelated ordinary error log\n');
});
