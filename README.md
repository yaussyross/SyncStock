# SyncStock

SyncStock is a reliability-first Shopify → QuickBooks Online micro-SaaS. The private beta is focused on one accounting workflow: a paid Shopify order should become one correct QuickBooks transaction, with visible errors and safe retries.

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

- **Solo — $19/mo:** up to 200 orders/month
- **Growth — $49/mo:** up to 1,000 orders/month
- **Pro — $99/mo:** unlimited orders + priority support
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

**Private beta / not ready for live accounting data yet.** Password authentication, product mapping, adjustment settings, refund/cancellation review, and billing-period enforcement exist in code. Launch still requires real Shopify/QuickBooks sandbox validation, deployment and worker verification, checkout/portal tests, concurrency hardening, monitoring, and completed business/support details. See [the launch record](docs/LAUNCH.md).
