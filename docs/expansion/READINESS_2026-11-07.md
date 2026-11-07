# Expansion implementation and release gates

Base: `7b61a906e03efa0a5d48eb239b8cecf0e33b3027`. This change is a draft engineering increment. It does not enable, merge, deploy, register provider apps, connect accounts, or change the existing Shopify → QuickBooks worker.

## Verified scope

There are 16 connection experiences: Amazon, Shopify, eBay, Etsy, Walmart, TikTok Shop and PayPal to QuickBooks Online or Xero, plus multichannel aggregation to each destination. This is seven source providers, not 16 separate provider accounts.

The recovered isolated work is now packaged under `src/lib/expansion`. One command runs safety, normalization, accounting and integration tests:

```sh
npm run test:expansion
npm run expansion:preflight
```

Preflight deliberately exits 2 while the required trusted acceptance evidence is absent. Its output is an evidence-gate result, not proof that it contacted a provider. Caller JSON cannot satisfy the trusted-verifier requirement.

### Implemented locally

- Default-off 16-path registry. Acceptance binds environment, internal tenant, source account, destination account, mapping revision and, for multichannel, the exact channel membership. Reconnects or mapping changes invalidate prior acceptance.
- Single-use state and PKCE helpers with an encrypted PostgreSQL consent store. `createPrismaConsentStore()` binds every encrypted record to its hashed state, authenticated User ID and expiry, consumes it atomically and cascades cleanup when its user is deleted. No in-memory store is installed for production. The additive migration is staged only, never applied to production by this change.
- `read-client.mjs`: real GET-only HTTP transport for the existing eBay, QBO and Xero origin guards, with immutable credential binding across pages, no redirects, bounded retry/time/page/byte/record limits, strict JSON, explicit end-of-pages, error redaction and no partial result on failure. Token handling is separate from this read-only client.
- `provider-oauth.mjs`: native confidential-app eBay and Xero authorization, one-shot code exchange and refresh primitives, with fixed provider endpoints, explicit read-only scopes, app-bound single-use state, bounded response/deadline handling and sanitized errors. Encrypted bearer-token persistence and durable refresh coordination are implemented separately below. Provider-account identity and deployed HTTP routes remain required.
- `native-reads.mjs`: native Xero chart-of-accounts and eBay operational-order readers. Xero strips bank account numbers and balances and does not invent account mapping. eBay retains only order ID and operational status; it does not classify orders as settled revenue. The strict eBay decoder holds changes in totals, missing pages, warnings and changed query windows.
- Seven readers for the internal SyncStock Evidence v1 schema. These are not seven native provider response parsers. The narrow PayPal T0006 report parser is separate and requires explicit financial-date, zero-tax and fee evidence.
- `pipeline.mjs`: one bounded, tenant-scoped evidence-to-accounting-preview path for all 16 experiences. It rejects a whole batch on invalid evidence, source overlap, changed replay content, changed mappings or tenant mismatch.
- Exact-cent USD/no-tax local QuickBooks journal previews and Xero draft payloads. No accounting API is called. Replay identity includes economic provenance, not only rendered amounts. Narrow explicit debit/credit roles reject unsupported accounting patterns.
- eBay deletion challenge and injectable intake contract only. It is not a registered compliance endpoint, a signature-verification implementation, or an erasure worker.

### What a real read requires

Trusted server code must resolve a credential record from an authorized connection with these exact fields: provider, environment, internal tenant ID, immutable provider account ID and access token. Never accept that record from browser JSON or put it in command-line arguments, logs, fixtures or chat. No test token in this change is valid with a provider.

The native readers may then be called from that trusted server integration:

```js
const result = await readXeroAccounts(binding, { credential });
const result = await readEbayOrders(binding, {
  credential,
  createdFrom: '2026-11-01T00:00:00.000Z',
  createdTo: '2026-11-02T00:00:00.000Z',
});
```

The Xero organization must be explicitly selected from the authorized grant; its API origin is production even for a demo organization. eBay requires the appropriate seller read grant and provider app access. A connection probe must not silently upgrade scopes, reuse another merchant's token, or alter the Shopify reviewer sandbox. Neither reader installs a public HTTP endpoint.

### Not completed

