# SyncStock — Engineering Plan

## October 3 repricing preparation (not deployed)

- User approved Solo $9/100, Scale $19/250, Empire $29/1,000 per Shopify 30-day billing cycle, with the first 20 synced orders free once and a hard pause without overage charges.
- Local implementation covers versioned catalog compatibility, atomic quota reservations, unattended Shopify renewal, pricing surfaces, and regression tests.
- Production rollout and Shopify hosted catalog changes remain separate gates. See [repricing rollout](docs/REPRICING_ROLLOUT_2026-10-03.md).


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
