"use client";

import { useState } from "react";
import { estimateBookkeeping } from "@/lib/bookkeeping-estimate";

export default function BookkeepingCalculator() {
  const [orders, setOrders] = useState("200");
  const [minutes, setMinutes] = useState("2");
  const [hourlyRate, setHourlyRate] = useState("35");
  const [automated, setAutomated] = useState("75");
  const estimate = estimateBookkeeping({ orders, minutes, hourlyRate, automated });
  const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);

  return (
    <div className="calculator-grid">
      <div className="feature-card calculator-fields">
        <label htmlFor="orders">Orders per Shopify 30-day billing cycle</label>
        <input id="orders" type="number" min="0" max="1000000" step="1" value={orders} onChange={event => setOrders(event.target.value)} />
        <label htmlFor="minutes">Minutes of manual entry per order</label>
        <input id="minutes" type="number" min="0" max="120" step="0.1" value={minutes} onChange={event => setMinutes(event.target.value)} />
        <label htmlFor="hourly-rate">Value of your time, USD per hour</label>
        <input id="hourly-rate" type="number" min="0" max="10000" step="1" value={hourlyRate} onChange={event => setHourlyRate(event.target.value)} />
        <label htmlFor="automated">Manual entry you expect to eliminate, %</label>
        <input id="automated" type="number" min="0" max="100" step="1" value={automated} onChange={event => setAutomated(event.target.value)} />
        <p className="pricing-note">These are your assumptions. The example values are illustrative, not measured customer results.</p>
      </div>
      <div className="feature-card" aria-live="polite" aria-atomic="true">
        {estimate ? <>
          <p className="section-kicker">YOUR 30-DAY ESTIMATE</p>
          <h2>{estimate.hours.toFixed(1)} hours entering orders</h2>
          <p>At your hourly value, that time is worth <strong>{money(estimate.manualTimeValue)}</strong>.</p>
          <div className="ledger">
            <div className="ledger-row"><span>Potential time recovered</span><strong>{estimate.savedHours.toFixed(1)} hours</strong></div>
            <div className="ledger-row"><span>Value of time recovered</span><strong>{money(estimate.timeValue)}</strong></div>
            {estimate.plan && estimate.netTimeValue !== null ? <>
              <div className="ledger-row"><span>{estimate.plan.label} plan at this order volume</span><strong>{money(estimate.plan.monthlyPriceUsd)}/30 days</strong></div>
              <div className="ledger-row"><span>Time value less subscription</span><strong>{money(estimate.netTimeValue)}/30 days</strong></div>
            </> : <div className="ledger-row"><span>No available plan for this order volume</span><a href="/support">Contact us about higher-volume needs</a></div>}
          </div>
          <p className="pricing-note">This estimates time value, not cash savings or guaranteed performance. Above 1,000 orders per cycle, no available plan covers the volume, so no subscription-adjusted estimate is shown. Setup, exception review, refunds, and other bookkeeping work still take time. Tax and other software costs are excluded.</p>
        </> : <p role="alert">Enter valid nonnegative values within the displayed limits. Orders must be a whole number and the percentage must be 0–100.</p>}
        <a className="btn" href="/signup?source=bookkeeping-calculator">Start with 20 free orders</a>
        <p className="pricing-note">Your first 20 successful order syncs are free, once per account. Paid plans pause at the cap with no overage charges. Each order counts once, including duplicate deliveries and retries.</p>
      </div>
    </div>
  );
}
