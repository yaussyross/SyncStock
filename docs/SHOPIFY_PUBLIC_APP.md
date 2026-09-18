# SyncStock public Shopify app configuration

The production Shopify app is a **public, embedded** App Store app. The isolated development app remains custom-distributed and must not be repurposed.

## Dev Dashboard version

- App URL: `https://sync-stock-six.vercel.app/app` (canonical App Home; `/shopify/app` remains a compatibility route)
- Embed app in Shopify admin: **enabled**
- Redirect URL: `https://sync-stock-six.vercel.app/api/auth/shopify/callback` (legacy standalone OAuth compatibility; embedded App Home uses ID-token exchange)
- Webhooks API version: `2026-07`
- Scopes: `read_orders,read_products`

## Embedded authentication

App Home loads the latest App Bridge from Shopify's CDN and exposes the production client ID through the required `shopify-api-key` meta tag. Browser requests use Shopify ID tokens. The backend validates token signature, audience, expiry, issuer and shop origin, exchanges the ID token for an offline Admin API access token, provisions the store without a separate SyncStock signup, and registers the required order/lifecycle webhooks.

QuickBooks OAuth can leave the Shopify iframe at merchant interaction and returns to the Shopify Admin app route through a signed short-lived state token.

## Production credentials still required

The new public app's client ID and client secret must replace the old custom-app values in production after the embedded release has passed CI. `SHOPIFY_APP_HANDLE`, `SHOPIFY_APP_GID`, `SHOPIFY_PARTNER_ORG_ID`, and a Partner API token with Manage apps access are also required before Shopify App Pricing can be activated.

Never commit credential values.
