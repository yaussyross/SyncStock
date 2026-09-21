import assert from "node:assert/strict";
import { ActiveShopifySubscription, planTierForShopifySubscription, shopifyPricingUrl } from "../src/lib/shopify-billing";

function subscription(amount: string, options: { currency?: string; billingPeriod?: string; active?: boolean } = {}): ActiveShopifySubscription {
  return {
    billingPeriod: options.billingPeriod ?? "EVERY_30_DAYS",
    cancelAtEndOfCycle: false,
    trialEndsAt: null,
    currentBillingCycle: {
      startTime: "2026-09-01T00:00:00Z",
      endTime: "2026-10-01T00:00:00Z",
    },
    items: [{
      handle: "syncstock-plan",
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
