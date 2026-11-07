# SyncStock — Engineering Plan

## Goal
Ship a reliable public embedded Shopify app where one supported paid Shopify order produces exactly one correct QuickBooks Online transaction.

## Source of truth
- GitHub repository `yaussyross/SyncStock` is canonical.
- This plan and the latest dated self-review/submission evidence are the current launch record; `docs/LAUNCH.md` contains historical milestones.
- Older handoffs, screenshots, and temporary notes are reference material only.

## Completed core path
- [x] Paid-order Shopify webhook trigger.
- [x] HMAC validation, webhook delivery idempotency, and duplicate-order protection.
- [x] Explicit Shopify variant → QuickBooks item mapping.
- [x] Preflight reconciliation before QuickBooks writes.
- [x] QuickBooks post-write total verification and safe rollback of only the newly-created mismatched receipt.
- [x] Stable transaction reference for retry/recovery.
- [x] Persistent Railway worker + Redis.
- [x] Isolated Shopify development-store → worker → QuickBooks sandbox acceptance test.
- [x] Trial quota increment and duplicate-delivery acceptance verified.
- [x] Public embedded Shopify App Home with ID-token authentication.
- [x] Product-mapping removal regression fixed.
- [x] Shopify lifecycle/compliance handlers for uninstall and required redaction/data-request topics.
- [x] Refund/cancellation events captured for merchant review.
- [x] Shopify-hosted App Pricing architecture for new merchants; public Stripe checkout permanently retired after production DB verified zero legacy Stripe customers/subscriptions.
- [x] CI covers database migration, reconciliation, security/quota, billing ordering, Shopify billing mapping, Shopify auth, API error normalization, mapping removal, and production build.
- [x] Public Terms/Privacy and Shopify embedded config updated for the current architecture.
- [x] Embedded App Home separated from the public dark marketing theme and restyled for a familiar Shopify-admin surface.
- [x] Public-app protected customer data declaration completed at the minimum required level without requesting customer name, email, phone, or address fields.
- [x] Shopify public-app authentication upgraded to expiring offline access tokens with encrypted refresh-token rotation support.
- [x] Live embedded TEST-store re-authentication verified after the expiring-token migration.
- [x] QuickBooks sandbox OAuth reconnected from the embedded public app after registering the canonical Vercel callback.
- [x] Production TEST-store product mapping saved for `SYNCSTOCK-TEST-10` → QuickBooks `Services`.

## September 29 reviewer preparation

- Tessa sandbox reviewer login is active in Sandbox Company US bd50; Shopify test credentials saved and password confirmed by owner.
- Shopify listing live recheck: only screencast URL remained missing. Existing listing media preserved; privacy URL corrected to the SyncStock policy.
- TEST order #1009 recorded as Synced with Shopify $10.00 and QuickBooks $10.00 after QuickBooks reconnection.
- Shopify-hosted plan selector shows Free to test, Solo current, and $0 for this development store; no new plan or charge approved.
- Three-minute English-captioned reviewer video added at `public/review/syncstock-reviewer-2026-09-29.mp4`. Sign-in screens and unrelated tabs omitted.
- Reply Watch re-enabled. No paid services purchased.
- September 29 status was pending; the October 1 submission update below supersedes it.

## November 7 privacy and billing correction

- Shop redaction now removes all locally retained data for a verified single-shop embedded account, including QBO credentials, accounting settings, feedback and the account itself. Ownership checks, signed body/domain binding, a serializable transaction and bounded retries protect unrelated accounts; older deliveries do not erase a later shop lifecycle. Legacy or conflicting ownership returns an explicit failure for review rather than claiming erasure.
- Shopify plan selection is available as soon as the authenticated Shopify connection exists, independently of QBO and mapping setup. Order synchronization retains its accounting setup and quota checks.
- Regression coverage includes complete database erasure, unrelated-shop preservation, duplicate deliveries, rollback, stale events and reinstall-to-pricing without accounting setup. No schema migration or new dependencies are required.
- This source correction does not establish current Shopify approval, reviewer access, IP allowlist configuration, or fresh end-to-end acceptance. Validate those separately before broader launch. No real orders, charges or external accounting records are changed by validation.

