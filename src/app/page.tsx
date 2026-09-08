import Footer from "@/components/Footer";

const features = [
  {
    eyebrow: "01 / AUTOMATE",
    title: "Paid orders move without manual entry",
    body: "SyncStock listens for paid Shopify orders and prepares the matching QuickBooks Online sales receipt automatically.",
  },
  {
    eyebrow: "02 / CONTROL",
    title: "Map products once, then keep moving",
    body: "Connect Shopify SKUs to QuickBooks items so each order lands in the right place instead of creating accounting cleanup later.",
  },
  {
    eyebrow: "03 / TRUST",
    title: "Every sync leaves an audit trail",
    body: "See what synced, what needs attention, and why. Failed orders stay visible and can be retried after you fix the underlying issue.",
  },
];

const plans = [
  {
    name: "Solo",
    price: "$19",
    suffix: "/mo",
    description: "For owner-operated stores",
    orders: "Up to 200 orders / month",
    features: ["Automatic paid-order sync", "Product mapping", "Sync history + retries", "Email support"],
    cta: "Start free",
    featured: false,
  },
  {
    name: "Growth",
    price: "$49",
    suffix: "/mo",
    description: "For stores with steady volume",
    orders: "Up to 1,000 orders / month",
    features: ["Everything in Solo", "Higher monthly volume", "Priority sync queue", "Priority support"],
    cta: "Start free",
    featured: true,
  },
  {
    name: "Pro",
    price: "$99",
    suffix: "/mo",
    description: "For high-volume operators",
    orders: "Unlimited orders",
    features: ["Everything in Growth", "Unlimited order volume", "Advanced controls as released", "Priority support"],
    cta: "Start free",
    featured: false,
  },
];

