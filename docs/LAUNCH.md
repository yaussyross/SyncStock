# SyncStock launch record

Last checked: **September 19, 2026**

Canonical repository: https://github.com/yaussyross/SyncStock
Production app: https://sync-stock-six.vercel.app
Founding pricing: **Solo $8/month**, **Scale $29/month**, **Empire $49/month**. New accounts receive 20 synced orders free with no card required.

## September 19 control checkpoint

- Current `main` is `7d298d047f6882d8940ed4516d6e1029dcf8bc73` (PR #17). GitHub Actions `verify` completed successfully on that exact commit.
- Canonical Vercel project `raus2/sync-stock` deployed that exact commit to production as `dpl_3Y4qv2B3YokJdnSS97bsJruALYmu` with state READY. Vercel reported no production runtime-error clusters in the checked last-24-hour window.
- The obsolete duplicate Vercel project `sync-stock-s5j9` still reports a failed deployment status on the same commit. This makes GitHub's combined legacy status appear failed, but it is not the project serving SyncStock production and must not be treated as a product/runtime failure.
- Railway Redis and the persistent worker both report successful production deployments. The worker currently runs commit `cf721c708fc1621860ec0d6c546e6bafbc930d96`; direct comparison of `src/worker/index.ts` to current `main` shows the later worker-only changes are sandbox-isolation guards, so the current production worker behavior remains compatible.
- The expired `sandbox-24h` service has restart policy NEVER and reported zero CPU and zero memory usage across the checked 24-hour window. It is not carrying production traffic.
- Supabase project `shopify-qbo-sync` is ACTIVE_HEALTHY. The current security-advisor result contains no lints. Six unused-index notices are informational performance findings and are not launch blockers.
- PR #12 is stale/diverged (one commit ahead, five behind). Its still-useful Shopify App Pricing configuration details are being folded into the current launch record instead of merging the stale branch.

Owner action status: no repeated generic Shopify screenshot is requested. Ross has already supplied production-app/distribution context in the project history. Escalate only the exact next owner-controlled Shopify action or credential entry that cannot be completed through connected tools, and stop before any fee or other cash outflow.

## September 18 takeover checkpoint

- Canonical production deployment `dpl_1VhNL2duMQCCbfDzoPZyY6TbBPNi` is READY at commit `a550e8a66bfe65427382de37368861f5b37dc12c`. Landing page and authenticated queue probe returned HTTP 200. The runtime-error query returned no clusters; historical runtime log retention is limited, so this does not prove absence of earlier errors.
- PR #2 was already merged on September 16. The duplicate Vercel project `sync-stock-s5j9` has a failed deployment; it is not the project serving the canonical production URL.
- New merchants use Shopify App Pricing. The older Stripe checkout gate below is superseded for new public-app merchants; Stripe remains legacy billing only. Public-app approval, embedded production onboarding and Shopify plan activation/return still need direct verification.
- The Shopify developer dashboard redirected this browser to a Cloudflare human-verification screen. No approval, credential configuration, or billing activation was claimed or changed.
- No GitHub workflow runs were returned for `a550e8a`; do not carry forward earlier CI success as proof for this commit.
- Metricool verified three Facebook posts published September 18 and a fourth pending at 18:05 America/Chicago. Existing brand `6904340` still connects personal TikTok `rausssy`, Facebook `1223731030831532`, and unrelated Instagram `pawtywalksatx`.
- Ross is creating dedicated SyncStock TikTok and Facebook profiles. The daily social task now requires Ross-identified dedicated profile URLs and verified Metricool connections before scheduling new posts. Existing scheduled posts were not altered.
- Code review found that the embedded mapping editor submitted no removals and disabled saving when all selections were cleared. The fix sends only cleared, previously saved variants in the loaded catalog; it preserves mappings outside that catalog and permits removing the final mapping.

Historical note: the generic Shopify human-verification handoff was already surfaced to Ross. Do not ask for the same production/distribution screenshot again; request only a specific unresolved Shopify action when required. Dedicated SyncStock social profile URLs remain separate from the product launch gate. Do not send credentials in normal chat.

## Earlier verified state (September 17)

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

### 2. Protected customer data access

The public app requests `read_orders`. Current SyncStock order reads use order identifiers, totals, taxes, discounts, shipping/tip/duty/additional-fee amounts, line-item titles/SKUs/quantities/prices, and variant IDs; they do not request customer name, address, phone, or email fields. Shopify's public-app protected-customer-data process still requires the app to declare and obtain the minimum access level needed for the customer/order data it processes. Verify this under the production app's API access settings before App Store submission; do not request fields SyncStock does not use.

### 3. Production onboarding + Shopify App Pricing smoke

Verify the embedded public-app installation, QuickBooks connection, product mapping, hosted Shopify plan selection, return to the app, and confirmed subscription entitlement. Shopify Partner billing configuration and the monthly plan catalog must be verified. The deployed billing code expects these production Partner/App Pricing values: `SHOPIFY_APP_HANDLE`, `SHOPIFY_APP_GID`, `SHOPIFY_PARTNER_ORG_ID`, and `SHOPIFY_PARTNER_API_ACCESS_TOKEN`. The Partner API client must have the permission required to read/manage the production app's billing state. Do not set `BILLING_PROVIDER=stripe_legacy` for new public-app billing. Use Shopify-supported no-charge development-store testing where available; do not claim that legacy Stripe tests prove the new Shopify billing flow.

Never charge a customer or create paid ad spend as a test. Use an authorized owner/test merchant and stop before any real payment unless the owner explicitly approves the transaction.

### 4. Broader beta accounting cases

The narrow paid-order acceptance passed. Before representing the product as broadly production-proven, exercise the supported shipping/discount/tax combinations, unmapped-product handling, QuickBooks failure/rollback, expired OAuth, uninstall, and refund/cancellation review behavior. Unsupported accounting cases should remain blocked or visibly queued for review rather than silently written.

### 5. Business/support details

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
