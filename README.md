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

- **Solo — $8/mo:** up to 200 orders/month
- **Scale — $29/mo:** up to 1,000 orders/month
- **Empire — $49/mo:** unlimited orders
- Trial: first 20 synced orders, no card required

New public-app merchants are billed through Shopify. The legacy Stripe plan keys remain in the codebase only for backward compatibility and migration safety.

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
