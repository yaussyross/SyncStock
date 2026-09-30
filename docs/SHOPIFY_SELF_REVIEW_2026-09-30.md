# Shopify local self-review — September 30, 2026

Reviewed canonical repository `yaussyross/SyncStock`, base `ed10fbb`, with the
fixes in this change. Retrieved the live canonical requirements from
https://shopify.dev/docs/apps/launch/app-store-review/app-store-ai-self-review-requirements
on September 30. Owner explicitly authorized web lookup after CLI fetch failed.

## Summary

- Likely passing: 30
- Likely failing after these fixes: 0
- Needs review: 1
- Groups skipped: 10

This is the Shopify-selected subset checkable against local code, not official
approval or proof that all submission requirements pass. Each applicable
requirement was evaluated independently. No production order, charge, or
uninstall was performed for this review.

## Requirements that need review

### 1.2.2 Implement Shopify billing correctly

Hosted pricing, active-subscription lookup, inactive handling, and plan mapping
exist. Prior no-charge development-store evidence shows Solo current. A live
decline/cancel-and-return flow and resubscription after reinstall were not
observed in this review. Check in a development store without accepting a paid
charge. Do not uninstall the existing acceptance store merely to repeat tests.

## Billing verification completed September 30

### 1.2.1 Use Shopify App Pricing or the Shopify Billing API

Production data was checked directly before changing code:
- 3 total SyncStock user rows
- 0 rows with a Stripe customer ID
- 0 rows with a Stripe subscription ID
- 0 potentially-live legacy Stripe subscriptions

Because there is no legacy paying population to preserve, the public
`/api/stripe/checkout` route is now permanently retired and always returns
HTTP 410. It no longer contains Stripe Checkout session creation or a
`BILLING_PROVIDER` override. New paid plans continue through Shopify-hosted App
Pricing only. Historical Stripe webhook/portal support remains isolated for
defensive handling of any recovered legacy metadata, but the current production
database contains no such customer/subscription records.

## Fixed likely failures

- **2.3.1:** `ConnectPanel.tsx` offered manual shop-domain entry. It now sends
  merchants to Shopify Admin and directs them to open SyncStock from Apps.
- **2.3.4:** uninstall deletes ShopifyConnection but retains User. Bootstrap
  previously attempted another User creation with the same unique synthetic
  email. It now upserts that account only after verifying the ID token and
  exchanging it for fresh offline credentials.

Validation: generated the Prisma client from the current schema; TypeScript
check passed. The new reinstall regression executes the actual bootstrap with
mocked persistence/network, checks retained-account reuse and fresh encrypted
tokens, restores webhooks, and rejects invalid tokens. Added it to CI.
This is not a live Shopify uninstall/reinstall test.

## Evaluation ledger

| Requirement | Result | Evidence |
| --- | --- | --- |
| 1.1.1 | Likely passing | Embedded `shopifyFetch` obtains App Bridge ID tokens; server verifies signature/audience/origin; no embedded storage dependency. Incognito not retested. |
| 1.1.2 | Likely passing | Processes paid-order notifications into QBO accounting records; no buyer checkout replacement. |
| 1.1.3 | Likely passing | No theme download or installation feature. |
| 1.1.4 | Likely passing | App status uses persisted sync records; no fabricated merchant sales or review display found. |
| 1.1.6 | Likely passing | Store-scoped accounting integration, no multi-seller marketplace. |
| 1.1.7 | Likely passing | No buyer payment gateway feature; legacy Stripe concerns are app billing above. |
| 1.1.8 | Likely passing | Shopify-to-QBO integration, no third-party POS integration. |
| 1.1.9 | Likely passing | No cart fee or line-item mutation. |
| 1.1.10 | Likely passing | No shipping-option mutation. |
| 1.1.13 | Likely passing | Reads authorized store catalog for mappings; no external store scraping/copying feature. |
| 1.1.14 | Likely passing | Direct app support, no freelancer marketplace. |
| 1.1.15 | Likely passing | Refund events create review records; no alternative buyer refund processor. |
| 1.1.16 | Likely passing | No capital lending feature. |
| 1.2.1 | Likely passing | New subscriptions use Shopify App Pricing. Production DB audit on Sep 30 found 3 users, 0 Stripe customer IDs, 0 Stripe subscription IDs, and 0 potentially-live legacy subscriptions. The legacy Stripe checkout route is now permanently retired with HTTP 410 and CI guards against restoring Stripe checkout creation. |
| 1.2.2 | Needs review | Live decline/cancel/reinstall billing behavior remains unobserved. |
| 1.2.3 | Likely passing | In-app billing action opens Shopify-hosted plan selector. |
| 2.2.1 | Likely passing | Shopify catalog, webhooks, token exchange and shop APIs used. |
| 2.2.3 | Likely passing | Root layout includes current App Bridge CDN script first in authored head. |
| 2.2.4 | Likely passing | All located Admin API calls use graphql.json, including legacy callback and dev connection. |
| 2.2.6 | Likely passing | No promotional admin extension. |
| 2.2.7 | Likely passing | No Max modal launch. |
| 2.3.1 | Likely passing after fix | Domain input removed; public embedded bootstrap identifies store from verified ID token. |
| 2.3.2 | Likely passing | Bootstrap exchanges ID token before loading merchant status/actions; modern token exchange replaces interactive OAuth in embedded path. |
| 2.3.3 | Likely passing | Embedded App Home remains displayed after bootstrap; legacy callback redirects to dashboard. |
| 2.3.4 | Likely passing after fix | Retained account reused after new token exchange; regression test passes. |
| 3.1.1 | Likely passing | Canonical app and configured callbacks use HTTPS; prior public video fetch validated TLS. |
| 3.2.1 | Likely passing | Only read_orders/read_products declared; no read_all_orders. |
| 3.2.2 | Likely passing | No write_payment_mandate scope. |
| 3.2.3 | Likely passing | No write_checkout_extensions_apis scope. |
| 3.2.4 | Likely passing | No read_advanced_dom_pixel_events scope. |
| 3.2.5 | Likely passing | No read_checkout_extensions_chat scope. |

## Skipped groups

- 5.1 Online store — no theme extension configuration.
- 5.2 Payment — no payment extension or gateway scope.
- 5.3 Payment facilitator — opt-in not requested.
- 5.4 Purchase option — no relevant selling-plan/subscription-contract scopes.
- 5.5 Product sourcing — opt-in not requested.
- 5.6 Checkout customization — no checkout UI extension.
- 5.7 Sales channel — no channel_config extension.
- 5.8 Post purchase — no checkout_post_purchase extension.
- 5.9 Mobile app builders — opt-in not requested.
- 5.10 Donation — opt-in not requested.

## Submission state

Reviewer credentials and public screencast are saved. Listing has zero reported
issues. Owner-provided Partner screenshots from September 30 show the
Preliminary steps page with green checks for automated common-error checks,
immediate authentication, immediate redirect to app UI, mandatory compliance
webhooks, HMAC verification, valid TLS, the embedded capability, and Embedded
app checks. The **Submit for review** action is visible.

The app remains Draft because the final requirements attestations / submit
action have not yet been completed. Existing screenshots, video, QBO production
verification, Railway recovery, reviewer account, and automated checks must not
be needlessly repeated.

## Resources

- https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements
- https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices
- https://shopify.dev/docs/apps/launch/billing
- https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review
