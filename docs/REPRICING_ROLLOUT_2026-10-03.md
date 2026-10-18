# Approved repricing and coordinated rollout

Status: implementation prepared for review; no hosted Shopify catalog or production deployment changed by this work.

## Approved catalog

| Display name | USD per Shopify 30-day cycle | Successful orders per cycle | New plan/item handle to configure and verify |
| --- | ---: | ---: | --- |
| Solo | $9 | 100 | `solo-100` |
| Scale | $19 | 250 | `scale-250` |
| Empire | $29 | 1,000 | `empire-1000` |

The first 20 successfully synced orders are free once per retained account, without a monthly reset. The paid allowance begins when Shopify confirms the first paid cycle. At the cap, new order creation pauses. There is no automatic upgrade, usage meter, overage charge, or unlimited plan in the new catalog. A repeated delivery or successful retry counts once. Failed/unmapped/preflight-blocked orders do not consume a completed-order allowance. An uncertain QuickBooks write holds a reservation until its existing receipt can be reconciled safely; do not release it merely because an HTTP request timed out.

Paid usage resets only when the provider confirms a later billing-cycle start. In-cycle upgrades/downgrades preserve usage. Usage periods are Shopify cycles, not calendar months. Outstanding reservations carry forward conservatively at renewal. Cancellation does not restore the free trial. A full privacy deletion removes the account; this release does not retain personal identifiers indefinitely to prevent a new account after deletion.

## Existing subscriptions

Recheck active provider contracts immediately before rollout; do not infer current membership from an earlier database snapshot. The hosted catalog was previously recorded at $8/200, $29/1,000 and $49/unlimited in the launch record. This document does not claim those plans have already been changed. Production account records and credentials are not included in this implementation.

## Verified hosted configuration access — October 3, 2026

Read-only inspection of the signed-in Partner Dashboard confirmed SyncStock Production app `424848261121` in Partner organization `5151473`. Its App Store status remains **Submitted**, with a reviewer being assigned. The English listing **Edit** control is disabled and has no destination link. Nothing was withdrawn or changed.

Current official Shopify guidance explicitly keeps App Pricing in Partner Dashboard, not Dev Dashboard, and reaches it through **Distribution → listing → locale Edit → Pricing content → Manage**. No separate supported editor was documented. Preserve the existing review; stage this release until that path becomes available or Shopify provides another supported path. Do not bypass the disabled control.

The development-store hosted selector currently displays **Solo $8/30 days, 200 orders; Scale $29/30 days, 1,000 orders; Empire $49/30 days, unlimited**. It states these plans are **$0 to test**, with Solo current. No plan was selected. The rendered controls do not expose item handles, so neither existing handles nor the proposed new handles were independently verified during this inspection.

- Partner review page: https://partners.shopify.com/5151473/apps/424848261121/distribution/app-store
- Shopify configuration guidance: https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing

The source fallback Partner organization was corrected from `511473` to verified `5151473`; environment overrides are retained. Tests assert both the correct fallback organization and app ID without using credentials.

## Compatibility and enforcement

- Existing internal `starter`, `growth`, and `unlimited` keys, original Shopify `solo`/`scale`/`empire` handles, and historical Stripe price IDs retain their original entitlements. No existing subscription is migrated or charged by this patch.
- New internal keys are `solo_100`, `scale_250`, and `empire_1000`. The new $29 Empire cannot be distinguished from legacy $29 Scale by price alone, so new plans require exact handles.
- Treat proposed handles as a release prerequisite: inspect the actual item handles returned by Partner API `activeSubscription` for each development-store contract. If Partner Dashboard assigns different handles, update the explicit mapping and tests before publication. Never infer entitlement from a redirect parameter alone.
- An accidental in-place price edit against an old handle fails closed rather than granting the old order cap at the new price.
- The additive migration adds reservation/lease/write-state fields and an index on SyncLog, plus a nullable Shopify billing-verification timestamp on User. Existing rows start with no reservation.
- Quota admission, reservation, completion, and renewal use the same User row lock. External QuickBooks requests run outside transactions. A lease fences stale workers; uncertain writes can only recover by querying the stable document number, not by issuing another create.
- Paid entitlement is rechecked from Shopify during webhook receipt, worker processing, and manual retry whenever its verification is at least 60 seconds old, so renewals and off-dashboard cancellation/freeze changes do not wait for a merchant visit. Changes can take up to this freshness interval to be observed. Request-start ordering prevents delayed same-cycle snapshots from overwriting a newer applied result; future timestamps are treated as stale. Temporary verification failures return a retryable error and do not grant usage. The one-time trial and legacy Stripe invoice-paid renewal remain unchanged.

## Rollout sequence and gates

