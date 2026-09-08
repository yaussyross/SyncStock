# SyncStock — Engineering Plan

## Goal
Ship a reliable Shopify → QuickBooks Online micro-SaaS where one paid Shopify order produces exactly one correct QuickBooks transaction.

## Source of truth
- Original Claude handoff is preserved at `../../original/syncstock-handoff.zip`.
- Active web app lives in this directory.
- Mobile app is deferred until the core web sync is production-safe.

## Phase 1 — Make order sync trustworthy
1. Switch order trigger to the appropriate paid-order workflow.
2. Add webhook delivery/order idempotency and duplicate protection.
3. Make QuickBooks creation retry-safe.
4. Unify Shopify API access on supported GraphQL endpoints.
5. Validate Shopify totals against the generated QuickBooks transaction.
6. Improve sync errors and retry behavior.

## Phase 2 — Finish merchant workflow
1. Build product mapping UI.
2. Fetch Shopify products/variants and QuickBooks items.
3. Support mapping status and bulk mapping.
4. Surface failed/unmapped orders in dashboard.
5. Add safe manual retry.

## Phase 3 — Production hardening
1. Replace email-only impersonation auth with real authentication.
2. Fix billing-period quota tracking.
3. Add refunds/cancellations handling.
4. Add app uninstall/data cleanup webhooks.
5. Add structured logging/monitoring and tests.
6. Review encryption/key management and secrets.

## Acceptance test for MVP core
A paid Shopify test order must:
- be accepted once even if the webhook is delivered multiple times;
- map every required line item;
- create exactly one QuickBooks transaction;
- reconcile to the expected order total;
- persist Shopify ↔ QuickBooks IDs;
- expose a useful status/error in the dashboard;
- retry safely without creating duplicates.

## Current priority
Start with idempotency and the product-mapping flow before adding more features.
