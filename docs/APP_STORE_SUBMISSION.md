# Shopify App Store submission working sheet

Last updated: September 21, 2026.

This file records factual listing copy and reviewer instructions for the public **SyncStock Production** app. It is a working sheet only; Shopify Partner Dashboard remains the source of truth for submission state.

## Basic app information

- Public app name: **SyncStock**
- Primary language: **English**
- Primary category: **Store management → Finances → Accounting**
- Languages supported: **English**
- Protected customer data: request only the minimum protected-data level required for order access. Do **not** request optional customer name, email, phone, or address fields because SyncStock does not need them for the supported workflow.

Category detail tags:
- Financial reports: **Not applicable**
- Financial operations: **Not applicable**
- Automated data sync: **Order details**, **Transactions**

## Listing content

Introduction:

> Send paid store orders to QuickBooks Online automatically. Keep bookkeeping records in sync.

Details:

> SyncStock connects Shopify with QuickBooks Online. When an order is paid, SyncStock creates a matching QuickBooks sales receipt using your product mappings and configured accounting items. It checks totals before completing the sync, avoids duplicate records, and logs sync results so you can review issues and retry eligible orders.

Features:
1. Automatically create QuickBooks sales receipts from paid orders
2. Map store variants to QuickBooks items for accurate bookkeeping
3. Check totals, prevent duplicates, and retry eligible sync failures

Demo store URL: leave blank unless a Shopify-owned review flow specifically requires one.

## Listing media

Feature image:
- Required size: **1600×900**
- Prepared asset: `syncstock_feature_media_1600x900.png`
- Alt text: **SyncStock dashboard showing paid orders syncing to QuickBooks Online**

Desktop screenshot 1:
- Real embedded App Home/status screen
- Required size: **1600×900**
- Prepared asset: `syncstock_screenshot_1_dashboard_1600x900.png`
- Alt text: **SyncStock dashboard showing Shopify and QuickBooks sync status**

Desktop screenshot 2:
- Real product-mapping screen with the TEST store and QuickBooks connected
- Required size: **1600×900**
- Prepared asset: `syncstock_screenshot_2_mapping_1600x900.png`
- Alt text: **Product mapping between store variants and QuickBooks items**

Desktop screenshot 3:
- Capture only after a real TEST-store paid-order sync succeeds in the current production embedded app.
- Preferred content: Recent sync activity showing a successful order with Shopify and QuickBooks totals.
- Alt text: **Order sync history with QuickBooks status and reconciliation results**
- Do not fabricate this screenshot or use an empty-state screen if a successful TEST-store result can be produced.

Mobile screenshots: optional; omit for initial submission unless Shopify requires them.

Point-of-sale screenshots: not applicable.

Integrations:
- **QuickBooks Online**

## Pricing

Founding monthly catalog:
- **Solo — $8/month — up to 200 orders/month**
- **Scale — $29/month — up to 1,000 orders/month**
- **Empire — $49/month — unlimited orders**

New accounts receive the first **20 synced orders free** with no card required.

New public merchants must use **Shopify-hosted App Pricing**. Do not configure new public subscriptions through legacy Stripe.

Verified Partner pricing state on September 21:
- Shopify App Pricing: **enabled**
- Public plans: **Solo $8/month**, **Scale $29/month**, **Empire $49/month**
- Billing: monthly recurring
- Free trial: 0 days
- Development stores: **Free for partners and developers** enabled
- Legacy private `shopify-test` plan remains separate and unchanged.

## Installation / data access

Required Admin API scopes:
- `read_orders`
- `read_products`

Current supported workflow:
1. Merchant installs SyncStock from Shopify.
2. SyncStock authenticates inside Shopify Admin using App Bridge ID tokens.
3. SyncStock obtains and refreshes Shopify expiring offline access tokens.
4. Merchant connects QuickBooks Online.
5. Merchant maps Shopify variants to QuickBooks products/services.
6. SyncStock receives paid-order webhooks, reconciles supported order totals, and creates one QuickBooks sales receipt for each supported paid order.

## Reviewer testing notes

Use a Shopify development/review store and a QuickBooks sandbox company. Do not use real customer orders or live customer books for review testing.

Recommended test:
1. Open SyncStock from Shopify Admin.
2. Verify Shopify shows connected and paid-order webhook ready.
3. Connect QuickBooks Online to a sandbox company.
4. Open **Map products**.
5. Map one Shopify test product to a QuickBooks product/service.
6. Select a Shopify-hosted plan using Shopify's development-store/no-charge review behavior if available.
7. Create/mark paid one supported test order for the mapped product.
8. Verify **Recent sync activity** shows success and matching Shopify/QuickBooks totals.
9. Verify a duplicate delivery/retry does not create a second QuickBooks transaction.

