# SyncStock paid launch — September 9, 2026

## Verified commercial state

- Canonical repository: https://github.com/yaussyross/SyncStock
- Existing Vercel project: https://vercel.com/raus2/sync-stock
- Vercel connector returns zero teams and 403 Forbidden for this project. Deployment, environment variables, domain health, and database state cannot be verified in this session.
- The connected live Stripe account FORGED contains active USD monthly prices: Solo $19 (200 orders), Growth $49 (1,000 orders), Pro $99 (unlimited). Price IDs are in `.env.example`.
- Catalog configuration does not prove checkout, fulfillment, payouts, or a sale. No sale was generated or verified in this session.
- The separately proposed ten micro-products have one-time $8 Stripe prices; the recovered brief calls for $8/year. Resolve the mismatch before advertising automatic annual renewal. No catalog mutations were made.
- No connected email or social publishing channel is available in this session. No outreach messages or advertisements were sent.

## First customer

Target one owner-operated Shopify store already using QuickBooks Online, roughly 50–200 paid orders/month, whose bookkeeper specifically wants individual sales receipts. Qualify single-currency and supported tax behavior in the sandbox before taking the live store. Avoid presenting SyncStock as payout reconciliation, inventory synchronization, or complete bookkeeping. Refunds/cancellations currently enter a manual review queue.

The initial offer is 20 sandbox test orders at no charge, then Solo at $19/month once live sync is validated and deliverable. There is no card requirement for the free account. A paid sale today requires access restoration, passing the real integration checks, and a willing customer; it is not a promised outcome.

Position on visible exceptions, variant mapping, and a focused workflow. Do not claim to be the cheapest: CRM Perks also lists a $19/month plan, and established products offer free tiers. MyWorks lists $24/month for 100 orders; these products have different capabilities. Sources checked September 9, 2026:
- https://apps.shopify.com/quickbooks-integration-2
- https://apps.shopify.com/quickbooks-sync-by-myworks
- https://apps.shopify.com/qbconnector

## Acquisition asset shipped in this change

`/tools/bookkeeping-cost` estimates manual entry hours from user-supplied order volume and minutes per order, applies an assumed automation percentage, and compares the value of saved time with the plan price. Inputs remain in the browser. It explicitly distinguishes time value from cash savings and labels all default inputs as illustrations. Publish the route only on the verified production domain before sharing it.

## Outreach copy prepared for the current beta

Merchant message:

> Still entering Shopify orders into QuickBooks one at a time? I'm building SyncStock around individual paid-order receipts, product mapping, and visible exception handling. It's in sandbox beta, so I'm looking for merchants willing to test the workflow before connecting live books. The planned Solo tier is $19/month for 200 orders. Would a short sandbox walkthrough be useful?

Bookkeeper partnership message:

> I'm building SyncStock for small Shopify merchants whose QuickBooks workflow calls for individual sales receipts. It maps variants and stops orders when totals do not reconcile. We're still validating the sandbox flow; refunds and payout reconciliation are not automated. Would you review the workflow and tell me whether it fits any of your smaller clients? No client credentials or customer data needed for the first conversation.

Public beta post:

> Your store took the order. You shouldn't have to type it again. SyncStock is in sandbox beta for Shopify → QuickBooks paid-order receipts. Product mapping, visible exceptions, and a free bookkeeping-time calculator. Planned pricing starts at $19/month. Looking for a few merchants and ecommerce bookkeepers to test the workflow before live launch.

Do not replace “sandbox beta” with live availability until the acceptance record below is complete. Add the actual verified URL when publishing. Do not fabricate testimonials, users, savings, or scarcity.

## Targeted distribution queue

These are potential expert-feedback/partnership channels, not verified buyers or warm leads. Use their designated partnership/general business channel, not a client-service booking under a false pretext. No individual recipient has been resolved or contacted.

| Channel | Verified relevance | First action |
|---|---|---|
| bookskeep | Shopify bookkeeping and QBO service page | Ask whether a narrow small-store workflow merits an expert review |
| LedgerGurus | Shopify accounting; homepage focuses on larger brands | Seek technical feedback/referrals; deprioritize as a direct $19 buyer |
| Existing merchant relationships | None supplied in this session | Prioritize any real warm Shopify/QBO introduction over cold volume |
| Owner's social audience | Publishing account not available | Share a real calculator demonstration and a clear beta invitation |

Sources: https://www.bookskeep.com/services/shopify-accounting-bookkeeping/ ; https://ledgergurus.com/ecommerce-accounting-services/shopify-accounting-services/ ; https://ledgergurus.com/

Once the link works, aim for 10 individually qualified conversations, 3 completed sandbox demonstrations, and 1 paid conversion after readiness. These are operating targets, not forecasts. Record date, source, workflow fit, reply, demo completion, purchase, and reason for declining. No paid advertising spend is committed.

## Deployment and launch acceptance

1. Restore Vercel access to the `raus2` team and `sync-stock` project. Verify its actual production URL and environment names without exposing values.
2. Provision/verify PostgreSQL and Redis. Back up any existing database. For an empty database run `npm run prisma:deploy`. If original tables already exist, compare them against `20260908190000_initial_schema` and baseline that migration only after confirming an exact match. Never reset a live database. Do not mark migrations applied merely to skip SQL errors.
3. Deploy a persistent worker service running `npm run worker`, with the same database, Redis, and OAuth settings as the web app. Vercel's web deployment alone does not run the BullMQ consumer. Confirm the worker is consuming jobs.
4. Configure Shopify development app and Intuit sandbox callback URLs. Connect both through OAuth using owner-controlled test accounts. Verify the approved Shopify distribution and billing path before a public app launch.
5. Run a paid development-store order through webhook → queue → worker → mapped QBO Sales Receipt. Verify amounts, currency, item and tax treatment, transaction date, and exactly one receipt after duplicate delivery and retry.
6. Exercise shipping/discount/tax-inclusive examples, unmapped products, QBO failure and rollback, refund/cancellation review, expired OAuth, and uninstall. Passing mathematical reconciliation alone is insufficient.
7. Verify Stripe in a test account: signup, checkout, subscription provisioning from signed invoice.paid, renewal ordering, duplicate invoice delivery, cancellation, and portal. Confirm the live business/payout onboarding separately. Never test by charging a customer without their action.
8. Complete actual support contact and business/legal details, then verify production signup, billing, and monitoring. Only then invite a customer to pay for live sync.

## Expansion decision

The recovered micro-SaaS brief's first product is Listing Loud: browser-based real-estate listing graphics for $8/year. Finish one usable sample plus verified payment entitlement and recovery before taking money. Do not claim that a Stripe product object is a finished application. Keep the real-estate audience and branding separate from the Shopify accounting funnel. The new free calculator is a related SyncStock acquisition tool, not a paid Listing Loud replacement.
