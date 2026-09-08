"use client";

async function redirectFromApi(endpoint: string, body?: unknown) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    alert(data.error || "Could not open billing. Please try again.");
    return;
  }
  window.location.href = data.url;
}

export default function BillingPage() {
  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <p className="section-kicker">FOUNDING PRICING</p>
          <h1 style={{ fontSize: 32, marginTop: 8, marginBottom: 8 }}>Choose a plan</h1>
          <p style={{ color: "var(--paper-dim)", marginBottom: 28 }}>Your first 20 synced orders are free. Paid usage resets only after Stripe confirms each successful billing period.</p>
        </div>
        <button className="btn btn-secondary" onClick={() => redirectFromApi("/api/stripe/portal")}>Manage existing subscription</button>
      </div>
      <div className="ledger" style={{ borderTop: "none", paddingTop: 0, maxWidth: 720 }}>
        <div className="ledger-row"><div><div className="plan-name">Solo</div><div className="plan-desc">Up to 200 orders per paid billing period</div></div><div style={{ display: "flex", alignItems: "center", gap: 16 }}><div className="plan-price">$19/mo</div><button className="btn" onClick={() => redirectFromApi("/api/stripe/checkout", { plan: "starter" })}>Choose</button></div></div>
        <div className="ledger-row"><div><div className="plan-name">Growth</div><div className="plan-desc">Up to 1,000 orders per paid billing period</div></div><div style={{ display: "flex", alignItems: "center", gap: 16 }}><div className="plan-price">$49/mo</div><button className="btn" onClick={() => redirectFromApi("/api/stripe/checkout", { plan: "growth" })}>Choose</button></div></div>
        <div className="ledger-row"><div><div className="plan-name">Pro</div><div className="plan-desc">Unlimited paid-order sync volume</div></div><div style={{ display: "flex", alignItems: "center", gap: 16 }}><div className="plan-price">$99/mo</div><button className="btn" onClick={() => redirectFromApi("/api/stripe/checkout", { plan: "unlimited" })}>Choose</button></div></div>
      </div>
      <p style={{ color: "var(--paper-dim)", fontSize: 13, marginTop: 22, maxWidth: 700 }}>Plan changes and cancellations for an existing subscription are handled in Stripe's hosted customer portal. SyncStock never stores card details.</p>
    </main>
  );
}
