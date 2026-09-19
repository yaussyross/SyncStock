export const metadata = { title: "Privacy Policy — SyncStock" };

export default function PrivacyPage() {
  return (
    <main className="container legal-doc">
      <h1>Privacy Policy</h1>
      <p className="updated">Last updated: September 19, 2026</p>
      <p>This Privacy Policy explains how SyncStock ("we," "us," "our") handles information when you use the SyncStock Shopify-to-QuickBooks service.</p>

      <h2>Information we process</h2>
      <ul>
        <li>Shopify store and app identifiers needed to authenticate the installation and operate the integration.</li>
        <li>Shopify order and product information needed to map and create supported QuickBooks records.</li>
        <li>QuickBooks company identifiers and OAuth credentials needed to connect to QuickBooks Online and create records you authorize.</li>
        <li>Account or support contact information you provide to us.</li>
        <li>Subscription status and plan information needed to enforce plan limits. New paid subscriptions are billed through Shopify; SyncStock does not store full payment-card details.</li>
        <li>Operational logs, sync status, error details, and feedback needed to secure, support, and improve the service.</li>
      </ul>

      <h2>How we use information</h2>
      <p>We use information to authenticate connected stores, map products, process supported paid orders, create authorized QuickBooks records, reconcile sync results, prevent duplicate processing, enforce plan limits, respond to support requests, and maintain the security and reliability of the service.</p>

      <h2>Customer data</h2>
      <p>SyncStock processes Shopify order data only as needed to provide the integration. We do not sell customer or merchant data, and we do not use connected-store data for third-party advertising.</p>

      <h2>Service providers</h2>
      <p>We use service providers to host and operate SyncStock, including Shopify, Intuit QuickBooks, Vercel, Railway, and Supabase. They may process information on our behalf as required to provide their services. Legacy subscriptions created before the move to Shopify-hosted billing may continue to be processed by Stripe until they are migrated or cancelled.</p>

      <h2>Security</h2>
      <p>Connected-account access tokens are encrypted at rest. We use authenticated internal service connections and limit production-data access to what is needed to operate and support SyncStock. No internet service can guarantee absolute security.</p>

      <h2>Retention and deletion</h2>
      <p>We retain operational records for as long as needed to provide the service, resolve support and accounting-sync issues, meet legal obligations, and protect the service. When Shopify sends mandatory customer or shop redaction requests, SyncStock processes those requests through its compliance webhook and deletes covered Shopify-derived records. Uninstalling the app removes the Shopify access connection and product mappings; additional records are removed when applicable redaction requests are received.</p>

      <h2>Your choices</h2>
      <p>You can uninstall SyncStock from Shopify, disconnect QuickBooks, and contact us to request access to or deletion of information associated with your SyncStock account, subject to legal and operational retention requirements.</p>

      <h2>Children</h2>
      <p>SyncStock is intended for business users and is not directed to children.</p>

      <h2>Changes</h2>
      <p>We may update this policy as the service changes. The current version and its effective date will remain available on this page.</p>

      <h2>Contact</h2>
      <p>Privacy or data questions: support@syncstock.app</p>
    </main>
  );
}