1. Keep this PR in draft until its exact head passes CI, including migration of an empty PostgreSQL database, schema diff, atomic quota integration, legacy billing, reconciliation, and build. Include the independent uninstall/support fixes from PR #73 when assembling the final release.
2. Recheck active Shopify/legacy Stripe contracts and current provider plans. Do not mass-edit or migrate any existing subscription. If an existing customer is found, retain its original plan and get explicit direction before changing that contract.
3. Before activating the new processor, temporarily stop new enqueue/worker processing and drain every old in-flight processor; a rolling overlap is unsafe because old code has no reservations. Preserve incoming deliveries durably or return a retryable webhook response during the pause; do not acknowledge and drop orders. Inspect actual pending/failed/queue-failed rows and any potentially successful QuickBooks writes, regardless of the earlier account-count snapshot. Reconcile known existing receipts before resuming; mark unresolved legacy write outcomes conservatively for query-only recovery and retain their allowance reservation. Review exact backfill statements before executing them. Do not run an unconditional backfill against successful rows.
4. Split deployment into a backward-compatible enforcement stage and a pricing-surface stage. First release the additive migration, atomic admission, renewal refresh, and recognition of both catalogs while continuing to advertise the existing catalog. Do not deploy the new pricing UI against the old public selector.
5. In Shopify Partner Dashboard, prepare three distinct monthly flat-rate plans with the prices, caps, and exact handles above. Do not add billable usage meters. Use the application-enforced 20-order allowance; do not substitute Shopify's day-based free trial or a recurring 20-order free plan. Preserve free development-store testing and the current verified welcome link.
6. Verify all three actual contracts at $0 on a development store: approval/decline, exact handle and cap, 20-to-paid transition, 100/101, 250/251, 1,000/1,001, upgrade, downgrade, cancellation, and renewal while no dashboard is open. Compare hosted plan text, in-app usage, and public pricing. No real charge is required for this acceptance test.
7. Coordinate public availability of the verified new plans with promotion of the prepared new-pricing UI. Hold new paid-plan selection during the cutover if necessary so merchants cannot select a catalog that does not match the displayed terms. Archive/hide old plans for new customers only after checking Shopify's visible impact warning; preserve existing contracts. Partner Dashboard changes, any warning approval, and production promotion are separate release actions, not actions taken by this PR.
8. Update App Store listing pricing and review instructions/screenshots to the same catalog. The app is in review; inspect Shopify's actual save/review flow instead of assuming a price edit is invisible to reviewers or automatically approved.
9. Verify production mapping and hard caps read-only first, then conduct the explicitly authorized no-charge development-store acceptance. Monitor failures, reserved slots, provider usage, and spend. Roll back UI exposure/plan availability together if mismatched; keep the additive schema and legacy mappings intact. Do not roll back enforcement after selling a new plan. Never reintroduce the old unfenced processor while reservations or uncertain writes exist; an emergency rollback must pause processing first and preserve the reservation/write-state data.

## Economics and operating limits

Unlimited cannot be responsibly priced from two test syncs. No measured cost per order or guaranteed margin is asserted here. The approved 1,000 cap is a bounded pilot, not proof of profitability.

- Shopify's documented processing fee is 2.9%; eligible developers receive 0% revenue share on the first $1 million. At $29, approximately $28.16 remains before hosting, tax, regional fees, refunds, and support. App registration is a one-time $19 if not already paid. https://shopify.dev/docs/apps/launch/distribution/revenue-share
- Intuit Builder is free with 500,000 successful CorePlus read/query requests per workspace per calendar month, shared across production apps; exceeding the free cap blocks calls. US Silver starts at $300/month. Writes are generally Core, not metered CorePlus. https://static.developer.intuit.com/resources/Intuit_App_Partner_Program_Guide.pdf
- QBO throttles are separate: 500 requests/minute per realm and 10/second per realm+app. A 429 requires backoff; worker concurrency is not a rate limiter. https://static.developer.intuit.com/output_html/qbo/docs/learn/limits-and-throttles.html
- Commercial Vercel Pro starts at $20/month; Hobby is noncommercial. Railway Hobby is a $5 minimum including $5 metered usage, not unlimited worker/Redis capacity. Supabase Pro starts at $25; the free plan has smaller capacity/durability limits. These list prices do not establish the actual connected account bills. https://vercel.com/docs/plans/pro-plan ; https://docs.railway.com/pricing/plans ; https://supabase.com/pricing

Before growing volume, measure per-order API calls, latency, retries, memory, database size, and support work. Monitor aggregate monthly Intuit calls and total hosting spend; per-store caps alone do not bound a multi-store bill. Existing worker polling every five minutes and failed-job retention create baseline/growing overhead even without successful orders. Throttling and bounded job retention remain separate operating follow-ups.

## Validation record

Local: new catalog, legacy compatibility, one-time trial, capped calculator, pure quota/concurrency model, renewal/outage/cancellation, TypeScript, and existing targeted regression suites. Real PostgreSQL concurrency, empty-database migration, and Redis/BullMQ five-attempt recovery are CI gates because this workspace has no local PostgreSQL or Redis server. Handler-level tests also exercise cancelled/expired/downgraded/capped reserved recovery after automated retries exhaust. Temporary reservation saturation remains retryable so pre-write failures can free capacity for waiting orders. No production data was mutated for testing. Record exact CI head and outcome in the PR before release.