1. Provider account creation, approved app registrations, merchant grants and secured credential provisioning for the expansion.
2. Deployed OAuth/token refresh routes and encrypted credential lifecycle. Narrow eBay/Xero exchange/refresh primitives are implemented, but an exclusive durable refresh claim, encrypted token-pair storage and compare-and-swap revision are now implemented in a staged database adapter. Provider-account binding, approved migration/deployment and real acceptance remain required. Shared encrypted consent storage is implemented, but its migration, expiration-cleanup schedule and authorized routes must be deployed deliberately before use.
3. Native authenticated financial ingestion for Amazon, eBay, Etsy, Walmart and TikTok Shop. The existing Shopify financial path is separate. The eBay operational read is not a financial ingester.
4. Verified mapping, tax/FX/period rules and authoritative source ownership from real merchant data.
5. Durable cross-worker accounting intent, uniqueness, unknown-outcome reconciliation and destination write transport. In-memory comparisons are not durable deduplication.
6. Complete provider deletion/revocation handling, including eBay signature verification and scoped audited erasure.
7. New source-to-destination sandbox acceptance, exact-head CI, deployment, customer onboarding and live connection validation.

Therefore **0 new expansion experiences are customer-ready**. The historical Shopify → QuickBooks $10 sandbox acceptance is separate and does not validate this change. Provider review is not the only remaining blocker.

## Validation record

- 475 offline tests pass, including provider-shaped fixtures, all 16 local pipeline paths, accounting safety, timeout bounds, replay provenance, account rebinding, cross-provider token-leak prevention and encrypted consent-store tests.
- Production build and TypeScript no-emit check pass with dummy local CI configuration.
- No provider credential, customer record or accounting transaction was used in these tests.
- Database migration/billing/redaction integration checks are not run locally because this workspace has no disposable PostgreSQL service. The preceding consent-store head passed the full CI and 10 database groups. This increment adds application-binding persistence to an 11-group database suite, which must pass again on the final head.
- Two existing reviewer videos were absent from this local reconstructed snapshot. The remote tree retains them unchanged.

## References

- eBay Fulfillment getOrders: https://developer.ebay.com/api-docs/sell/fulfillment/resources/order/methods/getOrders
- Xero official OpenAPI, Accounts GET and accounting.settings.read: https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero_accounting.yaml
- Intuit query-response definitions: https://static.developer.intuit.com/sdkdocs/qbv3doc/ippdotnetdevkitv3/html/b0c8c660-75a5-7f28-8755-97abaf8e7574.htm
- eBay deletion guide: https://developer.ebay.com/develop/guides/sell/marketplace-user-account-deletion
- PayPal Transaction Search: https://developer.paypal.com/api/transaction-search/v1/search-get

Provider-shaped fixture tests are not provider acceptance. Public documentation and schemas can change; verify the actual responses under the authorized account before enabling any financial path.

## Encrypted consent-store integration

`src/lib/expansion/prisma-consent-store.ts` supplies the existing authenticated-encryption implementation and shared Prisma client. It is a server adapter only, with no public route. Its table has a primary-key state hash, encrypted envelope, authenticated User ID and expiry. PKCE verifier and session hash are encrypted. Raw state, browser session ID, authorization code, access token and refresh token are not stored.

- `insert` rejects expired, future-issued, malformed and overlong records and never overwrites an existing state.
- `take` atomically deletes and returns a record. Missing or expired state returns null. Invalid ciphertext or changed owner/key/expiry is consumed and held, never retried as valid.
- `cleanupExpired(limit)` removes at most 1000 expired records per call. There is no automatic scheduler in this increment; a production retention job remains required.
- `revokeTenant(userId)` removes pending consents for exactly one user. The foreign key also cascades deletion with that user, including the existing verified shop-redaction path.

The PostgreSQL smoke test refuses to use app credentials or a nonlocal database and needs explicit `SYNCSTOCK_EXPANSION_TEST_DATABASE_URL`. It checks two independent Prisma clients racing to consume one state, unique state keys, encrypted storage, wrong-owner rejection, metadata tampering, expiry, bounded cleanup, tenant revocation, account-deletion cascade and foreign-key enforcement. Only fictional test users and codes are used.

## Native OAuth transport increment

`beginProviderConsent` constructs the official authorization URL and stores a fingerprint of the provider, environment, client ID, registered callback, eBay RuName and exact scope set inside the encrypted one-time consent. Secret rotation does not invalidate app identity. `exchangeProviderCode` consumes that state before any token request. A generic consent without this binding cannot authorize the exchange.

