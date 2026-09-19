# SyncStock

SyncStock is a reliability-first Shopify → QuickBooks Online micro-SaaS. The founding beta is focused on one accounting workflow: a paid Shopify order should become one correct QuickBooks transaction, with visible errors and safe retries.

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

## Founding pricing

- **Solo — $8/mo:** up to 200 orders/month
- **Scale — $29/mo:** up to 1,000 orders/month
- **Empire — $49/mo:** unlimited orders
- Trial: first 20 synced orders, no card required

New public-app merchants are billed through Shopify. The legacy Stripe plan keys remain in the codebase only for backward compatibility and migration safety.

## Stack

- Next.js 14
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

**Founding beta / core integration path verified in isolation.** On September 16, 2026, a paid Shopify development-store order completed the isolated Shopify → queue → worker → QuickBooks sandbox flow with an exact `$10.00` reconciliation, one quota increment, and duplicate protection.

As of September 19, the canonical production Vercel project is live, the persistent Railway worker and Redis are healthy, Supabase is healthy, Shopify embedded App Home and mapping flows are merged, and the public legal/config surfaces have been updated for Shopify-hosted billing.

The remaining public-launch gate is Shopify-controlled production configuration and review: verify the production public-app/App Pricing configuration with an authorized test merchant, then complete broader beta accounting cases such as shipping/discount/tax combinations, expired OAuth, uninstall, and refund/cancellation review. See [the launch record](docs/LAUNCH.md).
