# SyncStock Astra execution log — 2026-09-30

Canonical execution chat takeover checkpoint.

## Verified current state

- GitHub `main`: `99a1f5ec935f2d1f065e32fd43ddc3e95b55c74c` — Retire public Stripe checkout before App Store submission (#60).
- GitHub Actions run 284 on that commit: completed successfully.
- Canonical Vercel project `sync-stock`: production deployment `dpl_EpPcEvU21zbEeHNMrXGUfg63Amif`, state READY, target production, same commit.
- Obsolete duplicate Vercel project `sync-stock-s5j9` still reports a failed status and is not the production project.
- Vercel production runtime errors: none in the checked one-hour window after the current deployment.
- Production queue bridge probe `/api/health/queue`: HTTP 200 with authenticated worker bridge.
- Railway project `SyncStock`: worker SUCCESS, Redis SUCCESS, sandbox-24h SUCCESS.
- Worker is sourced from `yaussyross/SyncStock` / `main`; deployed worker commit remains `54df7c2`. Later merged changes through #60 do not require a worker behavior change for the verified launch path.
- Supabase project `shopify-qbo-sync`: ACTIVE_HEALTHY; security advisor reports no security lints.
- Supabase table listing emitted a generic RLS-disabled warning. Direct privilege verification found zero `anon` or `authenticated` table privileges in `public`, consistent with SyncStock's intentional server-side Prisma/Postgres design. Do not enable RLS blindly.
- Latest acceptance sync: TEST order #1009 is `success`, Shopify $10.00, QBO draft $10.00, QBO actual $10.00, difference $0.00, QBO transaction ID 148.
- Earlier TEST order #1007 also remains `success` at $10.00 / $10.00 with $0.00 difference.
- Shopify connection has the expected read scopes and paid-order/refund/cancel/uninstall webhook registrations.
- Public Stripe checkout has been intentionally retired for App Store compliance; Shopify App Pricing is the only path for new merchant subscriptions.

## Current launch gate

Shopify preliminary/common-error and embedded-app checks are recorded complete. Listing assets, reviewer credentials, screencast, and the no-charge development-store paid-order acceptance are complete.

The remaining live billing decline/cancel-return edge case is now verified: Solo was Current, Scale opened Shopify's free-to-test approval screen, Cancel returned to the plan selector, and Solo remained Current with no plan change or charge. Existing state-transition CI coverage also passes.

The owner-controlled Shopify submission still requires final requirements attestations and the Submit for review action. Existing screenshots, media, reviewer setup, infrastructure, and successful sync acceptance should not be repeated unless Shopify presents a new explicit error.
