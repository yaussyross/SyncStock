# Astra handoff — SyncStock

Last updated: 2026-09-28 America/Chicago

Canonical repo: https://github.com/yaussyross/SyncStock  
Production: https://sync-stock-six.vercel.app  
Shopify submission: https://apps.shopify.com/services/partner-app-submissions/6ad1f2ea53500a6202c9a046f6be56df/en

## Operating rules

- Ross wants SyncStock taken as far as possible autonomously.
- Only stop for genuine human-only barriers.
- When Ross must act, give one exact action at a time with a direct link.
- Any ad spend, boost, paid service, infrastructure upgrade, fee, or other cash outflow requires Ross's explicit approval.
- Keep SyncStock separate from Forged Studios, Extra Social Club, and unrelated projects/accounts.
- Monthly pricing: Solo $8, Scale $29, Empire $49.
- New public-app merchant billing uses Shopify App Pricing, not Stripe.
- Do not fabricate customers, revenue, approvals, capabilities, or test results.
- Canonical code source is always `yaussyross/SyncStock`.

## Current repo / production

GitHub `main`:
- commit: `884f06640061d10db9e4d4669b26bcb59dd9cc9d`
- message: **Switch public support to monitored inbox (#56)**
- open PRs: **0**
- open issues: **0**

Canonical Vercel production:
- deployment: `dpl_FwzYotJ7AyUyc5BF6CDVWe3pcZun`
- state: **READY**
- commit: `884f06640061d10db9e4d4669b26bcb59dd9cc9d`
- target: production

## Railway / worker

Railway project:
- project ID: `aa52e9e3-f166-4d69-b761-fcc7aaa94f4d`
- production environment ID: `8a00eb51-7323-4786-ba7f-e20d93c5c7d9`

Production services:
- worker: **SUCCESS**
- redis: **SUCCESS**
- sandbox-24h: **SUCCESS**

Worker:
- service ID: `c8504bd0-1388-4bcd-a2bc-b100ed1a7b49`
- deployment ID: `d67de2b9-8f5e-49c4-b173-5cd2b956c00b`
- deployed commit: `54df7c223974da4120ed95dd2ca41c6933f5105c`
- healthcheck: `/health`
- healthcheck passed
- startup log: `Sync worker started on port 3000, waiting for jobs...`

The worker is on `54df7c2`; later `884f066` only changed public support/legal/docs surfaces and did not change worker code.

### Durable recovery

PR #53 is merged and its worker-side durable recovery is live:
- signed Vercel `/api/internal/recover-pending` call on worker startup
- repeat every 5 minutes
- recoverable Postgres-backed SyncLogs requeued with stable BullMQ job IDs

Issue #51 was closed after this zero-cost recovery path was verified. No paid Railway volume was added.

## Supabase / database security

Resolved:
- Supabase project `shopify-qbo-sync` verified healthy
- security advisor: no security lints
- `anon` / `authenticated`: zero public app-table privileges
- server-side Prisma/Postgres remains the app DB path
- no blind RLS change

PR #55 added a CI guard to fail if Data API roles regain public-table privileges. Issue #49 is closed.

## Public support

PR #56 removed the non-delivering `support@syncstock.app` address from public support/legal surfaces and replaced it with the monitored inbox:

**yaussyross@gmail.com**

Updated:
- `/support`
- `/privacy`
- `/terms`

Issue #46 is closed. Do not reopen Cloudflare Email Routing unless Ross asks.

## Verified Shopify → QuickBooks acceptance

TEST order **#1007** passed the full production flow.

Verified:
- Shopify: **$10.00 USD**
- QBO draft: **$10.00 USD**
- QBO actual: **$10.00 USD**
- difference: **$0.00**
- QBO transaction ID: **147**
- quota: **0/20 → 1/20**
- Vercel webhook: **200**
- Railway enqueue: **202**
- internal processor: **200**
- worker completed the job

QBO receipt:
- DocNumber: `SS-7420505915673`
- product/service: `Services`
- description: `SyncStock Test Product`
- qty 1 × $10.00
- Undeposited Funds

Do not confuse QBO transaction ID 147 with the receipt DocNumber.

## Shopify App Store submission

Last live Partner-screen verification: **September 24, 2026**.

At that time Shopify showed exactly **2 issues**:
1. **App testing information → Test account**
2. **Screencast URL**

Already completed:
- feature media
- desktop screenshots 1–3
- screenshot 3 shows successful production sync
- listing category/language/content/features/resources had no validation errors

Do not send Ross back through completed screenshots, feature media, generic listing copy, or Cloudflare routing unless Shopify shows a new explicit error.

### Screencast

Runbook: `docs/APP_STORE_SCREENCAST.md`

Embedded test app:
https://admin.shopify.com/store/test-wc9egg3y/apps/syncstock-productionn/app

Use:
- SyncStock Test Product
- SKU `SYNCSTOCK-TEST-10`
- QBO item `Services`
- order #1007 or a fresh supported test order
- show matching totals and $0 difference
- never expose passwords, tokens, personal Intuit data, unrelated tabs, or PII
- host video at a reviewer-accessible URL with no sign-in

## Current human blocker: reviewer QBO account

This is where the handoff stopped.

QuickBooks sent a confirmation email on September 24 saying:
- **Tessa** was invited as a **regular user**
- company: **Sandbox Company US bd50**

Ross cannot find the actual invitation in the target reviewer Gmail account.

The latest QBO browser state opened:
- `qbo.intuit.com/app/setup?.../onboarding/welcome`
- screen text: **Get set up fast with AI and expert guidance**

That is the wrong onboarding/company context for managing the existing sandbox invite.

### Next action for Astra

Get into the existing **Sandbox Company US bd50** as the sandbox admin, then open Manage users and inspect Tessa:
- if pending: **Resend invite**
- if active: do not resend
- confirm the target email before resending
- never ask Ross to paste the reviewer password into ChatGPT
- once accepted, enter credentials directly into Shopify **Test account**

Sandbox:
https://sandbox.qbo.intuit.com/

If QBO routes to new-company onboarding, switch to the correct sandbox company/account context rather than creating another company.

## Outreach / revenue

Hunter sender:
- **yaussyross@gmail.com**
- Gmail
- active
- Hunter daily limit: 15

Hunter lead list:
- **SyncStock Outreach**
- list ID: `30966360`

Sent to **11 prospects**:
- Warren Allen — Elite Truck
- Tamara Falcone — ezpz
- Gary Rodgers — Texas Engraved
- Elyse Burns — Elyse Breanne Design
- Joseph Strong — Blabla Kids
- Nina Skaggs — Avid Armor
- Craig Winer — Garrett Wade
- Marybeth Dutile — The Woolly Thistle
- Michael Scully — Mr. Steak
- Philippe Berdugo — Wellbots
- Jason Ho — The Shipping Store

Outreach facts:
- first 20 orders free
- Solo $8/month
- compliant commercial footer / opt-out used
- do not claim a merchant uses QBO unless independently verified

Latest manual mailbox check: **no replies from these 11 prospects**.

An hourly automation named **SyncStock Reply Watch** is enabled to watch replies, bounces, and opt-outs and respond to genuine interested prospects using verified product facts.

## Latest completed PRs

- #53 — durable queue recovery
- #54 — calculator / launch pricing copy
- #55 — Supabase Data API privilege regression guard
- #56 — monitored support inbox

## Astra takeover priorities

1. Do not rebuild solved infrastructure work.
2. Resolve the existing Tessa reviewer-account invitation.
3. Complete the reviewer screencast.
4. Recheck Shopify's live submission page before asking Ross to redo anything.
5. Continue conservative no-spend outbound and reply handling.
6. No spending without explicit approval.
7. Interrupt Ross only for a genuine human-only barrier.

## Key links

- Repo: https://github.com/yaussyross/SyncStock
- Production: https://sync-stock-six.vercel.app
- Shopify submission: https://apps.shopify.com/services/partner-app-submissions/6ad1f2ea53500a6202c9a046f6be56df/en
- Shopify developer dashboard: https://dev.shopify.com/dashboard
- Embedded test app: https://admin.shopify.com/store/test-wc9egg3y/apps/syncstock-productionn/app
- QuickBooks sandbox: https://sandbox.qbo.intuit.com/
- Railway worker: https://railway.com/project/aa52e9e3-f166-4d69-b761-fcc7aaa94f4d/service/c8504bd0-1388-4bcd-a2bc-b100ed1a7b49?environmentId=8a00eb51-7323-4786-ba7f-e20d93c5c7d9
- Screencast runbook: https://github.com/yaussyross/SyncStock/blob/main/docs/APP_STORE_SCREENCAST.md
