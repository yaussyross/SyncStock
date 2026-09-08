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
- [ ] Validate Shopify totals against the generated QuickBooks transaction.
- [ ] Finish sync error classification and retry hardening.

## Phase 2 — Finish merchant workflow
- [x] Build product mapping UI.
- [x] Fetch Shopify variants and QuickBooks items.
- [x] Support mapping status, SKU suggestions, no-SKU variants, and bulk save.
- [x] Surface product mapping setup and unmapped orders in the dashboard.
- [x] Keep manual order retry behind an explicit user action.
- [ ] Add a post-mapping bulk retry action for orders waiting on mappings.

## Phase 3 — Production hardening
- [ ] Replace email-only impersonation auth with real authentication.
- [ ] Fix billing-period quota tracking.
- [ ] Add refunds/cancellations handling.
- [ ] Add app uninstall/data cleanup webhooks.
- [ ] Add structured logging/monitoring and tests.
- [ ] Review encryption/key management and rotate all previously exposed secrets.
- [ ] Finish legal/business details and legal review.

## Acceptance test for MVP core
A paid Shopify test order must:
- be accepted once even if the webhook is delivered multiple times;
- map every required line item by Shopify variant ID;
- create exactly one QuickBooks transaction;
- reconcile to the expected order total;
- persist Shopify ↔ QuickBooks IDs;
- expose a useful status/error in the dashboard;
- retry safely without creating duplicates.

## Current priority
The merchant mapping workflow is implemented. Next: exact Shopify ↔ QuickBooks transaction-total reconciliation, including shipping, discounts, taxes, tips/duties where applicable, and rounding safeguards.
