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
- Single-use state and PKCE helpers with a required injected atomic consent store. No in-memory store is installed for production.
- `read-client.mjs`: real GET-only HTTP transport for the existing eBay, QBO and Xero origin guards, with immutable credential binding across pages, no redirects, bounded retry/time/page/byte/record limits, strict JSON, explicit end-of-pages, error redaction and no partial result on failure. Token exchange, refresh and persistence are not provided.
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
2. Real shared consent storage, provider-specific OAuth/token refresh routes and encrypted credential lifecycle.
3. Native authenticated financial ingestion for Amazon, eBay, Etsy, Walmart and TikTok Shop. The existing Shopify financial path is separate. The eBay operational read is not a financial ingester.
4. Verified mapping, tax/FX/period rules and authoritative source ownership from real merchant data.
5. Durable cross-worker accounting intent, uniqueness, unknown-outcome reconciliation and destination write transport. In-memory comparisons are not durable deduplication.
6. Complete provider deletion/revocation handling, including eBay signature verification and scoped audited erasure.
7. New source-to-destination sandbox acceptance, exact-head CI, deployment, customer onboarding and live connection validation.

Therefore **0 new expansion experiences are customer-ready**. The historical Shopify → QuickBooks $10 sandbox acceptance is separate and does not validate this change. Provider review is not the only remaining blocker.

## Validation record

- 339 offline tests pass, including provider-shaped fixtures, all 16 local pipeline paths, accounting safety, timeout bounds, replay provenance, account rebinding and cross-provider token-leak prevention.
- Production build and TypeScript no-emit check pass with dummy local CI configuration.
- No provider credential, customer record or accounting transaction was used in these tests.
- Database migration/billing/redaction integration checks are not run locally because this workspace has no disposable PostgreSQL service; unchanged existing CI runs them on the draft PR.
- Two existing reviewer videos were absent from this local reconstructed snapshot. The remote tree retains them unchanged.

## References

- eBay Fulfillment getOrders: https://developer.ebay.com/api-docs/sell/fulfillment/resources/order/methods/getOrders
- Xero official OpenAPI, Accounts GET and accounting.settings.read: https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero_accounting.yaml
- Intuit query-response definitions: https://static.developer.intuit.com/sdkdocs/qbv3doc/ippdotnetdevkitv3/html/b0c8c660-75a5-7f28-8755-97abaf8e7574.htm
- eBay deletion guide: https://developer.ebay.com/develop/guides/sell/marketplace-user-account-deletion
- PayPal Transaction Search: https://developer.paypal.com/api/transaction-search/v1/search-get

Provider-shaped fixture tests are not provider acceptance. Public documentation and schemas can change; verify the actual responses under the authorized account before enabling any financial path.
