"use client";

import { useState } from "react";

export default function BookkeepingCalculator() {
  const [orders, setOrders] = useState("200");
  const [minutes, setMinutes] = useState("2");
  const [hourlyRate, setHourlyRate] = useState("35");
  const [automated, setAutomated] = useState("75");
  const count = Number(orders);
  const time = Number(minutes);
  const rate = Number(hourlyRate);
  const share = Number(automated);
  const valid = [orders, minutes, hourlyRate, automated].every(value => value.trim() !== "") &&
    [count, time, rate, share].every(Number.isFinite) &&
    Number.isInteger(count) && count >= 0 && count <= 1000000 && time >= 0 && time <= 120 &&
    rate >= 0 && rate <= 10000 && share >= 0 && share <= 100;
  const hours = count * time / 60;
  const savedHours = hours * share / 100;
  const plan = count <= 200 ? { name: "Solo", price: 19 } : count <= 1000 ? { name: "Growth", price: 49 } : { name: "Pro", price: 99 };
  const value = savedHours * rate;
  const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);

  return (
    <div className="calculator-grid">
      <div className="feature-card calculator-fields">
        <label htmlFor="orders">Orders per month</label>
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
        {valid ? <>
          <p className="section-kicker">YOUR MONTHLY ESTIMATE</p>
          <h2>{hours.toFixed(1)} hours entering orders</h2>
          <p>At your hourly value, that time is worth <strong>{money(hours * rate)}</strong>.</p>
          <div className="ledger">
            <div className="ledger-row"><span>Potential time recovered</span><strong>{savedHours.toFixed(1)} hours</strong></div>
            <div className="ledger-row"><span>Value of time recovered</span><strong>{money(value)}</strong></div>
            <div className="ledger-row"><span>{plan.name} plan at this order volume</span><strong>{money(plan.price)}/mo</strong></div>
            <div className="ledger-row"><span>Time value less subscription</span><strong>{money(value - plan.price)}/mo</strong></div>
          </div>
          <p className="pricing-note">This estimates time value, not cash savings or guaranteed performance. Setup, exception review, refunds, and other bookkeeping work still take time. Tax and other software costs are excluded.</p>
        </> : <p role="alert">Enter valid nonnegative values within the displayed limits. Orders must be a whole number and the percentage must be 0–100.</p>}
        <a className="btn" href="/signup?source=bookkeeping-calculator">Explore the free sandbox beta</a>
        <p className="pricing-note">SyncStock is being tested with sandbox data. Live accounting sync is not yet available.</p>
      </div>
    </div>
  );
}
