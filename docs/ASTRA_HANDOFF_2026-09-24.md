# Astra handoff — SyncStock

Last updated: 2026-09-24 America/Chicago

Canonical repo: https://github.com/yaussyross/SyncStock  
Canonical production: https://sync-stock-six.vercel.app  
Shopify App Store submission: https://apps.shopify.com/services/partner-app-submissions/6ad1f2ea53500a6202c9a046f6be56df/en

## Owner operating rules

- Ross wants SyncStock taken as far as possible autonomously.
- Only stop for genuine human-only barriers.
- Always give Ross direct links and short, precise instructions.
- Any advertising spend, boost, paid service, fee, or other cash outflow requires Ross's explicit approval.
- Keep SyncStock separate from Forged Studios, Extra Social Club, and unrelated social accounts.
- Solo is $8/month. New public-app merchant billing uses Shopify App Pricing, not Stripe.
- Do not fabricate customers, revenue, capabilities, approvals, or production verification.

## Current verified product state

- Canonical GitHub repository access is working with admin permission.
- Canonical Vercel project is `raus2/sync-stock`.
- Production main commit before this docs PR: `d086e6f1b40a8087180385145aec9231208c18dc`.
- That production deployment was READY and had no runtime error clusters in the checked prior 24-hour window.
- The obsolete duplicate Vercel project `sync-stock-s5j9` can emit a failed/pending status. Do not treat it as canonical production.
- PR #45, “Recognize Shopify no-charge test plan entitlements,” is merged.
- Current-production TEST order #1007 passed Shopify -> queue -> worker -> QuickBooks sandbox.
- Verified reconciliation: Shopify $10.00 -> QuickBooks $10.00; difference $0.00.
- Verified QuickBooks transaction ID: 147.
- Ross visually opened QBO transaction 147 on Sep 24. It showed:
  - Sales Receipt # SS-7420505915673
  - Date 09/23/2026
  - Product/service: Services
  - Description: SyncStock Test Product
  - Qty 1
  - Rate $10.00
  - Amount $10.00
- QuickBooks Sales transactions also showed three SyncStock-created $10 paid sales receipts, with the latest on 9/23/26.

## Live Shopify App Store submission state

Ross supplied the live Shopify Partner submission screen on Sep 24. It reports exactly **2 issues to fix**:

1. **App testing information: Test account**
2. **Screencast URL**

Already complete in the live listing:
- Feature media image uploaded.
- Desktop Screenshot 1 uploaded.
- Desktop Screenshot 2 uploaded.
- Desktop Screenshot 3 uploaded.
- Screenshot 3 is the successful-order-sync image.
- Other listing sections were clear of form errors at the time of the screenshot.

Do **not** send Ross back through screenshots, feature media, basic listing content, or generic testing-info screenshots unless Shopify reports a new validation error.

## Deferred human-only work

### 1. Dedicated QuickBooks reviewer test account

Ross started QuickBooks Sandbox -> Manage users -> Add user and reached the role picker.

Recommended role: **Standard all access**, not Company admin.

Ross explicitly said: **skip this till later**.

When he resumes:
- Create/accept a dedicated reviewer account.
- It must not require Ross's personal Intuit credentials.
- Enter the reviewer username/password directly into Shopify App testing information.
- Do not ask Ross to paste the password into ChatGPT.

### 2. Reviewer screencast

Still required by the Shopify form.

Runbook: `docs/APP_STORE_SCREENCAST.md`

Use the proven flow:
- Open SyncStock in TEST Shopify Admin.
- Show QuickBooks connected.
- Show saved mapping: SyncStock Test Product / SKU SYNCSTOCK-TEST-10 -> QuickBooks Services.
- If showing Shopify plan selection, proceed only if development-store price due is $0.
- Show paid TEST order and successful Recent sync activity.
- Anchor to verified order #1007 and $10 -> $10 reconciliation.
- No real payment, personal credentials, unrelated tabs, or PII.
- Host at a URL Shopify reviewers can open without sign-in and paste that URL into Screencast URL.

## Support email

Cloudflare Email Routing for `support@syncstock.app` was a dead end and Ross explicitly said Astra already tried it. Do not reopen that path unless Ross asks.

The current Shopify listing does **not** show support email as one of its two submission errors. Treat support-mail routing as a separate operational follow-up, not the immediate App Store blocker.

GitHub issue #46 tracks this separately:
https://github.com/yaussyross/SyncStock/issues/46

A Sep 24 comment was added to issue #46 clarifying that the current live listing only reports Test account and Screencast URL.

## Work completed in this handoff session

Created branch:
`docs/refresh-app-store-live-state-2026-09-24`

Opened PR #47:
https://github.com/yaussyross/SyncStock/pull/47

PR title: **Refresh live App Store submission state**

Updated:
- `docs/APP_STORE_SUBMISSION.md`
- `docs/LAUNCH.md`

Changes record:
- Live listing now has only two form blockers.
- Feature media and all 3 desktop screenshots are already uploaded.
- QuickBooks transaction 147 was re-verified visually.
- Cloudflare Email Routing should not be reopened as the current listing blocker.
- Current Vercel canonical/duplicate-project distinction remains documented.

At the moment of this handoff:
- PR #47 is **open and mergeable**.
- SyncStock CI run #250 is **in progress**.
- Canonical Vercel preview status for PR #47 is **pending**.
- Duplicate `sync-stock-s5j9` preview is also pending and is not canonical.

Before merging PR #47:
1. Wait for SyncStock CI to finish successfully.
2. Verify the canonical Vercel `sync-stock` preview is READY/success.
3. Ignore the duplicate `sync-stock-s5j9` result unless it reveals a real code problem also present in canonical.
4. Then merge PR #47 if checks are clean.

## Best next autonomous actions for Astra

1. Check PR #47 CI and canonical Vercel preview; merge when clean.
2. Re-check canonical production after merge and confirm no runtime error clusters.
3. Do not ask Ross for the deferred QuickBooks reviewer account until needed to finish submission.
4. Prepare the exact screencast capture sequence and the final testing instructions so Ross only has to record/upload when ready.
5. Keep the next human ask to one concise barrier at a time with a direct link.

## Links

- GitHub repo: https://github.com/yaussyross/SyncStock
- PR #47: https://github.com/yaussyross/SyncStock/pull/47
- Production app: https://sync-stock-six.vercel.app
- Shopify submission: https://apps.shopify.com/services/partner-app-submissions/6ad1f2ea53500a6202c9a046f6be56df/en
- Shopify developer dashboard: https://dev.shopify.com/dashboard
- QuickBooks sandbox: https://sandbox.qbo.intuit.com/
