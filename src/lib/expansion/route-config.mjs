/** Server-owned, default-off OAuth configuration. Never accept any of these
 * values from a request, Host header, query parameter or browser storage. */
export class ExpansionRouteError extends Error {
  constructor(status, code) { super(code); this.name = 'ExpansionRouteError'; this.status = status; this.code = code; }
}
export const rejectRoute = (status, code) => { throw new ExpansionRouteError(status, code); };
const configurationError = () => rejectRoute(503, 'expansion_unavailable');
const safe = (value, max = 4096) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\s\x00-\x1f\x7f]/.test(value);
const secret = value => safe(value) && value.length >= 32;
export function readExpansionRouteConfig(env) {
  // Inspect the kill switch before even parsing the remaining configuration.
  if (env.EXPANSION_OAUTH_ENABLED !== 'true') rejectRoute(404, 'not_found');
  // An operator must verify platform/edge/drain handling separately; this
  // marker is a rollout attestation, not a claim that app code scrubs those logs.
  if(env.EXPANSION_QUERY_LOG_POLICY_VERIFIED!=='true')configurationError();
  if (env.NODE_ENV !== 'production' || !secret(env.NEXTAUTH_SECRET) || !secret(env.ENCRYPTION_KEY)) configurationError();
  let origin;
  try {
    const value = new URL(env.EXPANSION_APP_ORIGIN);
    if (value.protocol !== 'https:' || value.origin !== env.EXPANSION_APP_ORIGIN || value.username || value.password) configurationError();
    origin = value.origin;
  } catch { configurationError(); }
  // A production origin inherited by a preview is never sufficient permission.
  if ((env.VERCEL_ENV === 'preview' && env.EXPANSION_OAUTH_PREVIEW_ORIGIN !== origin) ||
      (env.VERCEL === '1' && !['production', 'preview'].includes(env.VERCEL_ENV))) configurationError();
  const clients = {};
  for (const provider of ['ebay', 'xero']) {
    const prefix = `EXPANSION_${provider.toUpperCase()}_`;
    if (env[prefix + 'ENABLED'] !== 'true') continue;
    const environment = provider === 'xero' ? 'production' : env[prefix + 'ENVIRONMENT'];
    const callbackUrl = `${origin}/api/expansion/oauth/${provider}/callback`;
    const clientId = env[prefix + 'CLIENT_ID'], clientSecret = env[prefix + 'CLIENT_SECRET'];
    if (!safe(clientId, 512) || clientId.includes(':') || !safe(clientSecret) || env[prefix + 'CALLBACK_URL'] !== callbackUrl ||
        !['production', ...(provider === 'ebay' ? ['sandbox'] : [])].includes(environment)) configurationError();
    const ruName = provider === 'ebay' ? env[prefix + 'RU_NAME'] : undefined;
    if (provider === 'ebay' && (!safe(ruName, 512) || !/^[A-Za-z0-9_-]+$/.test(ruName))) configurationError();
    const scopes = provider === 'xero' ? ['accounting.settings.read', 'offline_access'] : [
      'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
    ];
    clients[provider] = Object.freeze({ provider, environment, clientId, clientSecret, callbackUrl,
      allowedCallbacks: Object.freeze([callbackUrl]), scopes: Object.freeze(scopes), ...(ruName ? { ruName } : {}) });
  }
  if (!Object.keys(clients).length) configurationError();
  return Object.freeze({ origin, sessionSecret: env.NEXTAUTH_SECRET, clients: Object.freeze(clients),
    setupUrl: `${origin}/settings/connections` });
}
