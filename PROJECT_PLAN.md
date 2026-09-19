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

## Remaining public-launch gates

### 1. Shopify-controlled configuration
- [x] Shopify App Store developer registration completed; production public app is in Draft submission state.
- [x] App icon, emergency developer contact, English primary listing language, and protected customer data declaration completed.
- [ ] Finish App Store listing content and required real app screenshots.
- [ ] Run Shopify automated submission checks after listing/configuration is complete.
- [ ] Select the app capabilities required by Shopify review and complete the final App Store requirements self-review.
- [ ] Configure/verify Shopify App Pricing for Solo $8/mo, Scale $29/mo, Empire $49/mo.
- [ ] Verify production Partner/App Pricing identifiers and Partner API permission.
- [ ] Run an authorized no-charge development-store flow: embedded App Home → QuickBooks connect → mapping → Shopify-hosted plan selection → paid test order → QuickBooks reconciliation.
- [ ] Submit for Shopify App Store review only after the automated checks and billing flow pass.

### 2. Broader accounting acceptance
- [ ] Shipping / discount / tax combinations.
- [ ] Tax-inclusive Shopify cases and relevant QuickBooks tax configurations.
- [ ] Unmapped-product behavior and post-mapping retry.
- [ ] QuickBooks failure / rollback behavior.
- [x] Shopify expiring offline-token acquisition and refresh path implemented; live embedded re-authentication still needs merchant-session verification.
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
