# Astra handoff — SyncStock

Last updated: 2026-09-24 17:29 America/Chicago

Canonical repo: https://github.com/yaussyross/SyncStock  
Canonical production: https://sync-stock-six.vercel.app  
Shopify App Store submission: https://apps.shopify.com/services/partner-app-submissions/6ad1f2ea53500a6202c9a046f6be56df/en

## Owner operating rules

- Ross wants SyncStock taken as far as possible autonomously.
- Only stop for genuine human-only barriers.
- Always give Ross direct links and short, exact instructions.
- Any advertising spend, boost, paid service, fee, infrastructure upgrade, or other cash outflow requires Ross's explicit approval.
- Keep SyncStock separate from Forged Studios, Extra Social Club, and unrelated social accounts.
- Solo is $8/month.
- New public-app merchant billing uses Shopify App Pricing, not Stripe.
- Do not fabricate customers, revenue, approvals, capabilities, test results, or production verification.

## Current production state

- Canonical GitHub repo: `yaussyross/SyncStock`.
- Current main commit: `eed9f032d560d339eb90192b3c066abf179f0988`.
- Current canonical Vercel deployment: `dpl_FKTgRjF1ADAMxGSK92VF9gE1ucMw`.
- Canonical production deployment is **READY**.
- `https://sync-stock-six.vercel.app` is attached to the current production deployment.
- Vercel runtime error check for the latest hour returned **no runtime error clusters**.
- Public production routes checked successfully with HTTP 200:
  - /
  - /signup
  - /docs
  - /support
  - /privacy
  - /terms
  - /tools/bookkeeping-cost
- Production queue health endpoint returns HTTP 200 with `{"ok":true,"queueBridge":"authenticated"}`.

## Railway / worker state

Railway project: `SyncStock`.

Production services:
- `worker`: latest deployment **SUCCESS**
- `redis`: latest deployment **SUCCESS**
- `sandbox-24h`: latest deployment **SUCCESS**

Worker configuration:
- source repo: `yaussyross/SyncStock`
- branch: `main`
- one production replica
- start command: `npm run worker`
- healthcheck: `/health`
- worker and queue bridge are currently healthy

Important reliability follow-up:
- Redis currently has **no Railway volume mount**.
- Redis AOF is enabled, but Railway local filesystem is not durable across a service redeploy/replacement.
- Do not attach a paid volume without Ross's explicit approval.
- Tracked in issue #51:
  https://github.com/yaussyross/SyncStock/issues/51

## Database / Supabase state

Supabase project `shopify-qbo-sync` is **ACTIVE_HEALTHY**.

Sep 24 checks:
- Supabase security advisor returned no lints.
- Performance advisor only reported unused indexes at INFO level.
- Table inventory warns RLS is disabled, but SyncStock does not use the Supabase anon/authenticated Data API for application database access.
- Migration `20260911192500_revoke_supabase_data_api_access` revokes all table privileges from `anon` and `authenticated`.
- Direct checks confirmed both roles currently have no SELECT/INSERT/UPDATE/DELETE privileges on all current public tables.
- Do not enable RLS blindly; that could break server-side Prisma access.
- Defense-in-depth review is tracked in issue #49:
  https://github.com/yaussyross/SyncStock/issues/49

## Verified Shopify → QuickBooks acceptance

Current-production TEST order **#1007** passed the complete Shopify → queue → worker → QuickBooks sandbox path.

Verified accounting:
- Shopify total: **$10.00 USD**
- QuickBooks total: **$10.00 USD**
- reconciliation difference: **$0.00**
- QuickBooks transaction ID: **147**

Ross visually opened transaction 147 on Sep 24:
- Sales Receipt: `SS-7420505915673`
- Date: 09/23/2026
- Product/service: `Services`
- Description: `SyncStock Test Product`
- Quantity: 1
- Rate: $10.00
- Amount: $10.00

QuickBooks Sales transactions also visibly showed three SyncStock-created $10 paid receipts, with the latest on 9/23/26.

Do not confuse the Sales Receipt document number with QBO entity transaction ID 147.

## Live Shopify App Store submission state

Ross supplied the live Shopify Partner submission screen on Sep 24.

It reports exactly **2 issues to fix**:
1. **App testing information → Test account**
2. **Screencast URL**

Already complete:
- Feature media uploaded.
- Desktop Screenshot 1 uploaded.
- Desktop Screenshot 2 uploaded.
- Desktop Screenshot 3 uploaded.
- Screenshot 3 is the successful-order-sync screenshot.
- All other listing sections were clear of validation errors at the time of the live screenshot.

