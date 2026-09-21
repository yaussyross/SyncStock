export const metadata = {
  title: "Support — SyncStock",
  description: "Get help connecting SyncStock, QuickBooks Online, product mappings, billing, and order syncs.",
};

export default function SupportPage() {
  return (
    <main className="container legal-doc">
      <h1>SyncStock Support</h1>
      <p className="updated">Merchant help for setup, billing, mappings, and sync issues</p>

      <h2>Get help</h2>
      <p>
        Email <a href="mailto:support@syncstock.app">support@syncstock.app</a> with your store domain,
        the order number involved, and a short description of what you expected to happen. Do not send
        passwords, access tokens, API secrets, payment-card numbers, or other credentials by email.
      </p>

      <h2>Before contacting support</h2>
      <ul>
        <li>Open SyncStock from the Shopify Admin rather than from a standalone browser URL.</li>
        <li>Confirm QuickBooks Online shows as connected in SyncStock.</li>
        <li>Confirm each store variant you want processed is mapped to the intended QuickBooks item.</li>
        <li>For billing questions, use the Shopify-hosted plan screen linked from SyncStock.</li>
        <li>For a failed order, keep the order number available so the sync result can be traced.</li>
      </ul>

      <h2>Supported workflow</h2>
      <p>
        SyncStock processes supported paid orders, applies saved product mappings, checks the accounting
        total, prevents duplicate processing, and records eligible results in QuickBooks Online.
        Orders that cannot be reproduced safely are blocked for review instead of being forced into the books.
      </p>

      <h2>Privacy and account removal</h2>
      <p>
        You can uninstall SyncStock from Shopify and disconnect QuickBooks at any time. See the
        <a href="/privacy"> Privacy Policy</a> for data handling and deletion information.
      </p>

      <h2>Documentation</h2>
      <p>
        Setup and troubleshooting instructions are available in the <a href="/docs">SyncStock documentation</a>.
      </p>
    </main>
  );
}
