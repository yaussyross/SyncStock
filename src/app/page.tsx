import Footer from "@/components/Footer";

const proofPoints = [
  ["01", "Paid-order trigger", "Sync starts from Shopify's paid-order event, not a manual export."],
  ["02", "Mapping first", "Shopify variants are explicitly mapped to QuickBooks items before money moves."],
  ["03", "Duplicate defense", "Repeated deliveries are tracked so retries do not blindly create another receipt."],
  ["04", "Reconcile or stop", "If the accounting total cannot be reproduced safely, SyncStock blocks the write."],
];

const plans = [
  {
    name: "Solo",
    price: "$8",
    description: "For owner-operated stores",
    orders: "Up to 200 orders / month",
    features: ["Automatic paid-order sync", "Product mapping", "Sync history + retries", "Email support"],
    featured: false,
  },
  {
    name: "Scale",
    price: "$29",
    description: "For stores with steady volume",
    orders: "Up to 1,000 orders / month",
    features: ["Everything in Solo", "Higher monthly volume", "Reconciliation audit trail", "Email support"],
    featured: true,
  },
  {
    name: "Empire",
    price: "$49",
    description: "For high-volume operators",
    orders: "Unlimited orders",
    features: ["Everything in Scale", "Unlimited order volume", "Advanced controls as released", "Email support"],
    featured: false,
  },
];