## Remaining public-launch gates

October 1 update: Shopify's live HMAC checker reported HTTP 404 at
`/app/api/webhooks/shopify/compliance`, although the handler lives at
`/api/webhooks/shopify/compliance`. PR #72 changed the app-specific webhook
subscriptions to absolute production HTTPS URLs and updated the contract guard.
CI passed, and the controlled Shopify configuration release workflow succeeded.
The rerun of automated checks passed in Partners. The September 30 local
self-review (`docs/SHOPIFY_SELF_REVIEW_2026-09-30.md`) found no remaining local
failures after live billing cancel-return verification. The self-review
acknowledgment was completed, and Shopify accepted the App Store submission on
October 1. Live status: **Submitted — assigning a reviewer**. Approval and
publication remain pending Shopify review; monitor the submission contact inbox
for reviewer questions. Reviewer account, screencast, media, screenshots,
production QBO sync, and infrastructure work are complete and need not be redone.

### 1. Shopify-controlled configuration
- [x] Shopify App Store developer registration completed; production public app was submitted for review on October 1.
- [x] App icon, emergency developer contact, English primary listing language, and protected customer data declaration completed.
- [x] App Store listing content, feature media, reviewer credentials, and required screenshots completed.
- [x] Shopify automated common-error checks and Embedded app checks completed in the Partner dashboard.
- [x] Embedded app capability selected; local self-review and requirements acknowledgment completed.
- [x] Shopify App Pricing enabled with three public monthly plans: Solo $8/mo, Scale $29/mo, Empire $49/mo; all allow free use on partner/development stores.
- [x] Production Shopify App Pricing catalog and Partner/API billing path verified for the current development-store flow.
- [x] Authorized no-charge development-store flow completed: embedded App Home → QuickBooks connect → mapping → Shopify-hosted plan selector showing $0/free-to-test → paid TEST order #1009 → $10.00/$10.00 reconciliation.
- [x] Submitted for Shopify App Store review after the automated checks and billing flow passed; awaiting reviewer assignment.

### 2. Broader accounting acceptance
- [ ] Shipping / discount / tax combinations.
- [ ] Tax-inclusive Shopify cases and relevant QuickBooks tax configurations.
- [ ] Unmapped-product behavior and post-mapping retry.
- [ ] QuickBooks failure / rollback behavior.
- [x] Shopify expiring offline-token acquisition, refresh path, and live embedded re-authentication verified.
- [ ] Expired QuickBooks OAuth recovery.
- [ ] Uninstall cleanup.
- [ ] Refund/cancellation review workflow.

### 3. Operational readiness
- [x] Public support route uses the monitored `yaussyross@gmail.com` inbox. The non-delivering `support@syncstock.app` address is no longer shown on public support/legal surfaces.
- [ ] Remove or unlink obsolete duplicate Vercel project `sync-stock-s5j9` when practical; it is non-production status noise, not a runtime blocker.
- [ ] Review encryption/key rotation history before broader launch.
- [ ] Add broader structured monitoring as beta volume increases.

## Reconciliation policy
SyncStock never changes accounting amounts merely to force a match.

1. Build the QuickBooks payload from explicitly supported Shopify order components.
2. Compare the draft total with the Shopify paid-order total using fixed-point arithmetic and a one-cent tolerance.
3. If the draft does not reconcile, create no QuickBooks transaction and expose the reason.
4. If QuickBooks creates a receipt but returns a different total, remove only the receipt created by that attempt when safe.
5. Never auto-delete a pre-existing receipt discovered during retry/recovery; require review instead.

Unsupported accounting treatments stay blocked until explicitly modeled and sandbox-tested.

## Owner constraints
- All outgoing money, paid advertising, fees, or other cash outflow requires Ross's explicit approval.
- Do not ask Ross to repeat already-completed generic Shopify production/distribution screenshots.
- Escalate only a specific human-only Shopify, credential, legal/business, or payment barrier.
- Do not ask for secrets in normal chat when a secure connector/credential flow is available.

