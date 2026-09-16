# Isolated sandbox and first customer handoff

Status: prepared locally; not deployed or provider-tested. No customer sale verified.

## Infrastructure and cost gate

The existing worker is deployed under Railway project SyncStock, service worker. Production web queue authentication passed on September 16. The separate successful-adaptation project contains another Redis service; its purpose is unverified. Do not delete or repurpose it based only on its name.

The connected Railway app returns variable names only. QBO environment cannot be inferred from those names or from a sample env file. The production database path was independently verified: unique internal note SS-DB-20260916-1908 submitted through the signed-in live feedback form appeared exactly once in shopify-qbo-sync.

All outgoing money now requires Ross's explicit permission. Before provisioning or deploying anything that could increase usage charges, show the exact service, purpose, billing estimate and spending limit. No infrastructure has been added by this change. Git pushes may automatically build previews: establish cost authorization before triggering one.

## Configuration for isolated testing

- Separate web deployment with SYNCSTOCK_SANDBOX=true, QBO_ENVIRONMENT=sandbox and APP_URL set to its exact HTTPS origin.
- Separate test PostgreSQL database and Redis queue; verify actual connection targets privately. Never paste database passwords in chat.
- Separate worker with SYNCSTOCK_SANDBOX=true, APP_URL pointing to that sandbox web deployment, and its own Redis connection.
- Set matching sandbox QUEUE_BRIDGE_SECRET on the web and worker. Set QUEUE_BRIDGE_URL on web to the sandbox worker HTTPS origin.
- Generate a unique Ed25519 signing pair: private PEM as base64 on worker in WORKER_SIGNING_PRIVATE_KEY_B64; public PEM as base64 on web in WORKER_SIGNING_PUBLIC_KEY_B64.
- Configure Shopify development-app and Intuit development credentials and callback allowlists for that exact APP_URL. Both callbacks are under /api/auth/{shopify|qbo}/callback.
- Keep Stripe test credentials on the sandbox even though the sandbox checkout route is blocked. Do not share production Stripe webhook delivery with sandbox.
- The sandbox worker rejects Vercel OIDC and accepts its own shared secret. Existing production identity checks are retained.
- URL checks reject known production defaults, but cannot discover custom aliases or prove database/Redis/key isolation. Inspect those separately before testing.

## Owner handoff

Ross has opened the correct Shopify development store and Intuit sandbox company. This does not save OAuth connections in SyncStock. After the isolated environment is verified, sign in there, connect the development store and select Sandbox Company US bd50 through Intuit authorization. Map one Shopify variant to a sandbox QuickBooks item.

## Acceptance record

Use a USD $10 development-store order, quantity one, no shipping, tax or discounts. Record web and worker commits, order ID, delivery IDs, queue outcome, receipt ID, receipt amount/item/date/currency and quota before/after. Replay the same delivery and a new delivery for the same order. Query the complete receipt count: exactly one; quota increases once. No real payment is required.

Broader supported accounting cases, cancellation, expired credentials, Stripe test checkout/portal and production distribution eligibility remain launch gates. Sandbox checkout intentionally stays disabled; test Stripe separately with test credentials.

## First customer offer (prepared, not sent)

Audience: a Shopify merchant already using QuickBooks Online who needs individual sales receipts and can start with a narrow workflow.

“Still copying Shopify orders into QuickBooks? SyncStock is in testing for paid-order sales receipts, product mapping and visible sync errors. We're inviting early merchants to review the workflow. Solo is $8/month once live onboarding is verified; no payment is needed for the initial walkthrough. Would you like to see whether it fits your store?”

Qualify currency, tax, discounts, shipping and refund expectations before accepting live books. Do not claim inventory sync, payout reconciliation, full bookkeeping or a completed integration test. Count a paid customer only after an actual successful subscription payment and usable onboarding; a scheduled post, demo, signup or sandbox order is not a sale.

## Validation completed locally

Production build (dummy credentials), TypeScript, core security/quota smoke tests, reconciliation smoke tests and sandbox bridge configuration checks passed. Real sandbox receipts, isolated deployed resources and a paid customer remain unverified.
