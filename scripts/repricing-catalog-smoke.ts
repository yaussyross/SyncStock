import assert from "node:assert/strict";
import fs from "node:fs";
import { PUBLIC_PLANS, PLAN_LIMITS, planForPrice, PLAN_PRICE_IDS } from "../src/lib/plans";
import { getQuotaState } from "../src/lib/quota";
import { planTierForShopifySubscription, shopifyBillingPatch, type ActiveShopifySubscription } from "../src/lib/shopify-billing";

const cycle = { startTime: "2026-10-01T00:00:00Z", endTime: "2026-10-31T00:00:00Z" };
const sub = (handle: string, amount: string): ActiveShopifySubscription => ({
  billingPeriod: "EVERY_30_DAYS", cancelAtEndOfCycle: false, trialEndsAt: null,
  currentBillingCycle: cycle,
  items: [{ handle, description: null, price: { __typename: "FlatRatePrice", active: true, currency: "USD", amount } }],
});
const now = new Date("2026-10-03T00:00:00Z");
for (const plan of PUBLIC_PLANS) {
  assert.equal(planTierForShopifySubscription(sub(plan.handle, String(plan.monthlyPriceUsd))), plan.tier);
  assert.equal(planTierForShopifySubscription(sub(plan.handle, "0")), plan.tier, "development-store contract keeps its intended cap");
  assert.equal(planTierForShopifySubscription(sub(plan.handle, "999")), null, "unexpected price is not silently accepted");
  const user = { planTier: plan.tier, subscriptionStatus: "active", quotaPeriodStart: new Date(cycle.startTime), quotaPeriodEnd: new Date(cycle.endTime), orderQuotaUsed: plan.orderLimit - 1 };
  assert.equal(getQuotaState(user as any, now).allowed, true);
  assert.equal(getQuotaState({ ...user, orderQuotaUsed: plan.orderLimit } as any, now).allowed, false);
  assert.equal(getQuotaState({ ...user, orderQuotaUsed: plan.orderLimit + 1 } as any, now).allowed, false);
  const sameCycle = shopifyBillingPatch(user, sub(plan.handle, String(plan.monthlyPriceUsd)))!;
  assert.equal(Object.hasOwn(sameCycle, "orderQuotaUsed"), false, "same-cycle refresh or upgrade never resets usage");
}
assert.deepEqual(PUBLIC_PLANS.map(p => [p.monthlyPriceUsd, p.orderLimit]), [[9,100],[19,250],[29,1000]]);
assert.equal(PLAN_LIMITS.trial, 20);
assert.equal(getQuotaState({ planTier: "trial", orderQuotaUsed: 20 } as any, new Date("2030-01-01")).allowed, false, "trial never renews monthly");
assert.equal(PLAN_LIMITS.starter, 200);
assert.equal(PLAN_LIMITS.growth, 1000);
assert.equal(PLAN_LIMITS.unlimited, Infinity);
for (const tier of ["starter", "growth", "unlimited"]) assert.equal(planForPrice(PLAN_PRICE_IDS[tier]), tier);
assert.equal(planTierForShopifySubscription(sub("scale", "29")), "growth");
assert.equal(planTierForShopifySubscription(sub("empire-1000", "29")), "empire_1000");
assert.equal(planTierForShopifySubscription(sub("solo", "9")), null, "in-place edit to old handle fails closed");
assert.equal(planTierForShopifySubscription(sub("unknown", "9")), null, "new catalog requires verified exact handle");
const current = { planTier: "solo_100", subscriptionStatus: "active", quotaPeriodStart: new Date(cycle.startTime), quotaPeriodEnd: new Date(cycle.endTime), orderQuotaUsed: 47 };
const stale = sub("solo-100", "9");
stale.currentBillingCycle = { startTime: "2026-09-01T00:00:00Z", endTime: "2026-10-01T00:00:00Z" };
assert.equal(shopifyBillingPatch(current, stale), null, "old refresh cannot roll usage back");
const next = sub("solo-100", "9");
next.currentBillingCycle = { startTime: "2026-10-31T00:00:00Z", endTime: "2026-11-30T00:00:00Z" };
assert.equal(shopifyBillingPatch(current, next)?.orderQuotaUsed, 0);
assert.deepEqual(shopifyBillingPatch(current, null), { subscriptionStatus: "inactive" });
const upgrade = shopifyBillingPatch(current, sub("scale-250", "19"))!;
assert.equal(upgrade.planTier, "scale_250");
assert.equal(Object.hasOwn(upgrade, "orderQuotaUsed"), false, "upgrade preserves already consumed orders");
const highUse = { ...current, planTier: "empire_1000", orderQuotaUsed: 777 };
const downgrade = shopifyBillingPatch(highUse, sub("solo-100", "9"))!;
assert.equal(downgrade.planTier, "solo_100");
assert.equal(Object.hasOwn(downgrade, "orderQuotaUsed"), false, "downgrade preserves usage and pauses if above the new cap");
assert.equal(getQuotaState({ ...highUse, ...downgrade } as any, now).reason, "quota_exceeded");
const bad = sub("solo-100", "9");
bad.currentBillingCycle = { startTime: "not-a-date", endTime: cycle.endTime };
assert.throws(() => shopifyBillingPatch(current, bad), /invalid billing cycle/);
for (const route of ["src/app/api/webhooks/shopify/orders/route.ts", "src/app/api/internal/process-order/route.ts", "src/app/api/sync/retry/route.ts", "src/app/api/shopify/embedded/retry/route.ts"]) {
  assert.match(fs.readFileSync(route, "utf8"), /await ensureCurrentBillingPeriod\(/, `${route} must recover unattended renewals`);
}
console.log("Repricing catalog, legacy compatibility, one-time trial, caps, renewal, and stale-cycle guards passed.");
