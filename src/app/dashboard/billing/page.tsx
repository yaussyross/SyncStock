"use client";

import { useEffect, useState } from "react";
import { PUBLIC_PLANS } from "@/lib/plans";

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
          setBillingStatus("Shopify App Pricing setup is still being completed for this account.");
        } else if (data.active) {
          setBillingStatus(`Shopify billing active${data.planTier ? ` · ${data.planTier}` : ""}.`);
        } else {
          setBillingStatus("No paid Shopify plan is active. The one-time 20-order trial does not renew; cancellation does not reset it.");
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
          <p className="section-kicker">LAUNCH PRICING</p>
          <h1 style={{ fontSize: 32, marginTop: 8, marginBottom: 8 }}>Choose a plan</h1>
          <p style={{ color: "var(--paper-dim)", marginBottom: 12 }}>Your first 20 successful order syncs are free, once per account. Paid plans are approved and billed by Shopify every 30 days.</p>
          <p style={{ color: "var(--paper-dim)", marginBottom: 8, fontSize: 13 }}>Setup safety gate: plan selection unlocks only after Shopify, QuickBooks, and at least one product mapping are ready, so you are not charged for an unusable setup.</p>
          <p style={{ color: "var(--paper-dim)", marginBottom: 28, fontSize: 13 }}>{billingStatus}</p>
        </div>
        <button className="btn btn-secondary" onClick={openShopifyPlans}>Manage Shopify plan</button>
      </div>
      <div className="ledger" style={{ borderTop: "none", paddingTop: 0, maxWidth: 720 }}>
        {PUBLIC_PLANS.map((plan) => (
          <div className="ledger-row" key={plan.tier} style={{ flexWrap: "wrap" }}>
            <div>
              <div className="plan-name">{plan.label}</div>
              <div className="plan-desc">Up to {plan.orderLimit.toLocaleString("en-US")} orders per Shopify 30-day billing cycle</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div className="plan-price">${plan.monthlyPriceUsd}/30 days</div>
              <button className="btn" onClick={openShopifyPlans}>Choose in Shopify</button>
            </div>
          </div>
        ))}
      </div>
      <p style={{ color: "var(--paper-dim)", fontSize: 13, marginTop: 22, maxWidth: 700 }}>Prices are in USD. Sync pauses at your order cap, with no overage charges. Each successfully synced order counts once; duplicate deliveries and retries do not count again. Paid allowances reset with your Shopify 30-day billing cycle. Shopify shows the available plans, collects merchant approval, and handles app billing. SyncStock never stores card details.</p>
    </main>
  );
}
