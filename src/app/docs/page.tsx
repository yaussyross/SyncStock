export const metadata = {
  title: "Documentation — SyncStock",
  description: "Setup and usage documentation for SyncStock's Shopify to QuickBooks Online order sync.",
};

export default function DocsPage() {
  return (
    <main className="container legal-doc">
      <h1>SyncStock Documentation</h1>
      <p className="updated">Shopify → QuickBooks Online order-sync setup</p>

      <h2>1. Open SyncStock from Shopify Admin</h2>
      <p>
        Install SyncStock and open it from the Apps section of your Shopify Admin. The embedded App Home
        shows your store connection, QuickBooks connection, current plan, mappings, and recent sync activity.
      </p>

      <h2>2. Connect QuickBooks Online</h2>
      <p>
        Select Connect QuickBooks and authorize the QuickBooks company you want SyncStock to use.
        Return to the embedded App Home after authorization and confirm the connection shows as connected.
      </p>

      <h2>3. Map products</h2>
      <p>
        Open Map products. For each store variant that should sync, choose the matching QuickBooks
        product or service. Leave variants set to Do not sync this variant when they should be excluded.
        Save the mappings before processing an order.
      </p>

      <h2>4. Choose a plan</h2>
      <p>
        Use Manage Shopify plan from App Home. Shopify hosts plan selection and billing. SyncStock does
        not ask merchants to enter payment-card details directly into the app.
      </p>

      <h2>5. Sync paid orders</h2>
      <p>
        SyncStock listens for supported paid-order events. Before writing a record, it checks saved mappings,
        calculates the expected accounting total, and checks whether the order has already been processed.
        Eligible orders are recorded in QuickBooks Online and appear in recent sync activity.
      </p>

      <h2>When an order is blocked</h2>
      <p>
        A missing mapping, unsupported accounting case, provider error, or reconciliation mismatch can stop
        an order from being written. Correct the underlying issue before retrying. SyncStock is designed to
        stop rather than silently create a record whose total cannot be reproduced.
      </p>

      <h2>Duplicate protection</h2>
      <p>
        Repeated webhook deliveries and eligible retries are tracked so the same supported order is not
        blindly written to QuickBooks a second time.
      </p>

      <h2>Billing</h2>
      <p>
        New paid subscriptions use Shopify-hosted App Pricing. Current plan information and plan changes are
        managed through Shopify.
      </p>

      <h2>Privacy</h2>
      <p>
        See the <a href="/privacy">Privacy Policy</a> for the information SyncStock processes, retention,
        service providers, security practices, and deletion options.
      </p>

      <h2>Need help?</h2>
      <p>
        Visit <a href="/support">Support</a> or email
        <a href="mailto:support@syncstock.app"> support@syncstock.app</a>.
      </p>
    </main>
  );
}
