/** Dependency-injected HTTP boundary. Provider tokens and untrusted error text
 * never become responses, redirects or logs. GET account reads never refresh. */
import { authorizationBindingForClient, beginProviderConsent, exchangeProviderCode } from './provider-oauth.mjs';
import { authenticateExpansionSession } from './route-session.mjs';
import { ExpansionRouteError, rejectRoute, readExpansionRouteConfig } from './route-config.mjs';

const HEADERS = Object.freeze({ 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...HEADERS, 'Content-Type': 'application/json' } });
// Xero's API consumer security standard specifies a 302 for token-bearing
// callback URLs. Both redirects have an empty body and a fixed same-origin target.
const redirect = (location, provider) => new Response(null, { status: provider === 'xero' ? 302 : 303, headers: { ...HEADERS, Location: location } });
const safeId = value => typeof value === 'string' && /^[^\s\x00-\x1f\x7f]{1,200}$/.test(value);
const accountId = value => typeof value === 'string' && /^[^\s\x00-\x1f\x7f]{1,256}$/.test(value);
const version = value => Number.isSafeInteger(value) && value > 0 && value < 2147483647;
function urlFor(request, config, expectedPath, method) {
  if (request.method !== method) rejectRoute(405, 'method_not_allowed');
  let url;
  try { url = new URL(request.url); } catch { rejectRoute(400, 'invalid_request'); }
  if (url.origin !== config.origin || url.pathname !== expectedPath || url.username || url.password || url.hash) rejectRoute(403, 'forbidden');
  if (method === 'POST' && request.headers.get('origin') !== config.origin) rejectRoute(403, 'forbidden');
  // A cross-site browser may visit a callback but cannot read connection data.
  if (method === 'GET' && !expectedPath.endsWith('/callback') && request.headers.get('sec-fetch-site') === 'cross-site') rejectRoute(403, 'forbidden');
  return url;
}
async function body(request, maxBytes, allowEmpty = false, deadlineMs = 5000) {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) rejectRoute(400, 'invalid_request');
  const type = request.headers.get('content-type');
  if (type !== null && !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type)) rejectRoute(400, 'invalid_request');
  if (!request.body) { if (allowEmpty) return {}; rejectRoute(400, 'invalid_request'); }
  const reader = request.body.getReader(), chunks = []; let bytes = 0, timer, onAbort;
  const expired = new Promise((_, reject) => {
    const fail = () => reject(new ExpansionRouteError(400, 'invalid_request'));
    timer = setTimeout(fail, deadlineMs); onAbort = fail;
    request.signal.addEventListener('abort', onAbort, { once: true });
    if (request.signal.aborted) fail();
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), expired]); if (done) break;
      bytes += value.byteLength; if (bytes > maxBytes) rejectRoute(400, 'invalid_request');
      chunks.push(Buffer.from(value));
    }
  } finally { clearTimeout(timer); request.signal.removeEventListener('abort', onAbort); try { void reader.cancel().catch(() => {}); } catch {} try { reader.releaseLock(); } catch {} }
  if (!bytes && allowEmpty) return {};
  if (type === null) rejectRoute(400, 'invalid_request');
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    const parsed = JSON.parse(text);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw Error();
    // These HTTP contracts accept only flat objects. Scan the already-valid JSON
    // tokens as well, so duplicate (including escaped) keys cannot be hidden by
    // JSON.parse's last-value-wins behavior.
    const tokens = text.match(/"(?:\\.|[^"\\])*"|[^\s{},:]+/g) || [];
    if (tokens.length !== Object.keys(parsed).length * 2 || Object.values(parsed).some(value => value !== null && typeof value === 'object')) throw Error();
    const keys = tokens.filter((_, index) => index % 2 === 0).map(key => JSON.parse(key));
    if (new Set(keys).size !== keys.length) throw Error();
    return parsed;
  } catch { rejectRoute(400, 'invalid_request'); }
}
function callbackInput(url) {
  if (url.search.length > 8192) rejectRoute(400, 'invalid_request');
  const entries = [...url.searchParams.entries()];
  if (entries.length > 32 || entries.some(([key, value]) => key.length > 128 || value.length > 4096)) rejectRoute(400, 'invalid_request');
  for (const key of ['state', 'code', 'error']) {
    if (url.searchParams.getAll(key).length > 1) rejectRoute(400, 'invalid_request');
  }
  // RFC 6749 4.1.2 requires ignoring unknown response fields. They are bounded
  // above, then discarded: scope, session_state, next and returnUrl confer no
  // authority and can never change grant scope, identity or redirect target.
  const state = url.searchParams.get('state'), code = url.searchParams.get('code'), error = url.searchParams.get('error');
  if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state) || (code !== null) === (error !== null) ||
      (code !== null && (!code || code.length > 4096 || /[\x00-\x1f\x7f]/.test(code))) ||
      (error !== null && !/^[A-Za-z0-9_]{1,100}$/.test(error))) rejectRoute(400, 'invalid_request');
  // Description, URI and eBay's informational expires_in never leave this parser.
  return { state, authorizationCode: code ?? undefined, providerError: error ?? null };
}
function publicSummary(summary) {
  if (!summary || !safeId(summary.connectionId) || !['xero', 'ebay'].includes(summary.provider) ||
      !['production', 'sandbox'].includes(summary.environment) || !version(summary.version) ||
      !['available', 'refreshing', 'held', 'revoked'].includes(summary.status) || !['bound', 'unbound'].includes(summary.accountStatus) ||
      (summary.accountStatus === 'bound' ? !accountId(summary.providerAccountId) : summary.providerAccountId !== null)) rejectRoute(503, 'expansion_unavailable');
  return { connectionId: summary.connectionId, provider: summary.provider, environment: summary.environment, version: summary.version,
    status: summary.status, accountStatus: summary.accountStatus, providerAccountId: summary.providerAccountId, customerReady: false };
}
function publicAccounts(accounts) {
  if (!Array.isArray(accounts) || accounts.length > 1000) rejectRoute(503, 'expansion_unavailable');
  return accounts.map(account => {
    if (!accountId(account.accountId) || typeof account.label !== 'string' || account.label.length > 200 || /[\x00-\x1f\x7f]/.test(account.label)) rejectRoute(503, 'expansion_unavailable');
    return { accountId: account.accountId, label: account.label };
  });
}
export function createExpansionRoutes({ env, findUser, loadStores, listAccounts, bindAccount,
  beginConsent = beginProviderConsent, exchangeCode = exchangeProviderCode, clock = Date.now, rateLimit = /** @type {null|((action:string,tenantId:string)=>Promise<{allowed:boolean,retryAfterSeconds:number}>)} */(null), bodyReadTimeoutMs = 5000 }) {
  if (!Number.isInteger(bodyReadTimeoutMs) || bodyReadTimeoutMs < 1 || bodyReadTimeoutMs > 5000) throw new Error('Invalid body deadline');
  const protect = operation => async (request, id) => {
    try { return await operation(request, id); }
    catch (error) {
      const response=error instanceof ExpansionRouteError?json({error:error.code},error.status):json({error:'expansion_unavailable'},503);
      if(error instanceof ExpansionRouteError&&error.status===429&&Number.isSafeInteger(error.retryAfterSeconds)&&error.retryAfterSeconds>=1&&error.retryAfterSeconds<=3600)response.headers.set('Retry-After',String(error.retryAfterSeconds));
      return response;
    }
  };
  async function access(request, config, action) {
    if(typeof rateLimit!=='function')rejectRoute(503,'expansion_unavailable');
    const session = await authenticateExpansionSession(request, { secret: config.sessionSecret, findUser, clock });
    const verdict=await rateLimit(action,session.tenantId);
    if(!verdict||typeof verdict.allowed!=='boolean'||!Number.isSafeInteger(verdict.retryAfterSeconds)||verdict.retryAfterSeconds<0||verdict.retryAfterSeconds>3600||(!verdict.allowed&&verdict.retryAfterSeconds<1))rejectRoute(503,'expansion_unavailable');
    if(!verdict.allowed)throw Object.assign(new ExpansionRouteError(429,'try_again_later'),{retryAfterSeconds:verdict.retryAfterSeconds});
    return session;
  }
  const clientFor = (config, provider) => {
    if (!Object.hasOwn(config.clients, provider)) rejectRoute(404, 'not_found');
    return config.clients[provider];
  };
  async function connection(stores, session, connectionId, config) {
    const summary = await stores.tokenStore.getSummary({ tenantId: session.tenantId, connectionId });
    if (!summary || summary.tenantId !== session.tenantId || summary.connectionId !== connectionId) rejectRoute(404, 'not_found');
    const client = clientFor(config, summary.provider);
    if (client.environment !== summary.environment || client.clientId !== summary.clientId || authorizationBindingForClient(client) !== summary.authorizationBinding) rejectRoute(404, 'not_found');
    publicSummary(summary);
    return { summary, binding: Object.freeze({ tenantId: session.tenantId, connectionId: summary.connectionId, version: summary.version }) };
  }
  return Object.freeze({
    start: protect(async (request, provider) => {
      const config = readExpansionRouteConfig(env), client = clientFor(config, provider);
      const url = urlFor(request, config, `/api/expansion/oauth/${provider}/start`, 'POST');
      if (url.search || Object.keys(await body(request, 256, true, bodyReadTimeoutMs)).length) rejectRoute(400, 'invalid_request');
      const session = await access(request, config, 'start'), stores = await loadStores(session.tenantId);
      const result = await beginConsent({ ...session, provider: client.provider, environment: client.environment }, { client, store: stores.consentStore, now: clock() });
      // Only these public fields may cross the HTTP boundary.
      return json({ authorizationUrl: result.authorizationUrl, expiresAt: result.expiresAt, provider: client.provider, environment: client.environment });
    }),
    callback: protect(async (request, provider) => {
      const config = readExpansionRouteConfig(env), client = clientFor(config, provider);
      const url = urlFor(request, config, `/api/expansion/oauth/${provider}/callback`, 'GET'), input = callbackInput(url);
      const session = await access(request, config, 'callback'), stores = await loadStores(session.tenantId);
      try {
        const grant = await exchangeCode({ ...input, context: { ...session, provider: client.provider, environment: client.environment }, callbackUrl: client.callbackUrl },
          { client, store: stores.consentStore, clock });
        const stored = await stores.tokenStore.insertUnboundGrant(grant);
        if (!stored || stored.tenantId !== session.tenantId || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(stored.connectionId)) throw Error();
        return redirect(`${config.setupUrl}?connection=${encodeURIComponent(stored.connectionId)}`, client.provider);
      } catch {
        // State rejection, consent denial, transport and persistence failures all
        // land at the same fixed setup URL. No query/secret/error is reflected.
        return redirect(config.setupUrl, client.provider);
      }
    }),
    accounts: protect(async (request, connectionId) => {
      const config = readExpansionRouteConfig(env);
      if (!safeId(connectionId)) rejectRoute(400, 'invalid_request');
      const url = urlFor(request, config, `/api/expansion/connections/${encodeURIComponent(connectionId)}/accounts`, 'GET');
      if (url.search) rejectRoute(400, 'invalid_request');
      const session = await access(request, config, 'accounts'), stores = await loadStores(session.tenantId);
      const { summary, binding } = await connection(stores, session, connectionId, config);
      const discovered = await listAccounts(binding, { store: stores.tokenStore, clock });
      if (!discovered || discovered.connectionId !== binding.connectionId || discovered.version !== binding.version || discovered.provider !== summary.provider) rejectRoute(503, 'expansion_unavailable');
      return json({ connection: publicSummary(summary), accounts: publicAccounts(discovered.accounts) });
    }),
    bind: protect(async (request, connectionId) => {
      const config = readExpansionRouteConfig(env);
      if (!safeId(connectionId)) rejectRoute(400, 'invalid_request');
      const url = urlFor(request, config, `/api/expansion/connections/${encodeURIComponent(connectionId)}/bind`, 'POST');
      if (url.search) rejectRoute(400, 'invalid_request');
      const selected = await body(request, 1024, false, bodyReadTimeoutMs);
      if (Object.keys(selected).sort().join(',') !== 'accountId,version' || !accountId(selected.accountId) || !version(selected.version)) rejectRoute(400, 'invalid_request');
      const session = await access(request, config, 'bind'), stores = await loadStores(session.tenantId);
      const { summary, binding } = await connection(stores, session, connectionId, config);
      if (selected.version !== binding.version) rejectRoute(409, 'connection_changed');
      const bound = await bindAccount(binding, selected.accountId, { store: stores.tokenStore, clock });
      const idempotent = summary.accountStatus === 'bound' && summary.providerAccountId === selected.accountId && bound?.version === binding.version;
      if (!bound || bound.tenantId !== session.tenantId || bound.connectionId !== connectionId || (!idempotent && bound.version !== binding.version + 1) ||
          bound.provider !== summary.provider || bound.environment !== summary.environment || bound.accountStatus !== 'bound' || bound.providerAccountId !== selected.accountId) rejectRoute(503, 'expansion_unavailable');
      return json({ connection: publicSummary(bound) });
    }),
    status: protect(async (request, connectionId) => {
      const config = readExpansionRouteConfig(env);
      if (!safeId(connectionId)) rejectRoute(400, 'invalid_request');
      const url = urlFor(request, config, `/api/expansion/connections/${encodeURIComponent(connectionId)}`, 'GET');
      if (url.search) rejectRoute(400, 'invalid_request');
      const session = await access(request, config, 'status'), stores = await loadStores(session.tenantId);
      const { summary } = await connection(stores, session, connectionId, config);
      return json({ connection: publicSummary(summary) });
    }),
  });
}