- eBay production and sandbox have separate authorization/token hosts. `redirect_uri` is the registered RuName, not the browser callback URL. Supported scope is `sell.fulfillment.readonly`. Authorization codes are limited to the documented 1024 characters. The response uses `User Access Token`; the access token is subsequently sent as HTTP Bearer. Initial refresh expiry is required. Refresh retains the original refresh credential and never extends its original expiry.
- Xero uses production hosts even with a Demo Company. Supported scopes are `accounting.settings.read offline_access`, with no new transaction-write grant. Standard confidential Auth Code apps use Basic client authentication. PKCE is a separate Xero app flow and is not silently mixed into this implementation.
- OAuth token types are matched case-insensitively. Unexpected scopes, missing credentials, malformed lifetimes, oversized bodies, changed endpoints, redirects and invalid responses fail closed. Tokens and provider error descriptions never appear in errors.
- Every exchange/refresh is one request with no automatic retries. Network loss, timeout or an invalid success response is an unknown token outcome, not proof of rejection. Xero documents a 30-minute old-refresh-token recovery grace period; any deliberate recovery belongs in a serialized durable coordinator. This primitive does not exercise it automatically.
- `refreshProviderTokens` requires an exact trusted tenant/connection/revision/app binding and returns `expectedVersion` for the caller's atomic compare-and-swap. It does not implement a database lock or persist the replacement. The caller must exclusively claim the refresh before invocation and atomically encrypt/store both tokens before releasing that claim. A persistence failure must hold the connection for reconciliation or renewed consent.
- Code-exchange output is explicitly `account_binding_required` and `customerReady:false`. It contains secrets for trusted server storage only, and must never be logged, returned to browser JSON, or accepted as proof of provider-account identity. No real exchange or refresh has been performed.

Official contracts checked November 7, 2026:
- eBay authorization and refresh: https://developer.ebay.com/develop/guides/sell/authorization#the-authorization-code-grant-flow
- eBay application credentials / RuName: https://developer.ebay.com/api-docs/static/oauth-credentials.html
- Xero confidential OAuth and rotation: https://developer.xero.com/documentation/guides/oauth2/auth-flow/
- Xero PKCE app distinction: https://developer.xero.com/documentation/guides/oauth2/pkce-flow/
- Xero scopes and the 2026 granular-scope transition: https://developer.xero.com/documentation/guides/oauth2/scopes/ and https://developer.xero.com/faq/granular-scopes

The focused provider suite contains 68 synthetic tests. The full offline suite at that checkpoint had 434 tests; the PostgreSQL suite now has 11 groups. These are engineering checks, not provider acceptance or customer readiness.

## Encrypted token storage and durable refresh coordination

The new `ExpansionOAuthGrant` migration is staged only. `createPrismaTokenStore()` supplies the shared Prisma client and existing AES-256-GCM encryption. `refreshStoredConnection()` coordinates the existing provider transport with this store. No route imports this coordinator and no provider grant was provisioned.

- A successful code exchange gets a stable `grantId`. Persisting that exact result is idempotent, including when an INSERT succeeded but its response was lost. No insertion overwrites an existing connection.
- Access and refresh tokens are encrypted together in an envelope bound to connection ID, tenant, provider/environment, client ID, authorization configuration, revision and the initial refresh fingerprint. Neither secret is stored in a plaintext column or returned in summaries.
- Unique current and immutable initial refresh fingerprints reject duplicate grant storage, including replay of the original exchange result after rotation or revoke. These SHA-256 fingerprints cover provider, environment, client ID and the high-entropy token; they are not bearer credentials. They do not claim to retain a ledger of every intermediate retired token.
- A refresh claim atomically compares tenant, connection, revision, available state and ciphertext. Exactly one worker gets the credential. The opaque claim token is hashed at rest. Another worker cannot acquire it, and elapsed time never makes it reusable.
- Replacement validates provider-specific rotation and account/app binding, then atomically compares the claim and stores the encrypted token pair with a new revision. No in-memory lock or distributed lease stealing is used.
- Unknown provider outcomes, failed encryption or uncertain persistence leave a held or in-flight connection. A successful DB commit with a lost response retains the newer encrypted pair; old revisions cannot overwrite it. The caller must inspect the stored revision before any further attempt.
- The stale-claim sweep is bounded and can only move abandoned claims to held, never back to available. No automatic production schedule is installed.
- Revocation removes ciphertext, invalidates the claim and advances the revision. Initial/current fingerprints remain to reject replay until user deletion. User deletion cascades all grant rows. Late refresh work cannot recreate or overwrite revoked/deleted connections.
- Stored grants remain `accountStatus:unbound` and `customerReady:false`. Available/refreshing/held/revoked describe token lifecycle, not accepted provider-account identity. Account binding and authenticated server routes are still missing.

Validation for this increment: 41 new offline tests, 475 total offline tests, TypeScript validation and independent safety review. The additional PostgreSQL test has 12 groups, including separate-client claim contention, idempotent inserts, encrypted replacement, wrong-tenant isolation, tamper rejection, held states and revoke/delete races. Only explicit disposable local test databases and synthetic tokens are accepted by that script. Exact-head CI must pass before calling the migration verified; production execution is not part of this change.
