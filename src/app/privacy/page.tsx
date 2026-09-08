export const metadata = { title: "Privacy Policy — SyncStock" };

export default function PrivacyPage() {
  return (
    <main className="container legal-doc">
      <h1>Privacy Policy</h1>
      <p className="updated">Last updated: [DATE — fill in before publishing]</p>
      <p>This Privacy Policy explains what information SyncStock ("we," "us," "our") collects, how we use it, and the commitment we make about it.</p>
      <h2>Our commitment</h2>
      <p><strong>We do not sell, rent, or share your business data or your customers' data with third parties for their marketing or advertising purposes.</strong> Data you connect through SyncStock — Shopify order details, QuickBooks account information — is used solely to provide the sync service to you, and for nothing else.</p>
      <h2>What we collect</h2>
      <ul><li>Account information: your email address.</li><li>Shopify order details needed to create the matching QuickBooks record.</li><li>QuickBooks company ID and OAuth tokens needed to post records on your behalf.</li><li>Billing information handled directly by Stripe; we do not store card details.</li><li>Basic usage and error data needed to operate and improve the Service.</li></ul>
      <h2>How we use it</h2><p>To authenticate you, sync orders into QuickBooks, enforce plan quotas, bill you, and provide customer support.</p>
      <h2>How we protect it</h2><p>Connected-account access tokens are encrypted at rest. Internal access to production data is limited to what is needed to operate and support the Service.</p>
      <h2>Third parties</h2><p>We use infrastructure providers and Stripe to operate the Service. They process data only as needed to provide those services under their own security and confidentiality obligations.</p>
      <h2>Data retention</h2><p>We retain operational data while your account is active and for a limited period afterward for support and legal purposes. You may request deletion.</p>
      <h2>Your choices</h2><p>You can disconnect Shopify or QuickBooks and may request a copy or deletion of your data by contacting support.</p>
      <h2>Children's privacy</h2><p>The Service is intended for business use and is not directed to children.</p>
      <h2>Changes</h2><p>If we make material changes, we will notify active users before they take effect.</p>
      <h2>Contact</h2><p>Questions about this policy or your data: support@syncstock.app</p>
    </main>
  );
}
