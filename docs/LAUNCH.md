# SyncStock launch record

Last verified: **September 17, 2026**

Canonical repository: https://github.com/yaussyross/SyncStock
Production app: https://sync-stock-six.vercel.app
Founding pricing: **Solo $8/month**, **Scale $29/month**, **Empire $49/month**. New accounts receive 20 synced orders free with no card required.

## Verified current state

- PR #9, `Prepare isolated, expiring sandbox for first order verification`, was merged into `main` as commit `178bfae7e7c68dcff65379ad5903e5e43fce6a24`.
- CI on that exact `main` commit passed Prisma validation/migrations, schema drift, reconciliation tests, core security/quota tests, billing event ordering/concurrency, and the production build.
- The correct Vercel project is `raus2/sync-stock`. Its production deployment for `178bfae7` is READY and serves `https://sync-stock-six.vercel.app`.
- The production landing page and signup page return HTTP 200. Vercel reported no runtime error clusters in the checked post-release window.
- The production queue probe at `/api/health/queue` returns HTTP 200 with an authenticated queue bridge.
- Railway production has persistent Redis and worker services. The worker health/bridge path is operational. The worker service is sourced from `yaussyross/SyncStock` branch `main`; its currently deployed production behavior remains compatible with the release. PR #9's worker delta only adds sandbox-isolation guards.
- Supabase project `shopify-qbo-sync` is `ACTIVE_HEALTHY`; the current Supabase security-advisor check returned no lints.
- The connected live Stripe account is named `SyncStock`. Source-controlled plan mappings point to the live SyncStock price IDs for Solo, Scale, and Empire.
- Production QuickBooks OAuth is configured far enough to generate an Intuit authorization redirect whose callback is `https://sync-stock-six.vercel.app/api/auth/qbo/callback`.
- Metricool has active organic publishing connections for the launch brand. Facebook and TikTok launch content has published; the remaining September 17 Facebook posts were corrected to reflect the verified sandbox acceptance. No paid advertising spend was authorized or committed.

## Verified isolated provider acceptance — September 16, 2026

The disposable sandbox was isolated from production data and queues. It used its own PostgreSQL, Redis, signing configuration, Shopify development store, and QuickBooks sandbox company.

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
- Temporary credential diagnostics used during Shopify OAuth debugging were removed before merge.

This completes the original one-order end-to-end sandbox acceptance gate. Do not reopen it as an unresolved blocker unless new evidence shows a regression.

## Remaining launch gates

These are the items that are **not yet verified** and must not be described as complete.

### 1. Shopify multi-store distribution approval

The production OAuth code accepts merchant `.myshopify.com` domains, but the production app's Shopify distribution/review state has not been observed from the connected tools. Before onboarding unrelated merchant stores, verify in the Shopify developer dashboard that the production SyncStock app uses an appropriate multi-store/public distribution path and that any required review is approved. Do not incur a Shopify registration/review fee without owner approval.

Developer dashboard: https://dev.shopify.com/dashboard

### 2. Production signup + live Stripe checkout/portal smoke

The public signup page is live, and checkout code is intentionally gated so a merchant cannot start paid checkout until Shopify, QuickBooks, and at least one product mapping are connected. CI covers billing ordering/concurrency, but a real production browser session has not yet been used in this verification pass to create a disposable account and exercise checkout/portal without completing an unauthorized charge.

Never charge a customer or create paid ad spend as a test. Use an authorized owner/test merchant and stop before any real payment unless the owner explicitly approves the transaction.

### 3. Broader beta accounting cases

The narrow paid-order acceptance passed. Before representing the product as broadly production-proven, exercise the supported shipping/discount/tax combinations, unmapped-product handling, QuickBooks failure/rollback, expired OAuth, uninstall, and refund/cancellation review behavior. Unsupported accounting cases should remain blocked or visibly queued for review rather than silently written.

### 4. Business/support details

Terms, privacy, feedback, and a support contact route are present on the production site. Confirm the final operating/legal business identity and that the support mailbox is actually monitored before broad paid acquisition.

## First-customer operating target

Prioritize an owner-operated Shopify store already using QuickBooks Online, roughly 50–200 paid orders per month, whose bookkeeping workflow genuinely calls for individual sales receipts. Qualify the workflow before taking live books. Do not market SyncStock as payout reconciliation, inventory synchronization, or complete bookkeeping.

Current founding offer:

- First 20 synced orders: free, no card required.
- Solo: **$8/month** for up to 200 orders/month.
- Scale: **$29/month** for up to 1,000 orders/month.
- Empire: **$49/month** for unlimited orders.

Merchant outreach copy:

> Still entering Shopify orders into QuickBooks one at a time? SyncStock is a founding beta focused on individual paid-order receipts, explicit product mapping, reconciliation checks, and duplicate-safe retries. The core Shopify → QuickBooks sandbox flow has passed end to end. You can start with 20 synced orders free, then Solo is $8/month for up to 200 orders. Would you be open to a short beta walkthrough?

Bookkeeper outreach copy:

> SyncStock is a focused Shopify → QuickBooks founding beta for small merchants whose workflow calls for individual sales receipts. It maps variants, checks totals before writing, and keeps retry state visible. The core sandbox flow has passed end to end; refunds/cancellations remain review-driven and payout reconciliation is not the product. Would you review the workflow for fit with any smaller Shopify clients?

Do not fabricate users, revenue, testimonials, savings, scarcity, or production capabilities that have not been verified.

## Paid acquisition rule

No paid-ad budget is approved by default. Organic publishing and zero-cost outreach may continue. Any ad campaign activation, boost, registration fee, or other cash outflow requires explicit owner approval before execution.
