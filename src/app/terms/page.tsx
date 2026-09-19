export const metadata = { title: "Terms of Service — SyncStock" };

export default function TermsPage() {
  return (
    <main className="container legal-doc">
      <h1>Terms of Service</h1>
      <p className="updated">Last updated: September 19, 2026</p>
      <p>These Terms govern your access to and use of SyncStock. By installing, creating an account for, or using SyncStock, you agree to these Terms.</p>

      <h2>1. Service</h2>
      <p>SyncStock connects Shopify with QuickBooks Online and automates supported accounting records. The founding beta is intentionally limited to supported workflows. SyncStock may block, queue, or require review of an order when it cannot safely reproduce the expected accounting result.</p>

      <h2>2. Your responsibilities</h2>
      <p>You are responsible for your Shopify and QuickBooks accounts, the accuracy of product mappings and business information you provide, reviewing records created by the service, maintaining appropriate backups and accounting controls, and complying with laws and third-party platform terms that apply to your business.</p>

      <h2>3. Plans, trial, and billing</h2>
      <p>New accounts begin with the published free-order allowance. New paid Shopify app subscriptions are billed through Shopify using the plan and billing interval shown before approval. You can manage or cancel the app subscription through Shopify. Any legacy SyncStock subscription previously created through Stripe may remain on its existing billing arrangement until it is migrated or cancelled. SyncStock does not charge a new paid plan without the approval required by the applicable billing platform.</p>

      <h2>4. Third-party services</h2>
      <p>SyncStock depends on Shopify, QuickBooks Online, and infrastructure providers. Their services, availability, APIs, and terms are outside our control. You authorize SyncStock to exchange the data needed to provide the integration after you connect those services.</p>

      <h2>5. Acceptable use</h2>
      <p>You may not use SyncStock to violate law, process data you are not authorized to use, interfere with the service, attempt unauthorized access, evade plan limits or security controls, or use the service to create fraudulent or misleading accounting records.</p>

      <h2>6. Accounting and tax responsibility</h2>
      <p>SyncStock is an automation tool, not accounting, tax, or legal advice. You remain responsible for deciding whether the records and workflow are appropriate for your business and for obtaining professional advice when needed.</p>

      <h2>7. Beta service and availability</h2>
      <p>SyncStock is currently offered as a founding beta. Features, supported accounting cases, plan limits, and availability may change as the service is improved. We do not guarantee uninterrupted or error-free operation, and we may suspend a sync or the service when needed to prevent data corruption, address security risk, perform maintenance, or respond to a third-party outage.</p>

      <h2>8. Data and privacy</h2>
      <p>Our Privacy Policy explains how SyncStock handles information. You authorize us to process connected-store and QuickBooks data as needed to provide the service.</p>

      <h2>9. Suspension and termination</h2>
      <p>You may stop using SyncStock at any time. We may suspend or terminate access for material violations of these Terms, security threats, unlawful use, nonpayment of an applicable paid plan, or when continued operation would create material risk to customer data or the service.</p>

      <h2>10. Disclaimers and liability</h2>
      <p>To the extent permitted by law, SyncStock is provided on an "as is" and "as available" basis. We are not responsible for indirect or consequential losses caused by use of the service or by failures of third-party platforms. Nothing in these Terms excludes rights or liabilities that cannot legally be excluded.</p>

      <h2>11. Changes</h2>
      <p>We may update these Terms as SyncStock changes. The current version and its effective date will remain available on this page. Material changes that affect active paid users will be communicated through a reasonable service channel when required.</p>

      <h2>12. Contact</h2>
      <p>Questions about these Terms: support@syncstock.app</p>
    </main>
  );
}
