"use client";

async function upgrade(plan: string) {
  const res = await fetch("/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
  const data = await res.json();
  if (!res.ok || !data.url) { alert(data.error || "Could not start checkout. Please try again."); return; }
  window.location.href = data.url;
}

export default function BillingPage() {
  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <p className="section-kicker">FOUNDING PRICING</p>
      <h1 style={{ fontSize: 32, marginTop: 8, marginBottom: 8 }}>Choose a plan</h1>
      <p style={{ color: "var(--paper-dim)", marginBottom: 28 }}>Your first 20 synced orders are free. Upgrade when you are ready to keep syncing.</p>
      <div className="ledger" style={{ borderTop: "none", paddingTop: 0, maxWidth: 680 }}>
        <div className="ledger-row"><div><div className="plan-name">Solo</div><div className="plan-desc">Up to 200 orders/mo</div></div><div style={{ display: "flex", alignItems: "center", gap: 16 }}><div className="plan-price">$19/mo</div><button className="btn" onClick={() => upgrade("starter")}>Choose</button></div></div>
        <div className="ledger-row"><div><div className="plan-name">Growth</div><div className="plan-desc">Up to 1,000 orders/mo</div></div><div style={{ display: "flex", alignItems: "center", gap: 16 }}><div className="plan-price">$49/mo</div><button className="btn" onClick={() => upgrade("growth")}>Choose</button></div></div>
        <div className="ledger-row"><div><div className="plan-name">Pro</div><div className="plan-desc">Unlimited orders + priority support</div></div><div style={{ display: "flex", alignItems: "center", gap: 16 }}><div className="plan-price">$99/mo</div><button className="btn" onClick={() => upgrade("unlimited")}>Choose</button></div></div>
      </div>
    </main>
  );
}
