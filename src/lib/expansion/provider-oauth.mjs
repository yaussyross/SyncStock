/** Server-only confidential-app OAuth adapters. Never call with browser-supplied
 * app configuration or credentials. No routes, token persistence or real grants
 * are installed by this module. Outputs contain secrets: never log/serialize them.
 */
import { createHash, randomUUID } from 'node:crypto';
import { beginConsent, consumeConsent, validateCallback } from './oauth-guard.mjs';

export class ProviderOAuthError extends Error {
  constructor(code, message, outcome = 'not_sent') {
    super(message); this.name = 'ProviderOAuthError'; this.code = code; this.outcome = outcome;
  }
}
const fail = (code, message, outcome) => { throw new ProviderOAuthError(code, message, outcome); };
const endpoints = Object.freeze({
  ebay: {
    production: { authorize: 'https://auth.ebay.com/oauth2/authorize', token: 'https://api.ebay.com/identity/v1/oauth2/token' },
    sandbox: { authorize: 'https://auth.sandbox.ebay.com/oauth2/authorize', token: 'https://api.sandbox.ebay.com/identity/v1/oauth2/token' },
  },
  xero: { production: { authorize: 'https://login.xero.com/identity/connect/authorize', token: 'https://identity.xero.com/connect/token' } },
});
// This increment only requests the already implemented read surfaces. New scopes
// require code review, fresh consent and provider-specific acceptance.
const scopeAllowlist = {
  ebay: new Set(['https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly']),
  xero: new Set(['offline_access', 'accounting.settings.read']),
};
const safe = (s, max = 200) => typeof s === 'string' && s.length > 0 && s.length <= max && !/[\s\x00-\x1f\x7f]/.test(s);
const hash = value => createHash('sha256').update(value).digest('hex');
function configuration(input, needsSecret = false) {
  if (!input || !endpoints[input.provider]?.[input.environment] || !safe(input.clientId, 512) || input.clientId.includes(':')) fail('APP_CONFIGURATION', 'A supported bound confidential app is required.');
  if (!Array.isArray(input.scopes) || input.scopes.length === 0 || input.scopes.length > 10 || new Set(input.scopes).size !== input.scopes.length || input.scopes.some(s => !scopeAllowlist[input.provider].has(s))) fail('SCOPE_REJECTED', 'Only explicit supported read scopes are permitted.');
  const scopes = [...input.scopes].sort();
  if (input.provider === 'xero' && (!scopes.includes('offline_access') || !scopes.includes('accounting.settings.read'))) fail('SCOPE_REJECTED', 'Xero account reads require settings and offline access consent.');
  let callback;
  try { callback = validateCallback(input.callbackUrl, input.allowedCallbacks); } catch { fail('APP_CONFIGURATION', 'An exact registered HTTPS callback is required.'); }
  if (callback.length > 2048) fail('APP_CONFIGURATION', 'Callback is too long.');
  if (input.provider === 'ebay' && (!safe(input.ruName, 512) || !/^[A-Za-z0-9_-]+$/.test(input.ruName))) fail('APP_CONFIGURATION', 'eBay requires the registered RuName, not a callback URL.');
  if (needsSecret && !safe(input.clientSecret, 4096)) fail('APP_CONFIGURATION', 'A confidential app secret is required.');
  const app = { provider: input.provider, environment: input.environment, clientId: input.clientId, callback, scopes, redirectUri: input.provider === 'ebay' ? input.ruName : callback, ...endpoints[input.provider][input.environment] };
  // Secret rotation does not alter the OAuth application's identity. All other
  // authorization parameters are frozen in the encrypted single-use state.
  app.authorizationBinding = hash(JSON.stringify(app));
  if (needsSecret) app.clientSecret = input.clientSecret;
  return Object.freeze(app);
}
function contextFor(app, context) {
  if (!context || context.provider !== app.provider || context.environment !== app.environment) fail('CONTEXT_MISMATCH', 'Consent must match the configured provider and environment.');
  return { provider: context.provider, environment: context.environment, tenantId: context.tenantId, sessionId: context.sessionId };
}
export async function beginProviderConsent(context, { client, store, now = Date.now(), ttlMs = 600000 } = {}) {
  const app = configuration(client), bound = contextFor(app, context);
  const consent = await beginConsent(bound, { store, allowedCallbacks: [app.callback], callbackUrl: app.callback, now, ttlMs, authorizationBinding: app.authorizationBinding });
  const url = new URL(app.authorize);
  url.search = new URLSearchParams({ response_type: 'code', client_id: app.clientId, redirect_uri: app.redirectUri, scope: app.scopes.join(' '), state: consent.state }).toString();
  // Confidential-client contracts use Basic client authentication; PKCE helpers
  // remain available separately but are not added to undocumented provider flows.
  return { authorizationUrl: url.href, expiresAt: consent.expiresAt, provider: app.provider, environment: app.environment };
}
const timeout = () => new ProviderOAuthError('TOKEN_OUTCOME_UNKNOWN', 'Token request outcome is unknown; reconcile or obtain fresh consent before retrying.', 'unknown');
function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(timeout());
    const abort = () => reject(timeout());
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
function cancel(body) { try { void body?.cancel().catch(() => {}); } catch { /* Cleanup must not block. */ } }
async function boundedJson(response, signal, maxBytes) {
  if (!/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) fail('TOKEN_RESPONSE_INVALID', 'Token response was not valid JSON.', 'unknown');
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) fail('TOKEN_RESPONSE_INVALID', 'Token response exceeded its size limit.', 'unknown');
  if (!response.body) fail('TOKEN_RESPONSE_INVALID', 'Token response was empty.', 'unknown');
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) fail('TOKEN_RESPONSE_INVALID', 'Token response exceeded its size limit.', 'unknown');
      chunks.push(Buffer.from(value));
    }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { fail('TOKEN_RESPONSE_INVALID', 'Token response could not be decoded.', 'unknown'); }
  } finally { try { void reader.cancel().catch(() => {}); } catch {} try { reader.releaseLock(); } catch {} }
}
function options({ fetchImpl = globalThis.fetch, deadlineMs = 15000, maxResponseBytes = 65536, clock = Date.now } = {}) {
  if (typeof fetchImpl !== 'function' || typeof clock !== 'function' || !Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 30000 || !Number.isInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > 262144) fail('TRANSPORT_CONFIGURATION', 'Invalid token transport limits.');
  return { fetchImpl, deadlineMs, maxResponseBytes, clock };
}
async function tokenRequest(app, fields, transport) {
  const { fetchImpl, deadlineMs, maxResponseBytes, clock } = transport;
  const sentAt = clock();
  if (!Number.isSafeInteger(sentAt) || sentAt < 0) fail('INVALID_CLOCK', 'Invalid token clock.');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), deadlineMs);
  let response;
  try {
    const pending = Promise.resolve(fetchImpl(app.token, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: controller.signal,
      headers: { Authorization: `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(fields).toString(),
    }));
    void pending.then(late => { if (controller.signal.aborted) cancel(late?.body); }, () => {});
    response = await abortable(pending, controller.signal);
    if (response.redirected || (response.url && response.url !== app.token)) fail('TOKEN_REDIRECT_BLOCKED', 'Token redirects are forbidden.', 'unknown');
    const body = await boundedJson(response, controller.signal, maxResponseBytes);
    const receivedAt = clock();
    if (!Number.isSafeInteger(receivedAt) || receivedAt < sentAt || receivedAt - sentAt >= deadlineMs || controller.signal.aborted) throw timeout();
    // Only documented OAuth errors make an explicit rejection; provider error
    // descriptions are never surfaced because they can contain credentials.
    if (response.status !== 200 || body?.error) {
      if (response.status >= 400 && response.status < 500 && ['invalid_grant', 'invalid_client', 'invalid_scope', 'unauthorized_client', 'access_denied', 'invalid_request', 'unsupported_grant_type'].includes(body?.error)) fail(body.error === 'invalid_grant' ? 'RECONSENT_REQUIRED' : 'TOKEN_REQUEST_REJECTED', 'Provider rejected the token request; no automatic retry was made.', 'rejected');
      fail('TOKEN_OUTCOME_UNKNOWN', 'Provider did not confirm a usable token; do not retry automatically.', 'unknown');
    }
    return { body, sentAt, receivedAt };
  } catch (error) {
    if (error instanceof ProviderOAuthError) throw error;
    fail('TOKEN_OUTCOME_UNKNOWN', 'Token request outcome is unknown; no automatic retry was made.', 'unknown');
  } finally { clearTimeout(timer); controller.abort(); cancel(response?.body); }
}
function decodeTokens(result, app, prior = null) {
  const { body, sentAt, receivedAt } = result;
  if (!body || Array.isArray(body) || !safe(body.access_token, 16384) || typeof body.token_type !== 'string' || body.token_type.toLowerCase() !== (app.provider === 'ebay' ? 'user access token' : 'bearer') || !Number.isSafeInteger(body.expires_in) || body.expires_in < 1 || body.expires_in > 86400) fail('TOKEN_RESPONSE_INVALID', 'Provider token response failed validation.', 'unknown');
  if (app.provider === 'ebay' && prior && body.refresh_token !== undefined && body.refresh_token !== prior.refreshToken) fail('TOKEN_RESPONSE_INVALID', 'Unexpected eBay refresh credential rotation.', 'unknown');
  const refreshToken = body.refresh_token ?? (app.provider === 'ebay' ? prior?.refreshToken : undefined);
  if (!safe(refreshToken, 16384)) fail('TOKEN_RESPONSE_INVALID', 'Provider did not return the required refresh credential.', 'unknown');
  // eBay can omit refresh_token during refresh; Xero must return the rotated pair.
  if (app.provider === 'xero' && prior && refreshToken === prior.refreshToken) fail('TOKEN_RESPONSE_INVALID', 'Xero did not return a newly rotated refresh credential.', 'unknown');
  if (body.scope !== undefined) {
    if (typeof body.scope !== 'string' || body.scope.length > 4096) fail('TOKEN_SCOPE_MISMATCH', 'Token scope could not be verified.', 'unknown');
    const granted = body.scope.split(' ').filter(Boolean).sort();
    if (granted.length !== app.scopes.length || granted.some((s, i) => s !== app.scopes[i])) fail('TOKEN_SCOPE_MISMATCH', 'Provider returned a different scope set.', 'unknown');
  }
  let refreshExpiresAt = prior?.refreshExpiresAt ?? null;
  if (app.provider === 'ebay' && !prior && body.refresh_token_expires_in === undefined) fail('TOKEN_RESPONSE_INVALID', 'eBay refresh lifetime is required.', 'unknown');
  if (app.provider === 'ebay' && body.refresh_token_expires_in !== undefined) {
    if (!Number.isSafeInteger(body.refresh_token_expires_in) || body.refresh_token_expires_in < 1 || body.refresh_token_expires_in > 94608000) fail('TOKEN_RESPONSE_INVALID', 'Refresh lifetime is invalid.', 'unknown');
    // A refresh must never extend the original eBay refresh-token lifetime.
    const reportedExpiry = sentAt + body.refresh_token_expires_in * 1000;
    refreshExpiresAt = prior?.refreshExpiresAt == null ? reportedExpiry : Math.min(prior.refreshExpiresAt, reportedExpiry);
  }
  // Xero documents a rolling 60-day refresh lifetime, not a response field.
  if (app.provider === 'xero') refreshExpiresAt = sentAt + 60 * 86400000;
  const expiresAt = sentAt + body.expires_in * 1000;
  if (expiresAt <= receivedAt) fail('TOKEN_RESPONSE_INVALID', 'Token expired before it could be stored.', 'unknown');
  return Object.freeze({ accessToken: body.access_token, refreshToken, expiresAt, refreshExpiresAt, tokenType: 'Bearer', scopes: Object.freeze([...app.scopes]), scopeEvidence: body.scope === undefined ? 'consent_request' : 'token_response' });
}
/** Caller must encrypt/store this unbound grant before returning any browser response.
 * A token response does not prove provider-account identity or customer readiness.
 */
export async function exchangeProviderCode(input, { client, store, ...transportOptions } = {}) {
  const app = configuration(client, true), transport = options(transportOptions), context = contextFor(app, input?.context);
  let grant;
  try { grant = await consumeConsent({ ...input, context }, { store, allowedCallbacks: [app.callback], authorizationBinding: app.authorizationBinding, now: transport.clock() }); }
  catch { fail('CONSENT_REJECTED', 'Consent expired, was used, declined or does not match this app and session.'); }
  if (app.provider === 'ebay' && grant.authorizationCode.length > 1024) fail('CONSENT_REJECTED', 'eBay authorization code exceeds its documented size.');
  const tokens = decodeTokens(await tokenRequest(app, { grant_type: 'authorization_code', code: grant.authorizationCode, redirect_uri: app.redirectUri }, transport), app);
  return Object.freeze({ grantId: randomUUID(), provider: app.provider, environment: app.environment, tenantId: grant.tenantId, clientId: app.clientId, authorizationBinding: app.authorizationBinding, status: 'account_binding_required', providerAccountId: null, customerReady: false, ...tokens });
}
/** Refresh primitive for trusted server orchestration ONLY. The caller must hold
 * an exclusive durable claim, prevent parallel refresh and atomically encrypt/CAS
 * the complete returned pair before releasing that claim. Unknown outcomes must
 * hold the connection for reconciliation/re-consent, never reuse the old token.
 * This module intentionally supplies no public route or in-memory production lock.
 */
export async function refreshProviderTokens(binding, { client, credential, ...transportOptions } = {}) {
  const app = configuration(client, true), transport = options(transportOptions);
  if (!binding || !safe(binding.tenantId) || !safe(binding.connectionId) || !Number.isSafeInteger(binding.version) || binding.version < 1 || !credential || ['tenantId', 'connectionId', 'version'].some(k => credential[k] !== binding[k]) || credential.provider !== app.provider || credential.environment !== app.environment || credential.clientId !== app.clientId || credential.authorizationBinding !== app.authorizationBinding || !Array.isArray(credential.scopes) || credential.scopes.join(' ') !== app.scopes.join(' ') || !safe(credential.refreshToken, 16384)) fail('CREDENTIAL_BINDING', 'Refresh credential does not match its connection, tenant and application.');
  // Snapshot trusted inputs before the first await. No caller mutation may change
  // the provider, tenant, refresh token or compare-and-swap revision mid-request.
  const prior = { refreshToken: credential.refreshToken, refreshExpiresAt: credential.refreshExpiresAt ?? null };
  const bound = { tenantId: binding.tenantId, connectionId: binding.connectionId, version: binding.version };
  const now = transport.clock();
  if (!Number.isSafeInteger(now) || now < 0 || (prior.refreshExpiresAt !== null && (!Number.isSafeInteger(prior.refreshExpiresAt) || prior.refreshExpiresAt <= now))) fail('RECONSENT_REQUIRED', 'Refresh credential has expired or has an invalid lifetime.');
  const fields = { grant_type: 'refresh_token', refresh_token: prior.refreshToken };
  if (app.provider === 'ebay') fields.scope = app.scopes.join(' ');
  const tokens = decodeTokens(await tokenRequest(app, fields, transport), app, prior);
  return Object.freeze({ ...bound, provider: app.provider, environment: app.environment, clientId: app.clientId, authorizationBinding: app.authorizationBinding, expectedVersion: bound.version, ...tokens });
}
