import assert from "node:assert/strict";
import fs from "node:fs";
import { ActiveShopifySubscription, planTierForShopifySubscription, shopifyBillingPatch, shopifyPricingUrl } from "../src/lib/shopify-billing";

function subscription(
  amount: string,
  options: { currency?: string; billingPeriod?: string; active?: boolean; handle?: string } = {}
): ActiveShopifySubscription {
  return {
    billingPeriod: options.billingPeriod ?? "EVERY_30_DAYS",
    cancelAtEndOfCycle: false,
    trialEndsAt: null,
    currentBillingCycle: {
      startTime: "2026-09-01T00:00:00Z",
      endTime: "2026-10-01T00:00:00Z",
    },
    items: [{
      handle: options.handle ?? "syncstock-plan",
      description: "SyncStock",
      price: {
        __typename: "FlatRatePrice",
        active: options.active ?? true,
        currency: options.currency ?? "USD",
        amount,
      },
    }],
  };
}

assert.equal(planTierForShopifySubscription(subscription("8.00")), "starter");
assert.equal(planTierForShopifySubscription(subscription("29.00")), "growth");
assert.equal(planTierForShopifySubscription(subscription("49.00")), "unlimited");
assert.equal(
  planTierForShopifySubscription(subscription("0.00", { handle: "solo" })),
  "starter",
  "no-charge development-store Solo plan must map by handle"
);
assert.equal(
  planTierForShopifySubscription(subscription("0.00", { handle: "scale" })),
  "growth",
  "no-charge development-store Scale plan must map by handle"
);
assert.equal(
  planTierForShopifySubscription(subscription("0.00", { handle: "empire" })),
  "unlimited",
  "no-charge development-store Empire plan must map by handle"
);
assert.equal(
  planTierForShopifySubscription(subscription("0.00", { handle: "unknown-plan" })),
  null,
  "unknown zero-dollar plan must not grant an entitlement"
);
assert.equal(planTierForShopifySubscription(subscription("19.00")), null, "stale catalog price must not map");
assert.equal(planTierForShopifySubscription(subscription("8.00", { currency: "CAD" })), null, "non-USD plan must not map");
assert.equal(planTierForShopifySubscription(subscription("8.00", { billingPeriod: "ANNUAL" })), null, "annual plan must not map");
assert.equal(planTierForShopifySubscription(subscription("8.00", { active: false })), null, "inactive price must not map");

console.log("Shopify App Pricing catalog mapping tests passed.");


const previousHandle = process.env.SHOPIFY_APP_HANDLE;
delete process.env.SHOPIFY_APP_HANDLE;
assert.equal(
  shopifyPricingUrl("test-wc9egg3y.myshopify.com"),
  "https://admin.shopify.com/store/test-wc9egg3y/charges/syncstock-productionn/pricing_plans",
  "canonical public-app handle should work without a deployment env override"
);
process.env.SHOPIFY_APP_HANDLE = "syncstock-override";
assert.equal(
  shopifyPricingUrl("test-wc9egg3y.myshopify.com"),
  "https://admin.shopify.com/store/test-wc9egg3y/charges/syncstock-override/pricing_plans",
  "deployment env override should still be honored"
);
if (previousHandle === undefined) delete process.env.SHOPIFY_APP_HANDLE;
else process.env.SHOPIFY_APP_HANDLE = previousHandle;


process.env.SHOPIFY_APP_HANDLE = "syncstock-production";
assert.equal(
  shopifyPricingUrl("test-wc9egg3y.myshopify.com"),
  "https://admin.shopify.com/store/test-wc9egg3y/charges/syncstock-productionn/pricing_plans",
  "stale pre-verification handle should normalize to the verified canonical handle"
);
if (previousHandle === undefined) delete process.env.SHOPIFY_APP_HANDLE;
else process.env.SHOPIFY_APP_HANDLE = previousHandle;


const legacyCheckoutSource = fs.readFileSync("src/app/api/stripe/checkout/route.ts", "utf8");
assert.match(legacyCheckoutSource, /status:\s*410/, "legacy Stripe checkout must remain retired");
assert.match(legacyCheckoutSource, /billed through Shopify/i);
assert.doesNotMatch(legacyCheckoutSource, /checkout\.sessions\.create/);
assert.doesNotMatch(legacyCheckoutSource, /BILLING_PROVIDER/);

console.log("Legacy Stripe checkout retirement guard passed.");


const trialState = {
  planTier: "trial",
  subscriptionStatus: "trial",
  quotaPeriodStart: null,
  quotaPeriodEnd: null,
  orderQuotaUsed: 7,
};
assert.equal(
  shopifyBillingPatch(trialState, null),
  null,
  "declining or leaving Shopify pricing without a paid contract must preserve the free trial"
);

const paidState = {
  planTier: "starter",
  subscriptionStatus: "active",
  quotaPeriodStart: new Date("2026-08-01T00:00:00Z"),
  quotaPeriodEnd: new Date("2026-09-01T00:00:00Z"),
  orderQuotaUsed: 42,
};
assert.deepEqual(
  shopifyBillingPatch(paidState, null),
  { subscriptionStatus: "inactive" },
  "a paid user without an active Shopify subscription must lose paid entitlement"
);

const nextSolo = subscription("0.00", { handle: "solo" });
const nextPatch = shopifyBillingPatch(paidState, nextSolo)!;
assert.equal(nextPatch.planTier, "starter");
assert.equal(nextPatch.subscriptionStatus, "active");
assert.equal(nextPatch.orderQuotaUsed, 0, "a new billing period should reset paid usage");
assert.equal(nextPatch.quotaPeriodStart?.toISOString(), "2026-09-01T00:00:00.000Z");
assert.equal(nextPatch.quotaPeriodEnd?.toISOString(), "2026-10-01T00:00:00.000Z");

const samePeriodState = {
  ...paidState,
  quotaPeriodStart: new Date("2026-09-01T00:00:00Z"),
  quotaPeriodEnd: new Date("2026-10-01T00:00:00Z"),
  orderQuotaUsed: 17,
};
const samePatch = shopifyBillingPatch(samePeriodState, nextSolo)!;
assert.equal(
  Object.prototype.hasOwnProperty.call(samePatch, "orderQuotaUsed"),
  false,
  "refreshing the same Shopify billing cycle must not reset consumed usage"
);

const cancelAtEnd = subscription("0.00", { handle: "solo" });
cancelAtEnd.cancelAtEndOfCycle = true;
const cancelPatch = shopifyBillingPatch(samePeriodState, cancelAtEnd)!;
assert.equal(
  cancelPatch.subscriptionStatus,
  "active",
  "cancel-at-end remains active through the current Shopify billing cycle"
);

const trialing = subscription("0.00", { handle: "solo" });
trialing.trialEndsAt = "2026-10-15T00:00:00Z";
assert.equal(shopifyBillingPatch(trialState, trialing)?.subscriptionStatus, "trialing");

console.log("Shopify billing decline, cancellation, renewal, and resubscription state tests passed.");
