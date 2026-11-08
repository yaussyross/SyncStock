# Expansion OAuth setup boundary

These routes are **disabled by default**. No configuration, provider authorization,
production migration, deployment, or customer rollout is performed by this change.
The isolated setup page is `/settings/connections`; it does not modify navigation.

## Server configuration

Set these only through the approved server configuration process, after reviewing
provider registrations and applying the consent/grant/account-binding/route-limiter migrations.
Do not put any value in `NEXT_PUBLIC_*`, browser storage, source control, or logs.

| Variable | Required value / purpose |
| --- | --- |
| `EXPANSION_QUERY_LOG_POLICY_VERIFIED` | Exact `true` is an explicit deployment-operator attestation that source-side callback/query logging policy was verified for this project, deployment, environment and origin. It is not technical proof or a redaction implementation. Do not inherit it into previews without verification. |
| `EXPANSION_OAUTH_ENABLED` | Exact `true` enables the HTTP boundary; otherwise every API returns 404 before initialization or queries. |
| `NODE_ENV` | Must be `production`, so the existing session issuer uses Secure, HttpOnly cookies. |
| `EXPANSION_APP_ORIGIN` | Exact HTTPS origin with no trailing slash, path, credentials, query, or fragment. |
| `NEXTAUTH_SECRET` | Existing SyncStock JWT key, at least 32 non-whitespace characters. |
| `ENCRYPTION_KEY` | Existing authenticated-encryption key, at least 32 non-whitespace characters. |
| `EXPANSION_OAUTH_PREVIEW_ORIGIN` | Additionally required when `VERCEL_ENV=preview`; must exactly equal the explicitly permitted app origin. A production origin inherited by a preview is insufficient. |
| `EXPANSION_XERO_ENABLED` | Exact `true` to configure Xero. |
| `EXPANSION_XERO_CLIENT_ID` | Server-owned Xero confidential application identifier. |
| `EXPANSION_XERO_CLIENT_SECRET` | Server-owned Xero confidential application secret. |
| `EXPANSION_XERO_CALLBACK_URL` | Exact `<EXPANSION_APP_ORIGIN>/api/expansion/oauth/xero/callback`, registered with Xero. |
| `EXPANSION_EBAY_ENABLED` | Exact `true` to configure eBay. |
| `EXPANSION_EBAY_ENVIRONMENT` | Exact `production` or `sandbox`. |
| `EXPANSION_EBAY_CLIENT_ID` | Server-owned eBay application identifier. |
| `EXPANSION_EBAY_CLIENT_SECRET` | Server-owned eBay confidential application secret. |
| `EXPANSION_EBAY_RU_NAME` | Registered RuName for the configured environment; not a callback URL. |
| `EXPANSION_EBAY_CALLBACK_URL` | Exact `<EXPANSION_APP_ORIGIN>/api/expansion/oauth/ebay/callback`, corresponding to that RuName. |

At least one provider must be enabled and completely configured. Any enabled
provider's incomplete configuration fails closed. Vercel deployment types other
than production or explicitly permitted preview fail closed. Application IDs,
secrets and RuNames must pass the boundary's character/size validation.

Scopes are code-owned and cannot be expanded by environment values or browser
claims. Xero uses `accounting.settings.read offline_access`. eBay uses
`https://api.ebay.com/oauth/api_scope/commerce.identity.readonly` and
`https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly`.
The eBay identity scope requires provider partner access; a successful OAuth
response alone is not proof that identity discovery is available. eBay sandbox
identity responses are mock data and cannot authorize an account binding.

## HTTP contract

- `POST /api/expansion/oauth/{provider}/start`: exact same-origin request and
  existing SyncStock web session required. Empty body or `{}` only. Returns a
  safe authorization URL, never a client secret or token.
- `GET /api/expansion/oauth/{provider}/callback`: one-time state bound to provider,
  environment, application, current tenant, and hashed web session. Duplicate
  security fields fail closed. Bounded unknown response parameters are ignored
  per RFC 6749; scope, session_state, next and returnUrl never grant authority.
- Xero success and handled exchange/consent failures use an empty-body 302, following its API consumer security standard. eBay retains an empty-body 303. Preflight/authentication/configuration failures remain generic non-HTML JSON with no-store/no-referrer headers.
- Success redirects only to `/settings/connections?connection=<stored UUID>` on
  the configured origin. Provider denial, bad state, or exchange/persistence
  failure redirects to the same fixed setup path without a query. Earlier
  configuration/auth/storage-readiness failures return a generic status response.