Do **not** send Ross back through:
- listing screenshots
- feature media
- generic listing content
- generic App testing information screenshots
- Cloudflare Email Routing

unless Shopify reports a new explicit validation error.

## Deferred human-only work

### Dedicated QuickBooks reviewer account

Ross reached QuickBooks Sandbox → Manage users → Add user → role picker.

Recommended role:
- **Standard all access**
- not Company admin

Ross explicitly said to **skip this until later**.

When resumed:
- create/accept a dedicated reviewer account
- do not use Ross's personal Intuit credentials
- enter username/password directly into Shopify App testing information
- never ask Ross to paste the password into ChatGPT

### Reviewer screencast

Still required.

Runbook:
`docs/APP_STORE_SCREENCAST.md`

Capture sequence:
1. Open SyncStock inside the TEST Shopify Admin.
2. Show QuickBooks connected.
3. Show saved mapping for SyncStock Test Product / SKU `SYNCSTOCK-TEST-10` → QuickBooks `Services`.
4. If showing plan selection, proceed only when Shopify shows $0 due for the development store.
5. Show successful order #1007 in Recent sync activity.
6. Show Shopify $10.00 → QuickBooks $10.00 / difference $0.00.
7. Avoid passwords, personal Intuit data, unrelated tabs, and PII.
8. Host the screencast at a URL reviewers can open without sign-in.
9. Paste that URL into Shopify's Screencast URL field.

## Support email

`support@syncstock.app` custom-domain routing remains unverified.

Ross explicitly said the Cloudflare Email Routing route was a dead end and should be skipped.

Current Shopify listing does **not** show support email as one of the two form blockers.

Treat this as an operational follow-up, not the immediate submission blocker:
https://github.com/yaussyross/SyncStock/issues/46

Do not retry Cloudflare routing unless Ross asks.
Do not buy a paid mail product without explicit approval.

## Work completed Sep 24

### PR #47 — merged
https://github.com/yaussyross/SyncStock/pull/47

Recorded:
- exact live App Store submission state
- verified QBO transaction 147
- current screenshot/media completion
- initial Astra handoff

### PR #48 — merged
https://github.com/yaussyross/SyncStock/pull/48

Removed stale “founding beta” wording from:
- Terms
- Billing
- Feedback surfaces

Added regression coverage so stale beta labels do not reappear.

Current production `/terms` now shows:
- Last updated September 24, 2026
- “Initial release” wording instead of beta wording

### PR #50 — merged
https://github.com/yaussyross/SyncStock/pull/50

Expanded reconciliation regression tests for:
- combined shipping + discounts + tax + duties + additional fees + tips
- edited-order current totals
- shipping-line fallback values
- blocking unmapped duties/additional fees

CI passed before merge.

## Known open GitHub follow-ups

- #46 — operational support-email follow-up
  https://github.com/yaussyross/SyncStock/issues/46
- #49 — Supabase RLS defense-in-depth review
  https://github.com/yaussyross/SyncStock/issues/49
- #51 — Railway Redis persistence / volume decision
  https://github.com/yaussyross/SyncStock/issues/51

These are not evidence that production is down.

## Best next actions for Astra

1. Re-verify canonical production after taking over:
   - Vercel `raus2/sync-stock`
   - runtime errors
   - `/api/health/queue`
   - Railway worker + Redis status
2. Check the Shopify submission page before asking Ross to act. The last verified blockers are only **Test account** and **Screencast URL**.
3. Continue autonomous code/launch hardening that does not require spending or Ross's credentials.
4. Do not ask Ross to resume the reviewer QuickBooks user until it is the next unavoidable submission action.
5. When that time comes, ask for only one human action at a time with a direct link.
6. Do not reopen completed screenshot/media work or Cloudflare routing.
7. Keep issue #51 visible before production merchant volume increases because Redis is currently non-durable across redeploys.

## Key links

- Repo: https://github.com/yaussyross/SyncStock
- Production: https://sync-stock-six.vercel.app
- Shopify submission: https://apps.shopify.com/services/partner-app-submissions/6ad1f2ea53500a6202c9a046f6be56df/en
- Shopify developer dashboard: https://dev.shopify.com/dashboard
- QuickBooks sandbox: https://sandbox.qbo.intuit.com/
- Issue #46: https://github.com/yaussyross/SyncStock/issues/46
- Issue #49: https://github.com/yaussyross/SyncStock/issues/49
- Issue #51: https://github.com/yaussyross/SyncStock/issues/51
