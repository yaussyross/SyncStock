# SyncStock

SyncStock is a reliability-first Shopify → QuickBooks Online micro-SaaS. The founding beta is focused on one accounting workflow: a paid Shopify order should become one correct QuickBooks transaction, with visible errors and safe retries.

## Product

- Shopify OAuth connection
- QuickBooks Online OAuth connection
- Paid-order webhook ingestion
- HMAC verification + webhook delivery deduplication
- BullMQ background sync worker
- Stable QuickBooks Sales Receipt document IDs for retry recovery
- Product mapping data model
- Sync log + manual retry
- Stripe subscription checkout
- Public marketing/pricing site

## Founding pricing

- **Solo — $8/mo:** up to 200 orders/month
- **Scale — $29/mo:** up to 1,000 orders/month
- **Empire — $49/mo:** unlimited orders + priority support
- Trial: first 20 synced orders, no card required

The internal Stripe plan keys remain `starter`, `growth`, and `unlimited` so existing environment variable names do not need to change.

## Stack

- Next.js 14
- Prisma + PostgreSQL
- BullMQ + Redis
- Stripe
- Shopify GraphQL Admin API
- QuickBooks Online

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

**Founding beta / core integration path verified in isolation.** On September 16, 2026, a paid Shopify development-store order completed the isolated Shopify → queue → worker → QuickBooks sandbox flow with an exact `$10.00` reconciliation, one quota increment, and duplicate protection. The hardened release is merged to `main`, CI is green, the production Vercel deployment is live, the production queue bridge is authenticated, and Supabase is healthy.

Before unrestricted live-accounting onboarding, still verify the Shopify production app's multi-store distribution approval, manually exercise the production signup/checkout/portal path with an authorized test merchant, and complete remaining beta edge-case checks such as shipping/discount/tax combinations, expired OAuth, uninstall, and refund/cancellation review. See [the launch record](docs/LAUNCH.md).
