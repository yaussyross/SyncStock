# SyncStock

SyncStock is a reliability-first Shopify → QuickBooks Online micro-SaaS. The initial release focuses on one accounting workflow: a paid Shopify order should become one correct QuickBooks transaction, with visible errors and safe retries.

## Product

- Public embedded Shopify app with App Bridge / Shopify ID-token authentication
- QuickBooks Online OAuth connection
- Paid-order webhook ingestion
- HMAC verification + webhook delivery deduplication
- BullMQ background sync worker
- Stable QuickBooks Sales Receipt document IDs for retry recovery
- Explicit Shopify variant → QuickBooks item mapping
- Reconciliation checks, sync history, and manual retry
- Shopify-hosted App Pricing for new merchant subscriptions
- Legacy Stripe compatibility only for previously-created subscriptions
- Public marketing/pricing site

## Pricing

Approved catalog for the pending coordinated rollout:

- **Solo — $9 per Shopify 30-day billing cycle:** up to 100 orders
- **Scale — $19 per Shopify 30-day billing cycle:** up to 250 orders
- **Empire — $29 per Shopify 30-day billing cycle:** up to 1,000 orders
- Trial: first 20 successful order syncs free, once per account, with no card required
- Each successfully synced order counts once; duplicate deliveries and retries do not count again.
- Sync pauses at the cap, with no overage charges. Paid allowances reset with the next billing cycle; cancellation does not reset the one-time trial.

**Rollout status:** These repository changes are draft work, not evidence of a production or billing-provider update. The last verified Shopify catalog remains Solo $8/200 orders, Scale $29/1,000 orders, and Empire $49/unlimited. Coordinate Shopify App Pricing, deployed application behavior, and listing copy before making the new catalog live. Verify fresh provider state before rollout.

New public-app merchants are billed through Shopify. Existing legacy plan keys and their entitlements remain for backward compatibility and migration safety; this catalog change does not silently convert existing subscriptions.

## Stack

- Next.js 15
- Prisma + PostgreSQL / Supabase
- BullMQ + Redis / Railway
- Shopify GraphQL Admin API + App Bridge
- Shopify App Pricing
- QuickBooks Online
- Vercel

## Development

```bash
npm ci
npx prisma generate
npm run dev
```

Run the worker separately:

```bash
npm run worker
```

## Database migrations

Apply migrations before starting the app against a new database:

```bash
npx prisma migrate deploy
```

## Environment

Copy `.env.example` to `.env` and provide your own credentials. Never commit real credentials. Shopify webhook HMACs are verified with `SHOPIFY_API_SECRET`; a separate webhook secret is intentionally not used.

## Production status

**Core integration path verified in isolation.** On September 16, 2026, a paid Shopify development-store order completed the isolated Shopify → queue → worker → QuickBooks sandbox flow with an exact `$10.00` reconciliation, one quota increment, and duplicate protection.

As of September 23, the canonical production Vercel project is live on patched Next.js 15.5.24, the persistent Railway worker and Redis are healthy, Supabase is healthy, Shopify embedded App Home and mapping flows are live, QuickBooks reconnect handling is production-safe, failed/skipped syncs expose merchant recovery actions, and public legal/support/docs surfaces are deployed.

Current-production TEST order **#1007** completed the Shopify → queue → worker → QuickBooks sandbox path with an exact **$10.00 → $10.00** reconciliation, QuickBooks transaction **147**, and one trial-quota increment. The remaining public-launch gate is Shopify App Store submission/review: capture screenshot 3 and the reviewer screencast from this verified flow, then complete the remaining reviewer credentials/instructions. Broader accounting acceptance cases such as shipping/discount/tax combinations, uninstall, and refund/cancellation review remain follow-up verification work. See [the launch record](docs/LAUNCH.md).