- `GET /api/expansion/connections/{connectionId}`: owner-scoped status.
- `GET /api/expansion/connections/{connectionId}/accounts`: owner-scoped authorized
  account discovery. No provider/token/account mutation; it reserves authenticated usage in the shared limiter. There is no implicit token refresh or binding side effect.
- `POST /api/expansion/connections/{connectionId}/bind`: exact same-origin JSON
  `{accountId, version}`, no extra or duplicate fields. Reads the server's current
  version, rediscovers authorized accounts, and performs the store's atomic bind.

The app uses issuer `syncstock`, algorithm `HS256`, a current existing User and the
`session` cookie only. Bearer, Shopify ID-token, mobile, browser user-ID, and query
credential fallbacks are not supported. Routes never derive a callback from Host.
Existing connection reads/binds also require the configured client ID and full
authorization fingerprint to match the stored grant. App/scopes/callback changes
require fresh consent; secret rotation alone does not change that identity. Both
storage schemas are read-probed before state creation/consumption or token
exchange. Failures are generic and never log provider data. All handler responses
are no-store and no-referrer; infrastructure access logs must separately redact
OAuth query strings before any rollout.

No route enables posting, syncing, or customer readiness. The returned
`customerReady` remains false after binding.

## Verification and remaining limits

The dependency-injected HTTP tests cover default-off no-query behavior, strict
configuration/preview rules, web-cookie authentication, CSRF, cross-tenant access,
callback replay/concurrency/session mismatch/denial, current application binding,
secret rotation, real-store idempotent rebinding, secret redaction, fixed
redirects, ancillary parameter safety, duplicate JSON, stale bind revisions,
5-second/abort-aware body limits, and safe response projections.

The setup UI uses a synchronous action lock against repeated clicks, clears
selection when the connection changes, requires explicit account loading and
selection, and tells users to reload after stale-version failures. Requests are
bounded to 20 seconds with no automatic retry. A failed or cancelled callback has
no returned connection ID. These UI behaviors were code-reviewed; **no browser
visual or interactive QA has been performed**. Server rendering/build and HTTP
smoke tests do not replace that QA.

Every enabled route now requires a shared PostgreSQL limiter. There is no local-memory or permissive failure fallback. The runtime lazily loads the limiter only after enabled configuration and valid web-session authentication. The limiter receives an action and authenticated tenant ID, never state/code/token values. Quota denial returns 429 plus bounded numeric Retry-After; storage failure returns generic 503 before consent/grant/provider work. The UI reports the wait without automatically retrying.

Fixed windows use database time: start 10/15 minutes, callback 30/15 minutes, account discovery 30/5 minutes, bind 10/5 minutes, status 120/5 minutes per tenant. Atomic upserts serialize contention, counters saturate, and a backward clock never resets a newer window. There is one row per tenant/action, removed by user deletion. These are fixed windows, not sliding windows, and boundary bursts are possible. The application wait is bounded to 1.5 seconds; transaction acquisition, transaction, statement and lock timeouts also bound database work. Unknown outcomes can consume a quota slot but never admit the request.

This protects authenticated operations, not malformed/unauthenticated traffic, nor the existing-user lookup before reservation. Edge/WAF protection is still required. The new limiter migration is staged, and its real PostgreSQL concurrency/timeout checks must pass before rollout.

[Logging safety](logging-safety.md) documents application and infrastructure boundaries. Routes remain silent. Optional logging must use the enum-only projection without extra raw arguments. Platform access/runtime/trace/drain query capture must be verified before source-side storage; app response headers and the attestation flag do not redact upstream logs.

Tests use synthetic sessions, accounts, in-memory stores and stubbed provider
responses. No live provider calls, real credentials, or real user grants were used.

## Database-role gate (November 8 draft)

Every authenticated expansion route now requires a fresh bounded database-security
preflight before quota, consent/grant access or provider work. A missing/unsafe
inspection returns the generic unavailable response. Configuration flags alone
are insufficient. See [database-security-preflight.md](database-security-preflight.md).
No production role or permission is changed by this implementation.