## November 7 isolated expansion readiness work (not deployed)

- Current canonical source was reconstructed read-only at 7b61a906, with 157 text/source assets matching GitHub blob hashes. Two reviewer video files are not materialized in this isolated copy.
- Added a default-off 16-experience registry, tenant/environment-bound consent state and PKCE utilities, and read-only request guards. No provider app, credential, token exchange, account grant, live read or accounting write is performed by these modules.
- The consent-state store is an injected interface; a real transactional shared store and provider-specific OAuth routes remain required. In-memory test storage is not a production implementation.
- All expansion experiences remain blocked without current provider evidence, mapping/dedup/accounting/deletion acceptance and an approved cutover. Sandbox evidence cannot produce a customer-ready verdict. Multi-channel requires accepted constituent sources and a matching accounting destination.
- These additions complement, but do not claim to recover or integrate, the unavailable October 27 expansion branch. No push or deployment is authorized by this checkpoint.

## November 7 recovered expansion integration

- Consolidated the source and accounting modules into `src/lib/expansion`; added a single tenant-scoped local preview pipeline for all 16 experiences and a CI test command.
- Added executable bounded GET transport, a native eBay operational-order reader and a native Xero account-catalog reader. No account has been connected by this code, no credentials provisioned, and no remote accounting writes enabled.
- Fixed acceptance surviving account rebinding, replay provenance being silently discarded, unsupported balanced accounting directions, mutable-request token leakage across providers and unbounded async deadlines. Regression tests cover these cases.
- 339 offline tests, production build and TypeScript check pass. Live provider acceptance remains unrun. See `docs/expansion/READINESS_2026-11-07.md` for exact remaining engineering and provider prerequisites.
- The user's later request authorizes uploading the requested expansion code as a draft PR. Production remains unchanged; no merge or deployment is part of this increment.

## November 7 durable consent-store increment

- Added encrypted shared PostgreSQL pending-consent storage, atomic single-use consumption, bounded expiry cleanup and account-deletion cascade. No provider credentials, grants or public routes are created.
- The additive migration is staged in the draft only. Production has not been migrated. Provider-specific OAuth exchange/refresh and credential lifecycle remain unfinished.
- 363 offline tests pass. Added 10 real PostgreSQL acceptance groups covering independent-client races, expiry, tampering, tenant isolation and deletion cascade. These require exact-head remote CI before the increment is considered verified.

## November 7 native OAuth transport increment

- Added official-contract eBay/Xero confidential authorization, code exchange and refresh primitives. Provider-specific token types, RuName, expiry and rotation behavior are validated. Read scopes are fixed; no write scopes are requested.
- Bound encrypted single-use consent to the exact OAuth application configuration. Added an 11th PostgreSQL group for encrypted app binding and wrong-app rejection.
- Added 68 provider transport tests; 434 offline tests now cover this branch. Token requests in all tests use synthetic mocked responses, never live credentials.
- No deployed OAuth routes, bearer-token vault, durable refresh lock/CAS coordinator, provider-account binding or real grant has been installed. This closes the native transport gap, not the full connection lifecycle. Production remains unchanged.

## November 7 encrypted token storage increment

- Added encrypted unbound grant storage with stable exchange IDs, idempotent inserts and unique initial/current refresh fingerprints. No plaintext access/refresh token columns are used.
- Added cross-worker atomic refresh claims and encrypted token-pair compare-and-swap. Unknown outcomes stay held; stale claims are never automatically stolen. Revocation/deletion invalidates late work.
- 41 focused storage/coordinator tests and 475 total offline tests cover the increment. Added 12 real PostgreSQL acceptance groups for CI. Independent review found no remaining blocking issue after fixing caller credential override and duplicate-grant refresh contention.
- The migration remains staged only. No live credentials, provider-account binding, customer acceptance or deployed OAuth routes have been added. Production is unchanged.
