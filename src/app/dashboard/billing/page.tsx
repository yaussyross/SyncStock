"use client";

import { useEffect, useState } from "react";

async function openShopifyPlans() {
  const res = await fetch("/api/shopify/billing", { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    alert(data.error || "Could not open Shopify billing. Please try again.");
    return;
  }
  window.location.href = data.url;
}

export default function BillingPage() {
  const [billingStatus, setBillingStatus] = useState<string>("Checking Shopify billing…");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/shopify/billing", { cache: "no-store" })
      .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) {
          setBillingStatus(data.error || "Could not refresh Shopify billing.");
          return;
        }
        if (data.source === "stripe_legacy") {
          setBillingStatus("Legacy Stripe subscription active. Contact support before changing plans.");
        } else if (!data.configured) {
          setBillingStatus("Shopify App Pricing setup is still being completed for this founding beta.");
        } else if (data.active) {
          setBillingStatus(`Shopify billing active${data.planTier ? ` · ${data.planTier}` : ""}.`);
        } else {
          setBillingStatus("No paid Shopify plan is active. Your 20-order founding trial remains available.");
        }
      })
      .catch(() => {
        if (!cancelled) setBillingStatus("Could not refresh Shopify billing.");
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <p className="section-kicker">FOUNDING PRICING</p>
          <h1 style={{ fontSize: 32, marginTop: 8, marginBottom: 8 }}>Choose a plan</h1>
          <p style={{ color: "var(--paper-dim)", marginBottom: 12 }}>Your first 20 synced orders are free. Paid plans are approved and billed by Shopify.</p>
          <p style={{ color: "var(--paper-dim)", marginBottom: 8, fontSize: 13 }}>Beta safety gate: plan selection unlocks only after Shopify, QuickBooks, and at least one product mapping are ready, so you are not charged for an unusable setup.</p>
          <p style={{ color: "var(--paper-dim)", marginBottom: 28, fontSize: 13 }}>{billingStatus}</p>
        </div>
        <button className="btn btn-secondary" onClick={openShopifyPlans}>Manage Shopify plan</button>
      </div>
      <div className="ledger" style={{ borderTop: "none", paddingTop: 0, maxWidth: 720 }}>
        <div className="ledger-row"><div><div className="plan-name">Solo</div><div className="plan-desc">Up to 200 orders per paid billing period</div></div><div style={{ display: "flex", alignItems: "center", gap: 16 }}><div className="plan-price">$8/mo</div><button className="btn" onClick={openShopifyPlans}>Choose in Shopify</button></div></div>
        <div className="ledger-row"><div><div className="plan-name">Scale</div><div className="plan-desc">Up to 1,000 orders per paid billing period</div></div><div style={{ display: "flex", alignItems: "center", gap: 16 }}><div className="plan-price">$29/mo</div><button className="btn" onClick={openShopifyPlans}>Choose in Shopify</button></div></div>
        <div className="ledger-row"><div><div className="plan-name">Empire</div><div className="plan-desc">Unlimited paid-order sync volume</div></div><div style={{ display: "flex", alignItems: "center", gap: 16 }}><div className="plan-price">$49/mo</div><button className="btn" onClick={openShopifyPlans}>Choose in Shopify</button></div></div>
      </div>
      <p style={{ color: "var(--paper-dim)", fontSize: 13, marginTop: 22, maxWidth: 700 }}>Founding-beta pricing. Shopify shows the available plans, collects merchant approval, and handles app billing. SyncStock never stores card details.</p>
    </main>
  );
}
