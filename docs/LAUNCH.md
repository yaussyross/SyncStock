# SyncStock launch record

Last verified: **September 17, 2026**

Canonical repository: https://github.com/yaussyross/SyncStock
Production app: https://sync-stock-six.vercel.app
Founding pricing: **Solo $8/month**, **Scale $29/month**, **Empire $49/month**. New accounts receive 20 synced orders free with no card required.

## Verified current state

- PR #9 completed the isolated Shopify → QuickBooks acceptance work and was merged as `178bfae7e7c68dcff65379ad5903e5e43fce6a24`.
- PR #11 moved new merchant subscriptions from off-platform Stripe checkout to Shopify-hosted App Pricing and was merged as `3c98f0fca9cd30a8135c67d58837ecfe311754c3`.
- CI on `3c98f0fc` passed Prisma validation/migrations, schema drift, reconciliation, core security/quota, legacy billing ordering/concurrency, Shopify App Pricing catalog mapping, and the production build.
- The correct Vercel project is `raus2/sync-stock`. Production deployment `dpl_DhZZArneiNwKaSytWjf5EWDnNLVv` for `3c98f0fc` is READY and serves `https://sync-stock-six.vercel.app`.
- The production landing page and signup page return HTTP 200. Vercel reported no runtime error clusters in the checked post-release window.
- The production queue probe at `/api/health/queue` returns HTTP 200 with an authenticated queue bridge.
- Railway production has persistent Redis and worker services and the production bridge is operational. The currently deployed worker behavior remains compatible with the release; the isolated-sandbox worker delta is guard-only for normal production behavior.
- Supabase project `shopify-qbo-sync` is `ACTIVE_HEALTHY`; the latest checked Supabase security-advisor result contained no lints.
- Production QuickBooks OAuth generates an Intuit authorization redirect using `https://sync-stock-six.vercel.app/api/auth/qbo/callback`.
- New public-app merchant billing now fails closed until Shopify App Pricing is configured. Normal customer-facing upgrade actions no longer create Stripe subscriptions. Existing Stripe records/portal support remain only for legacy migration safety.
- Metricool has active organic publishing connections for the launch brand. No paid advertising spend has been authorized or committed.

## Verified isolated provider acceptance — September 16, 2026

The disposable sandbox was isolated from production data and queues and used its own PostgreSQL, Redis, signing configuration, Shopify development store, and QuickBooks sandbox company.

Acceptance record:

- Shopify development store OAuth connected successfully for `test-wc9egg3y.myshopify.com`.
- QuickBooks sandbox OAuth connected successfully.
- One normal `$10.00` Shopify test product was mapped to a QuickBooks item.
- Shopify test order **#1004** was marked paid with quantity 1, no tax, no discount, and no shipping.
- Shopify delivered the paid-order webhook and SyncStock returned HTTP 200.
- The worker processed order #1004 successfully.
- Reconciliation recorded Shopify `USD 10.00`, Draft QBO `10.00`, Actual QBO `10.00`, Delta `0.00`.
- Trial usage incremented exactly once from `0/20` to `1/20`.
- Retrying an already-successful order is rejected with HTTP 409, and the worker short-circuits a successful SyncLog with an existing QuickBooks transaction ID.
- No real customer order, customer accounting company, or customer charge was used.
- Temporary credential diagnostics were removed before merge.

This completes the original one-order end-to-end sandbox acceptance gate. Do not reopen it as an unresolved blocker unless new evidence shows a regression.

## Remaining launch gates

These items are **not yet verified** and must not be described as complete.

### 1. Shopify public distribution / App Store approval

Unrelated merchant stores require the production SyncStock app to use Shopify's public distribution path and complete the applicable app review. The connected tools cannot inspect or change this Partner/Dev Dashboard state.

Developer dashboard: https://dev.shopify.com/dashboard

If Shopify requests the one-time Partner/App Store registration fee, stop before payment. Any fee or other cash outflow requires explicit owner approval.

### 2. Shopify App Pricing production configuration

Code support is deployed, but the production environment still needs the owner-controlled Shopify Partner values for the production app:

- `SHOPIFY_APP_HANDLE`
- `SHOPIFY_APP_GID`
- `SHOPIFY_PARTNER_ORG_ID`
- `SHOPIFY_PARTNER_API_ACCESS_TOKEN`

The Partner API client must have the permission required to read/manage the production app's billing state. Configure Shopify-hosted plans matching the canonical catalog: Solo `$8` every 30 days, Scale `$29` every 30 days, Empire `$49` every 30 days. Do not set `BILLING_PROVIDER=stripe_legacy` for new public-app billing.

After these are configured, use an authorized development/test merchant or Shopify-supported test plan to verify plan selection and Active Subscription refresh without creating an unauthorized real charge.

### 3. Broader beta accounting cases

The narrow paid-order acceptance passed. Before representing the product as broadly production-proven, exercise supported shipping/discount/tax combinations, unmapped-product handling, QuickBooks failure/rollback, expired OAuth, uninstall, and refund/cancellation review behavior. Unsupported accounting cases should remain blocked or visibly queued for review rather than silently written.

### 4. Business/support details

Terms, privacy, feedback, and a support contact route are present on the production site. Confirm the final operating/legal business identity and that `support@syncstock.app` is actually monitored before broad paid acquisition or App Store submission.

## First-customer operating target

Prioritize an owner-operated Shopify store already using QuickBooks Online, roughly 50–200 paid orders per month, whose bookkeeping workflow genuinely calls for individual sales receipts. Qualify the workflow before taking live books. Do not market SyncStock as payout reconciliation, inventory synchronization, or complete bookkeeping.

Current founding offer:

- First 20 synced orders: free, no card required.
- Solo: **$8/month** for up to 200 orders/month.
- Scale: **$29/month** for up to 1,000 orders/month.
- Empire: **$49/month** for unlimited orders.

Until Shopify public distribution is approved, describe acquisition as founding-beta recruitment / early-access onboarding rather than implying any unrelated merchant can immediately install the app.

Merchant outreach copy:

> Still entering Shopify orders into QuickBooks one at a time? SyncStock is a founding beta focused on individual paid-order receipts, explicit product mapping, reconciliation checks, and duplicate-safe retries. The core Shopify → QuickBooks sandbox flow has passed end to end. We're recruiting early merchants while Shopify public distribution is completed. The first 20 synced orders are free; Solo is $8/month after launch approval. Would you be open to a short beta walkthrough?

Bookkeeper outreach copy:

> SyncStock is a focused Shopify → QuickBooks founding beta for small merchants whose workflow calls for individual sales receipts. It maps variants, checks totals before writing, and keeps retry state visible. The core sandbox flow has passed end to end; refunds/cancellations remain review-driven and payout reconciliation is not the product. We're recruiting early feedback while Shopify public distribution is completed. Would you review the workflow for fit with any smaller Shopify clients?

Do not fabricate users, revenue, testimonials, savings, scarcity, or production capabilities that have not been verified.

## Paid acquisition rule

No paid-ad budget is approved by default. Organic publishing and zero-cost outreach may continue. Any ad campaign activation, boost, Shopify registration fee, or other cash outflow requires explicit owner approval before execution.