export default function LandingPage() {
  return (
    <>
      <main className="launch-site">
        <div className="launch-glow launch-glow-one" />
        <div className="launch-glow launch-glow-two" />

        <div className="container">
          <nav className="nav launch-nav" aria-label="Main navigation">
            <a className="wordmark" href="/" aria-label="SyncStock home">Sync<span>Stock</span></a>
            <div className="nav-links">
              <a href="#product">Product</a>
              <a href="#pricing">Pricing</a>
              <a href="/tools/bookkeeping-cost">Free calculator</a>
              <a href="/feedback">Feedback</a>
              <a href="/login">Sign in</a>
              <a href="/signup" className="btn btn-small">Start with 20 free</a>
            </div>
          </nav>

          <section className="hero launch-hero">
            <div className="hero-copy">
              <div className="kicker"><span className="status-dot" /> Initial release · accepting merchants</div>
              <h1>Shopify orders in.<br /><span className="headline-accent">Clean QuickBooks out.</span></h1>
              <p className="lede">
                SyncStock is a focused Shopify → QuickBooks workflow for merchants who are done copying orders by hand — and unwilling to trust automation that fails silently.
              </p>
              <div className="hero-actions">
                <a href="/signup" className="btn btn-large">Start with 20 free orders</a>
                <a href="#product" className="text-link">See the workflow <span>↘</span></a>
              </div>
              <div className="launch-proof-row">
                <div><strong>20</strong><span>free synced orders</span></div>
                <div><strong>$0</strong><span>card required to test</span></div>
                <div><strong>1→1</strong><span>order-to-receipt goal</span></div>
              </div>
            </div>

            <div className="launch-console-wrap">
              <div className="console-orbit" />
              <div className="sync-console launch-console" aria-label="Example SyncStock order sync">
                <div className="console-topline">
                  <span className="mono">SYNCSTOCK / ORDER PIPELINE</span>
                  <span className="console-live"><span className="status-dot" /> illustrative workflow</span>
                </div>
                <div className="launch-stage">
                  <div className="launch-stage-top"><span>01 · SHOPIFY</span><span className="badge badge-success">PAID</span></div>
                  <div className="launch-stage-main"><strong>#4821</strong><span>$58.00 USD</span></div>
                  <p>2 mapped items · tax included</p>
                </div>
                <div className="pipeline-line"><span>validated</span><i /><span>mapped</span><i /><span>deduped</span><i /><span>reconciled</span></div>
                <div className="launch-stage launch-stage-qbo">
                  <div className="launch-stage-top"><span>02 · QUICKBOOKS</span><span className="badge badge-success">READY</span></div>
                  <div className="launch-stage-main"><strong>Sales Receipt</strong><span>$58.00 USD</span></div>
                  <p>Stable reference · verified total</p>
                </div>
                <div className="console-footer-line"><span>No silent mismatch.</span><strong>Stop before bad books.</strong></div>
              </div>
            </div>
          </section>
        </div>

        <section className="signal-strip">
          <div className="container signal-grid">
            <div><span>BUILT FOR</span><strong>Shopify merchants</strong></div>
            <div><span>CONNECTS TO</span><strong>QuickBooks Online</strong></div>
            <div><span>PRIORITY</span><strong>Accounting correctness</strong></div>
            <div><span>STATUS</span><strong>Initial release</strong></div>
          </div>
        </section>

        <section className="container section launch-problem" id="product">
          <div className="launch-section-intro">
            <p className="section-kicker">WHY SYNCSTOCK EXISTS</p>
            <h2>The dangerous part is not automation.<br />It is automation you cannot audit.</h2>
            <p>Generic connectors can move data quickly. SyncStock is being built to make the Shopify → QuickBooks path inspectable, conservative, and recoverable when something does not add up.</p>
          </div>

          <div className="proof-grid">
            {proofPoints.map(([number, title, copy]) => (
              <article className="proof-card" key={number}>
                <span className="proof-number mono">{number}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="workflow-band">
          <div className="container section">
            <div className="workflow-heading">
              <div>
                <p className="section-kicker">THE WORKFLOW</p>
                <h2>Four steps. No mystery box.</h2>
              </div>
              <p>Initial-release onboarding stays intentionally narrow so merchants can configure the core path safely before expanding usage.</p>
            </div>
            <div className="workflow-steps">
              <div><span>01</span><h3>Connect</h3><p>Authorize Shopify and QuickBooks Online.</p></div>
              <div><span>02</span><h3>Map</h3><p>Match Shopify variants to the correct QuickBooks items.</p></div>
              <div><span>03</span><h3>Verify</h3><p>SyncStock drafts the accounting result and checks the totals.</p></div>
              <div><span>04</span><h3>Record</h3><p>Only reconciled orders proceed; blocked orders stay visible for review.</p></div>
            </div>
          </div>
        </section>

        <section className="container section launch-trust">
          <div className="trust-panel">
            <div className="trust-copy">
              <p className="section-kicker">RELIABILITY STANDARD</p>
              <h2>We would rather stop a sync than guess with your books.</h2>
              <p>SyncStock focuses on supported accounting workflows, blocks unsupported cases before they reach QuickBooks, and keeps sync results visible so merchants can review what happened.</p>
              <div className="trust-actions">
                <a className="btn" href="/signup">Start with 20 free orders</a>
                <a className="btn btn-secondary" href="/feedback">Leave feedback</a>
              </div>
            </div>
            <div className="trust-stack">
              <div><span className="status-dot" /><p><strong>Encrypted connection tokens</strong><br />OAuth tokens are stored encrypted at rest.</p></div>
              <div><span className="status-dot" /><p><strong>Audit-oriented sync history</strong><br />Successes, blocked orders, and retry state remain visible.</p></div>
              <div><span className="status-dot" /><p><strong>Direct feedback queue</strong><br />Signed-in customers can send bugs, onboarding friction, and feature requests directly from SyncStock.</p></div>
            </div>
          </div>
        </section>

        <section className="pricing-wrap launch-pricing" id="pricing">
          <div className="container section">
            <div className="section-heading pricing-heading">
              <div>
                <p className="section-kicker">LAUNCH PRICING</p>
                <h2>Simple pricing while we prove the core.</h2>
              </div>
              <p>Every account starts with 20 free synced orders. No card required to test the workflow.</p>
            </div>
            <div className="pricing-grid">
              {plans.map((plan) => (
                <article className={`pricing-card${plan.featured ? " featured" : ""}`} key={plan.name}>
                  {plan.featured && <div className="popular-tag">SCALE PLAN</div>}
                  <div className="plan-top">
                    <div><h3>{plan.name}</h3><p>{plan.description}</p></div>
                    <div className="price"><strong>{plan.price}</strong><span>/mo</span></div>
                  </div>
                  <div className="order-limit">{plan.orders}</div>
                  <ul>{plan.features.map((item) => <li key={item}><span>✓</span>{item}</li>)}</ul>
                  <a className={plan.featured ? "btn pricing-button" : "btn btn-secondary pricing-button"} href="/signup">Start free</a>
                </article>
              ))}
            </div>
            <p className="pricing-note">Launch pricing may change as the product expands. Existing paid customers receive advance notice of pricing changes.</p>
          </div>
        </section>

        <section className="container section faq-section launch-faq">
          <div className="section-heading">
            <div><p className="section-kicker">FAQ</p><h2>Know what you are connecting.</h2></div>
          </div>
          <div className="faq-grid">
            <div><h3>What does SyncStock focus on?</h3><p>Paid Shopify orders → QuickBooks Online sales receipts, explicit product mapping, reconciliation checks, retry safety, and visible sync history.</p></div>
            <div><h3>What happens if the totals do not match?</h3><p>The order is blocked rather than forced into QuickBooks. The goal is to make unsupported or questionable accounting visible instead of silently writing it.</p></div>
            <div><h3>Can I try it before paying?</h3><p>Yes. New accounts start with 20 free synced orders and do not require a card to create the account.</p></div>
            <div><h3>Can I send product feedback?</h3><p>Yes. Signed-in users can submit bugs, feature requests, onboarding friction, and ratings through the in-product feedback page.</p></div>
          </div>
        </section>

        <section className="container final-cta launch-final-cta">
          <div>
            <p className="section-kicker">INITIAL RELEASE</p>
            <h2>Stop babysitting order entry.</h2>
            <p>Connect the workflow, map your products, and help shape the focused Shopify → QuickBooks tool you actually want to use.</p>
          </div>
          <a href="/signup" className="btn btn-large">Start with 20 free orders</a>
        </section>
      </main>
      <Footer />
    </>
  );
}
