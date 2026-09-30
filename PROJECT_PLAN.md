# SyncStock — Engineering Plan

## Goal
Ship a reliable public embedded Shopify app where one supported paid Shopify order produces exactly one correct QuickBooks Online transaction.

## Source of truth
- GitHub repository `yaussyross/SyncStock` is canonical.
- `docs/LAUNCH.md` is the current launch record.
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
- [x] Shopify-hosted App Pricing architecture for new merchants; Stripe retained only for legacy compatibility.
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
- Submission itself remains pending until the hosted video URL is verified and Shopify checks are complete.

## Remaining public-launch gates

September 30 update: hosted reviewer video is deployed and saved in the listing;
the listing has zero reported issues and embedded capability is selected.
Automated checks were started, but their final result is not yet verified.
Live canonical AI self-review requirements were retrieved with owner-authorized
web lookup after Shopify CLI fetch failed. See `docs/SHOPIFY_SELF_REVIEW_2026-09-30.md`.
The review found and fixed manual domain entry and retained-account reinstall
failures. Billing verification and Partner sign-in remain open; the app is Draft.
The completed reviewer account, screencast, screenshots, and paid-test sync do
not need to be repeated. Older unchecked items below are historical gates,
not instructions to repeat completed work.

### 1. Shopify-controlled configuration
- [x] Shopify App Store developer registration completed; production public app is in Draft submission state.
- [x] App icon, emergency developer contact, English primary listing language, and protected customer data declaration completed.
- [ ] Finish App Store listing content and required real app screenshots.
- [ ] Run Shopify automated submission checks after listing/configuration is complete.
- [ ] Select the app capabilities required by Shopify review and complete the final App Store requirements self-review.
- [x] Shopify App Pricing enabled with three public monthly plans: Solo $8/mo, Scale $29/mo, Empire $49/mo; all allow free use on partner/development stores.
- [ ] Verify production Partner/App Pricing identifiers and Partner API permission.
- [ ] Run an authorized no-charge development-store flow: embedded App Home → QuickBooks connect → mapping → Shopify-hosted plan selection → paid test order → QuickBooks reconciliation. Embedded App Home, QuickBooks connection, one product mapping, and the public plan catalog are verified; plan selection and paid-order reconciliation remain.
- [ ] Submit for Shopify App Store review only after the automated checks and billing flow pass.

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
- [ ] Confirm `support@syncstock.app` is actually monitored.
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