export default function LandingPage() {
  return (
    <>
      <main>
        <div className="container">
          <nav className="nav" aria-label="Main navigation">
            <a className="wordmark" href="/" aria-label="SyncStock home">
              Sync<span>Stock</span>
            </a>
            <div className="nav-links">
              <a href="#how-it-works">How it works</a>
              <a href="#pricing">Pricing</a>
              <a href="/login">Sign in</a>
              <a href="/signup" className="btn btn-small">Start free</a>
            </div>
          </nav>

          <section className="hero marketing-hero">
            <div className="hero-copy">
              <div className="kicker"><span className="status-dot" /> Private beta · Shopify + QuickBooks Online</div>
              <h1>Close the tab between Shopify and QuickBooks.</h1>
              <p className="lede">
                SyncStock turns paid Shopify orders into organized QuickBooks Online transactions—without the copy, paste, duplicate cleanup, or mystery failures.
              </p>
              <div className="hero-actions">
                <a href="/signup" className="btn btn-large">Start with 20 free orders</a>
                <a href="#how-it-works" className="text-link">See how it works <span>→</span></a>
              </div>
              <div className="hero-proof">
                <span>No card required</span>
                <span>Built for 50–500+ orders/mo</span>
                <span>Cancel anytime</span>
              </div>
            </div>

            <div className="sync-console" aria-label="Example SyncStock order sync">
              <div className="console-topline">
                <span className="mono">LIVE SYNC</span>
                <span className="console-live"><span className="status-dot" /> watching paid orders</span>
              </div>
              <div className="order-card">
                <div className="order-head">
                  <div>
                    <span className="source-tag shopify-tag">SHOPIFY</span>
                    <strong>#4821</strong>
                  </div>
                  <span className="badge badge-success">PAID</span>
                </div>
                <div className="order-line"><span>Canvas Tote × 2</span><strong>$42.00</strong></div>
                <div className="order-line"><span>Enamel Pin × 1</span><strong>$12.00</strong></div>
                <div className="order-line subtle"><span>Tax</span><strong>$4.00</strong></div>
                <div className="order-total"><span>Total</span><strong>$58.00</strong></div>
              </div>
              <div className="sync-rail">
                <span className="rail-node complete">✓</span>
                <span className="rail-line" />
                <span className="rail-label">verified · mapped · deduplicated</span>
                <span className="rail-line" />
                <span className="rail-node complete">✓</span>
              </div>
              <div className="order-card qbo-card">
                <div className="order-head">
                  <div>
                    <span className="source-tag qbo-tag">QUICKBOOKS</span>
                    <strong>Sales Receipt</strong>
                  </div>
                  <span className="badge badge-success">SYNCED</span>
                </div>
                <div className="receipt-id mono">SS-4821 · $58.00</div>
                <div className="reconcile-row"><span>Transaction recorded</span><strong>Balanced ✓</strong></div>
              </div>
            </div>
          </section>
        </div>

        <section className="problem-band">
          <div className="container problem-grid">
            <div>
              <p className="section-kicker">THE PROBLEM</p>
              <h2>Your store is automated. Your bookkeeping should be too.</h2>
            </div>
            <div className="problem-copy">
              <p>Manual order entry is slow. Generic automation is worse when it silently creates duplicates or sends the wrong numbers to the books.</p>
              <p>SyncStock is being built around one standard: <strong>one paid Shopify order should become one correct QuickBooks transaction.</strong></p>
            </div>
          </div>
        </section>

        <section className="container section" id="how-it-works">
          <div className="section-heading">
            <div>
              <p className="section-kicker">HOW IT WORKS</p>
              <h2>Connect once. Keep the books moving.</h2>
            </div>
            <p>Focused software for merchants who need clean books, not another dashboard full of switches.</p>
          </div>
          <div className="feature-grid">
            {features.map((feature) => (
              <article className="feature-card" key={feature.title}>
                <span className="feature-eyebrow mono">{feature.eyebrow}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="container section reliability-section">
          <div className="reliability-card">
            <div>
              <p className="section-kicker">BUILT FOR ACCOUNTING DATA</p>
              <h2>Reliability before feature bloat.</h2>
              <p className="reliability-copy">SyncStock is deliberately narrow. We would rather make Shopify → QuickBooks dependable than bolt on twenty integrations that fail quietly.</p>
            </div>
            <div className="reliability-list">
              <div><span>01</span><p><strong>Paid-order trigger</strong><br />Record revenue when the order is actually paid.</p></div>
              <div><span>02</span><p><strong>Duplicate protection</strong><br />Repeated webhook deliveries should not create repeated receipts.</p></div>
              <div><span>03</span><p><strong>Visible failures</strong><br />If something cannot sync safely, surface it instead of guessing.</p></div>
              <div><span>04</span><p><strong>Safe retries</strong><br />Fix the issue and retry without blindly creating another transaction.</p></div>
            </div>
          </div>
        </section>

        <section className="pricing-wrap" id="pricing">
          <div className="container section">
            <div className="section-heading pricing-heading">
              <div>
                <p className="section-kicker">FOUNDING PRICING</p>
                <h2>Cheaper than bookkeeping cleanup.</h2>
              </div>
              <p>Every account starts with 20 free synced orders. No card required to test the workflow.</p>
            </div>
            <div className="pricing-grid">
              {plans.map((plan) => (
                <article className={`pricing-card${plan.featured ? " featured" : ""}`} key={plan.name}>
                  {plan.featured && <div className="popular-tag">MOST POPULAR</div>}
                  <div className="plan-top">
                    <div>
                      <h3>{plan.name}</h3>
                      <p>{plan.description}</p>
                    </div>
                    <div className="price"><strong>{plan.price}</strong><span>{plan.suffix}</span></div>
                  </div>
                  <div className="order-limit">{plan.orders}</div>
                  <ul>
                    {plan.features.map((item) => <li key={item}><span>✓</span>{item}</li>)}
                  </ul>
                  <a className={plan.featured ? "btn pricing-button" : "btn btn-secondary pricing-button"} href="/signup">{plan.cta}</a>
                </article>
              ))}
            </div>
            <p className="pricing-note">Founding pricing is intended for the private beta and may change before public launch. Existing paid customers will receive advance notice of any pricing changes.</p>
          </div>
        </section>

        <section className="container section faq-section">
          <div className="section-heading">
            <div>
              <p className="section-kicker">FAQ</p>
              <h2>Before you connect your books.</h2>
            </div>
          </div>
          <div className="faq-grid">
            <div><h3>What does SyncStock sync?</h3><p>The private beta is focused on paid Shopify orders → QuickBooks Online sales receipts. Refunds, payouts, and additional accounting workflows are planned after the core flow is production-safe.</p></div>
            <div><h3>Will it create duplicate receipts?</h3><p>Duplicate prevention is a core product requirement. SyncStock tracks Shopify deliveries and order state, and uses a stable QuickBooks transaction reference to make retries safer.</p></div>
            <div><h3>Do I need an accountant?</h3><p>SyncStock automates data movement; it does not replace accounting advice. Your accountant or bookkeeper still determines the right accounting treatment for your business.</p></div>
            <div><h3>Is this ready for my live store?</h3><p>Not yet. SyncStock is in private beta while we harden reconciliation, mappings, retries, billing, and authentication. Use sandbox/test data until the production launch checklist is complete.</p></div>
          </div>
        </section>

        <section className="container final-cta">
          <div>
            <p className="section-kicker">PRIVATE BETA</p>
            <h2>Spend less time copying orders.<br />Spend more time running the store.</h2>
          </div>
          <a href="/signup" className="btn btn-large">Start with 20 free orders</a>
        </section>
      </main>
      <Footer />
    </>
  );
}
