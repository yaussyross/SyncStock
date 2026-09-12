import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { applySubscription } from "../src/lib/stripe-subscription";

async function main() {
  const customer = `cus_test_${Date.now()}`;
  const previous = new Date("2026-08-09T00:00:00Z");
  const start = new Date("2026-09-09T00:00:00Z");
  const end = new Date("2026-10-09T00:00:00Z");
  const user = await db.user.create({ data: {
    email: `${customer}@example.invalid`, stripeCustomerId: customer,
    planTier: "starter", subscriptionStatus: "active", orderQuotaUsed: 200,
    quotaPeriodStart: previous, quotaPeriodEnd: start,
  } });
  const sub = {
    id: `sub_${customer}`, customer, status: "active", latest_invoice: "in_current",
    current_period_start: start.getTime() / 1000,
    current_period_end: end.getTime() / 1000,
    items: { data: [{ price: { id: process.env.STRIPE_PRICE_STARTER } }] },
  } as any;
  try {
    await applySubscription(sub);
    let row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(row.quotaPeriodStart?.getTime(), previous.getTime(), "subscription update cannot advance paid period");
    assert.equal(row.orderQuotaUsed, 200);
    await applySubscription(sub, "in_old");
    row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(row.orderQuotaUsed, 200, "old invoice must not unlock an unpaid renewal");
    await Promise.all([applySubscription(sub, "in_current"), applySubscription(sub, "in_current")]);
    row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(row.orderQuotaUsed, 0);
    assert.equal(row.quotaPeriodEnd?.getTime(), end.getTime());
    await db.user.update({ where: { id: user.id }, data: { orderQuotaUsed: 7 } });
    await applySubscription(sub, "in_current");
    await applySubscription(sub);
    row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(row.orderQuotaUsed, 7, "duplicate invoice must preserve consumed orders");
    console.log("Billing ordering, stale invoice, and concurrent delivery tests passed.");
  } finally {
    await db.user.delete({ where: { id: user.id } });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