Supported narrow acceptance case: one paid order with mapped products. Refunds/cancellations are captured for review rather than silently mutating accounting records.

## Public URLs

- Production site: `https://sync-stock-six.vercel.app`
- Embedded app URL: `https://sync-stock-six.vercel.app/app`
- Shopify OAuth callback: `https://sync-stock-six.vercel.app/api/auth/shopify/callback`
- QuickBooks OAuth callback: `https://sync-stock-six.vercel.app/api/auth/qbo/callback`
- Privacy: `https://sync-stock-six.vercel.app/privacy`
- Terms: `https://sync-stock-six.vercel.app/terms`

## Do not submit until these gates are verified

- [x] Shopify App Pricing is configured for $8/$29/$49 monthly public plans with free development-store testing.
- Partner/App Pricing environment values are configured and the Partner API token has the required app-management permission.
- Shopify automated submission checks pass.
- Required app capabilities are selected.
- A successful current-production TEST-store order sync is captured for screenshot 3.
- Review instructions and all remaining Partner Dashboard fields are complete.
- `support@syncstock.app` is confirmed to be monitored before listing it as the merchant support mailbox.

No paid ad spend, boosts, fees, or other cash outflow may be initiated without Ross's explicit approval.

## Shopify App Store listing completion matrix — September 21

Current submission form reports ten remaining issue groups. Use the following values and assets.

### Basic app information

- App name: **SyncStock**
- Primary category: **Store management → Finances → Accounting**
- Category details:
  - Financial reports: **Not applicable** unless a matching report feature is actually shipped.
  - Financial operations: **Not applicable** unless the available tag exactly matches the shipped sales-receipt workflow.
  - Automated data sync: select the available **Order details** and **Transactions** tags.
- Languages: **English**

### App Store listing content

App introduction (under 100 characters and avoids using the Shopify trademark in this field):

> Send paid orders to QuickBooks Online automatically and keep bookkeeping records in sync.

App details:

> SyncStock connects your store with QuickBooks Online. When an eligible order is paid, SyncStock uses your saved product mappings to prepare the matching QuickBooks sales receipt, checks the expected total before writing, prevents duplicate processing, and keeps the sync result visible so you can review successes and retry eligible failures.

Features:
1. **Sync paid orders to QuickBooks Online automatically**
2. **Map store variants to the correct QuickBooks products and services**
3. **Block mismatched totals before records reach your books**
4. **Prevent duplicate records when deliveries or retries repeat**
5. **Review sync results and retry eligible orders from one place**

Feature media:
- Use a **1600×900** static image or a short listing video.
- The current release should use a unique image focused on the actual SyncStock UI; no Shopify logo, pricing, reviews, or outcome guarantees.
- Alt text: **SyncStock order-sync dashboard with QuickBooks connection and reconciliation status**

Desktop screenshots:
- Provide **3–6 unique 1600×900 screenshots**, cropped to the app UI without browser chrome or PII.
- Required capture set:
  1. App Home showing store, QuickBooks connection, plan, mapping count, and recent sync activity.
  2. Product mappings showing a store variant mapped to a QuickBooks product/service.
  3. Successful sync activity after the TEST-store paid-order acceptance run.
- Suggested alt text:
  - **SyncStock App Home with QuickBooks connection and sync status**
  - **SyncStock product mapping between a store variant and QuickBooks**
  - **SyncStock recent activity showing a successfully reconciled order**

Resources:
- Privacy policy: **https://sync-stock-six.vercel.app/privacy**
- Terms of service: **https://sync-stock-six.vercel.app/terms**
- Support: **https://sync-stock-six.vercel.app/support**
- Documentation: **https://sync-stock-six.vercel.app/docs**

### App testing information

- Do not provide Ross's personal Intuit credentials.
- Create a dedicated QuickBooks Online sandbox reviewer login that grants access to the company used by the SyncStock review flow and keep it active through review.
- Account description: **QuickBooks Online sandbox account used only for Shopify App Store review.**
- Testing instructions belong in the long Testing instructions field, not the 255-character account-description field.
- Screencast URL is required by the current form.
- Record the screencast only after the production TEST-store acceptance flow passes. Show install/open → QuickBooks connect → product mapping → Shopify-hosted plan selection → paid test order → successful recent sync/reconciliation.
- The screencast must be in English or have English subtitles.

### Public review surfaces

- Privacy policy exists at `/privacy`.
- Terms exist at `/terms`.
- Merchant support exists at `/support`.
- Setup documentation exists at `/docs`.
- Public marketing copy describes an initial release rather than a beta to avoid submitting a product explicitly labeled as a beta.
