# Shopify App Store reviewer screencast runbook

Current-production acceptance is verified with TEST order **#1007**. Use this runbook to capture that proven flow for Shopify review.

Target length: **3–6 minutes**. Keep the recording in English, with no personal credentials, browser password prompts, unrelated tabs, or customer PII visible.

## Pre-recording checklist

- Production embedded app opens at:
  `https://admin.shopify.com/store/test-wc9egg3y/apps/syncstock-productionn/app`
- Shopify card shows paid-order webhook ready.
- QuickBooks sandbox shows connected.
- At least one explicit mapping exists.
- Preferred acceptance mapping:
  - Shopify product: **SyncStock Test Product**
  - SKU: **SYNCSTOCK-TEST-10**
  - QuickBooks item: **Services**
- Recent activity can be refreshed from App Home.
- Verified acceptance target: order **#1007**, Shopify **$10.00 USD**, QuickBooks **$10.00 USD**, difference **$0.00**.
- If Shopify App Pricing is shown during recording, continue only if the development store clearly shows **$0 due**.
- Do not expose Ross's personal Intuit credentials. Reviewer credentials must be a dedicated sandbox login.

## Recording sequence

### 0:00–0:30 — Open App Home

Open SyncStock from Shopify Admin.

Show:
- Store connected.
- QuickBooks connected.
- Plan/trial status.
- Mapping count.
- Setup readiness.

Suggested narration:

> SyncStock connects paid store orders to QuickBooks Online. The app verifies the store webhook, QuickBooks connection, and product mapping before it considers setup ready.

### 0:30–1:20 — Show product mapping

Click **Map products**.

Show the saved mapping:
- **SyncStock Test Product**
- SKU **SYNCSTOCK-TEST-10**
- QuickBooks **Services**

Suggested narration:

> Merchants explicitly choose the QuickBooks item for each store variant. SyncStock does not silently guess accounting mappings.

Do not change unrelated mappings solely for the recording.

### 1:20–1:50 — Show Shopify-hosted billing

If the store is eligible for no-charge development testing, click **Manage Shopify plan** and briefly show the Shopify-hosted plan selector.

Show:
- Solo — $8/month
- Scale — $29/month
- Empire — $49/month
- Development-store/no-charge state if Shopify displays it.

Do not approve a real charge. If Shopify displays any amount due now, stop this step and return to App Home.

### 1:50–3:00 — Create the supported paid test order

In the TEST development store, create an order using **SyncStock Test Product** only.

Mark the order paid using Shopify's development/test workflow. Do not enter a real card or create a real-money transaction.

Return to SyncStock App Home.

### 3:00–4:00 — Show successful reconciliation

Click **Refresh** if needed.

Show Recent sync activity with:
- Order number.
- **Synced** status.
- Shopify total.
- QuickBooks total.
- Matching totals.

Suggested narration:

> SyncStock processes the paid-order webhook through the background worker, creates the QuickBooks sales receipt for the mapped item, and records the result. A successful row shows matching Shopify and QuickBooks totals.

### 4:00–4:40 — Demonstrate recovery behavior

If a safe failed/skipped test row already exists, show that SyncStock displays the reason and offers **Map products** or **Retry** when eligible.

Do not intentionally corrupt live accounting data to manufacture a failure.

Suggested narration:

> If a mapping is missing or an eligible sync fails, the merchant sees the reason and can resolve the mapping and retry from the app. SyncStock blocks unsafe retries when a QuickBooks transaction already requires manual review.

### 4:40–5:10 — Close on App Home

Return to the clean App Home state and show:
- Ready status.
- QuickBooks connected.
- Mapping count.
- Successful recent sync.

## Final video checks

Before submitting the URL:
- Audio is understandable or English subtitles are present.
- No passwords, OAuth tokens, email inboxes, browser autofill, or personal Intuit information appear.
- No unrelated SaaS/product tabs appear.
- The successful sync shown is a real TEST-store result from current production.
- The video opens without requiring the Shopify reviewer to sign in to the video host.
- Keep the recording available for the full review period.

## Screenshot 3 capture point

Capture the App Home at 1600×900 with verified order **#1007** visible in Recent sync activity. The target row should show **Synced** with Shopify **$10.00** and QuickBooks **$10.00** totals. Do not fabricate or manually edit the status.
