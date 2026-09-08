export const metadata = { title: "Terms of Service — SyncStock" };

export default function TermsPage() {
  return (
    <main className="container legal-doc">
      <h1>Terms of Service</h1>
      <p className="updated">Last updated: [DATE — fill in before publishing]</p>
      <p>These Terms govern access to and use of SyncStock. By creating an account or using the Service, you agree to these Terms.</p>
      <h2>1. What the Service does</h2><p>SyncStock connects a merchant's Shopify store to QuickBooks Online and automates supported accounting records. You remain responsible for reviewing records for your accounting and tax needs.</p>
      <h2>2. Accounts</h2><p>You must provide accurate information and are responsible for activity under your account.</p>
      <h2>3. Subscription and billing</h2><p>Paid plans are billed monthly via Stripe. You may cancel at any time; cancellation takes effect at the end of the current billing period. Prices may change with advance notice.</p>
      <h2>4. Third-party services</h2><p>The Service depends on Shopify and QuickBooks Online. Your use of those platforms remains subject to their terms, and we are not responsible for their outages or API changes.</p>
      <h2>5. Acceptable use</h2><p>You may not use the Service to violate law, sync fraudulent data, or attempt unauthorized access.</p>
      <h2>6. Accounting disclaimer</h2><p>SyncStock is a sync tool, not accounting, tax, or legal advice. Consult qualified professionals for advice specific to your business.</p>
      <h2>7. Limitation of liability</h2><p>To the maximum extent permitted by law, liability is limited as described in the final launch version of these Terms. This private-beta draft requires legal review before public launch.</p>
      <h2>8. Termination</h2><p>We may suspend accounts that violate these Terms or present a security risk.</p>
      <h2>9. Changes</h2><p>We may update these Terms from time to time and will provide notice of material changes.</p>
      <h2>10. Contact</h2><p>Questions: support@syncstock.app</p>
    </main>
  );
}
