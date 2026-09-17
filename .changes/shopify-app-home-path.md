# Shopify App Home path compatibility

- Add `/app` as the canonical embedded App Home route while preserving the existing `/shopify/app` implementation.
- This aligns the public Shopify app with Shopify Admin's standard `/apps/{handle}/app` navigation and avoids refresh/deep-link 404s caused by the previous nested App URL path.
