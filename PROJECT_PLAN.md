# SyncStock — Engineering Plan

## Goal
Ship a reliable Shopify → QuickBooks Online micro-SaaS where one paid Shopify order produces exactly one correct QuickBooks transaction.

## Source of truth
- GitHub repository `yaussyross/SyncStock` is the canonical source of truth.
- The original Claude handoff remains reference material only.
- Mobile is deferred until the core web sync is production-safe.

## Phase 1 — Make order sync trustworthy
- [x] Switch order trigger to the paid-order workflow.
- [x] Add webhook delivery/order idempotency and duplicate protection.
- [x] Make QuickBooks creation retry-safer with a stable transaction reference.
- [x] Unify Shopify order/catalog reads on the GraphQL Admin API.
- [x] Add preflight Shopify → QuickBooks transaction-total reconciliation.
- [x] Verify QuickBooks `TotalAmt` after creation and block mismatches.
- [x] Roll back a newly-created mismatched Sales Receipt when safe to do so.
- [x] Prevent unsafe retry when a pre-existing QuickBooks transaction requires manual review.
- [x] Add CI for reconciliation smoke tests and the production Next.js build.
- [ ] Model supported accounting adjustments (shipping, discounts, tips, duties/additional fees) instead of blocking them.
- [ ] Validate tax behavior across QuickBooks sandbox configurations and tax-inclusive Shopify stores.

## Phase 2 — Finish merchant workflow
- [x] Build product mapping UI.
- [x] Fetch Shopify variants and QuickBooks items.
- [x] Support mapping status, SKU suggestions, no-SKU variants, and bulk save.
- [x] Surface product mapping setup and unmapped orders in the dashboard.
- [x] Keep manual order retry behind an explicit user action.
- [x] Surface Shopify, drafted QBO, actual QBO, and reconciliation delta in sync activity.
- [ ] Add a post-mapping bulk retry action for orders waiting on mappings.

## Phase 3 — Production hardening
- [ ] Replace email-only impersonation auth with real authentication.
- [ ] Fix billing-period quota tracking.
- [ ] Add refunds/cancellations handling.
- [ ] Add app uninstall/data cleanup webhooks.
- [ ] Add structured logging/monitoring and broader automated tests.
- [ ] Restore a deterministic package lock and review dependency warnings.
- [ ] Review encryption/key management and rotate all previously exposed secrets.
- [ ] Finish legal/business details and legal review.

## Reconciliation policy
SyncStock never changes accounting amounts merely to force a match.

For the current private beta:
1. Build the exact QuickBooks payload from mapped product lines plus Shopify tax.
2. Compare that draft against Shopify's paid-order total using fixed-point arithmetic and a one-cent tolerance.
3. If the draft does not reconcile, create **no** QuickBooks transaction and show the merchant why.
4. If QuickBooks creates a receipt but returns a different `TotalAmt`, immediately attempt to remove only the receipt created by that same attempt.
5. Never auto-delete a pre-existing receipt found during retry/recovery; mark it for manual review instead.

Orders requiring shipping, discount, duty, tip, additional-fee, tax-inclusive, or other unsupported accounting treatment remain safely blocked until those treatments are explicitly modeled and sandbox-tested.

## CI verification
The current `feature/launch-site-reliability` branch passes GitHub Actions checks for:
- dependency installation;
- reconciliation smoke tests;
- Prisma Client generation as part of the build;
- the optimized Next.js production build and TypeScript validation.

This does **not** replace Shopify development-store and QuickBooks Online sandbox integration testing.

## Acceptance test for MVP core
A paid Shopify test order must:
- be accepted once even if the webhook is delivered multiple times;
- map every required line item by Shopify variant ID;
- pass preflight reconciliation before QuickBooks is called;
- create exactly one QuickBooks transaction;
- reconcile the returned QuickBooks total to the Shopify total;
- persist Shopify ↔ QuickBooks IDs and reconciliation audit values;
- expose a useful status/error in the dashboard;
- retry safely without creating duplicates.

## Current priority
Validate the complete paid-order flow against Shopify development data + a QuickBooks Online sandbox, including tax and rollback behavior. After sandbox verification, implement explicit accounting treatment for shipping and discounts before widening the private beta.

## September 9, 2026 continuation

- Restored initial database migration; CI now starts PostgreSQL/Redis, migrates an empty database, checks schema drift, and tests billing ordering/concurrency. Existing databases require an inspected baseline, not a reset.
- Fixed paid-period marker updates: only a matching current paid invoice advances quota periods; duplicate invoice deliveries preserve usage.
- Added retry entitlement checks, an atomic retry claim, queue-failure recovery, and worker execution-time entitlement checks. Simultaneous different orders still need atomic quota reservations before a broad launch.
- Moved duplicate-order protection ahead of webhook quota handling to preserve successful records.
- Added a browser-only bookkeeping cost calculator and honest example labels.
- Restored package-lock.json and ignored dependencies, build output, and local secrets.
- Code inspection confirms password authentication, lifecycle/compliance handlers, and accounting adjustment configuration exist; older unchecked milestones above must not be interpreted as absent code. Real provider verification remains incomplete.
- Access, marketing assets, deployment instructions, and launch acceptance are tracked in docs/LAUNCH.md.
