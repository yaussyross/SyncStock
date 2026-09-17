# Shopify public embedded app

- Add latest Shopify App Bridge to the web app.
- Authenticate embedded requests with Shopify ID tokens.
- Exchange ID tokens for offline Admin API access tokens.
- Provision public-app installs without a separate SyncStock signup.
- Register required paid-order and lifecycle webhooks during embedded bootstrap.
- Add an embedded Shopify App Home for QuickBooks connection, product mapping, billing access, and sync visibility.
- Return QuickBooks OAuth back to the Shopify Admin app using signed short-lived state.
- Add iframe `frame-ancestors` protection for App Home.
