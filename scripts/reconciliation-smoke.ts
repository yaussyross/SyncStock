import assert from "node:assert/strict";
import { compareMoneyTotals, reconcileShopifyOrder } from "../src/lib/reconciliation";

const simple = reconcileShopifyOrder({
  currency: "USD",
  total_price: "21.00",
  total_tax: "1.00",
  total_discounts: "0.00",
  line_items: [{ title: "Widget", quantity: 2, price: "10.00" }],
});
assert.equal(simple.matches, true);
assert.equal(simple.expectedTotal, "21.00");
assert.equal(simple.actualTotal, "21.00");

const shipping = reconcileShopifyOrder({
  currency: "USD",
  total_price: "26.00",
  total_tax: "1.00",
  total_shipping_price_set: { shop_money: { amount: "5.00" } },
  line_items: [{ title: "Widget", quantity: 2, price: "10.00" }],
});
assert.equal(shipping.matches, false);
assert.equal(shipping.actualTotal, "21.00");
assert.equal(shipping.absoluteDifference, "5.00");
assert.deepEqual(shipping.unsupportedAdjustments, ["shipping"]);
assert.match(shipping.adjustmentSummary ?? "", /shipping 5\.00/);

const configuredShipping = reconcileShopifyOrder(
  {
    currency: "USD",
    total_price: "26.00",
    total_tax: "1.00",
    total_shipping_price_set: { shop_money: { amount: "5.00" } },
    line_items: [{ title: "Widget", quantity: 2, price: "10.00" }],
  },
  { includeShipping: true }
);
assert.equal(configuredShipping.matches, true);
assert.equal(configuredShipping.actualTotal, "26.00");
assert.equal(configuredShipping.adjustments.shipping, "5.00");

const discount = reconcileShopifyOrder({
  currency: "USD",
  total_price: "19.00",
  total_tax: "1.00",
  total_discounts: "2.00",
  line_items: [{ title: "Widget", quantity: 2, price: "10.00" }],
});
assert.equal(discount.matches, false);
assert.equal(discount.actualTotal, "21.00");
assert.equal(discount.absoluteDifference, "2.00");
assert.deepEqual(discount.unsupportedAdjustments, ["discounts"]);
assert.match(discount.adjustmentSummary ?? "", /discounts -2\.00/);

const configuredDiscount = reconcileShopifyOrder(
  {
    currency: "USD",
    total_price: "19.00",
    total_tax: "1.00",
    total_discounts: "2.00",
    line_items: [{ title: "Widget", quantity: 2, price: "10.00" }],
  },
  { includeDiscounts: true }
);
assert.equal(configuredDiscount.matches, true);
assert.equal(configuredDiscount.actualTotal, "19.00");
assert.equal(configuredDiscount.adjustments.discounts, "2.00");

const taxInclusive = reconcileShopifyOrder({
  currency: "USD",
  taxes_included: true,
  total_price: "20.00",
  total_tax: "1.50",
  line_items: [{ title: "Tax-inclusive item", quantity: 1, price: "20.00" }],
});
assert.equal(taxInclusive.matches, true);
assert.equal(taxInclusive.actualTotal, "20.00");
assert.equal(taxInclusive.taxesIncluded, true);

const unmappedTip = reconcileShopifyOrder(
  {
    currency: "USD",
    total_price: "23.00",
    total_tax: "1.00",
    total_tip_received: "2.00",
    line_items: [{ title: "Widget", quantity: 2, price: "10.00" }],
  },
  { includeDiscounts: true }
);
assert.equal(unmappedTip.matches, false);
assert.deepEqual(unmappedTip.unsupportedAdjustments, ["tips"]);
assert.match(unmappedTip.message ?? "", /Missing accounting mappings: tips/);

const configuredTip = reconcileShopifyOrder(
  {
    currency: "USD",
    total_price: "23.00",
    total_tax: "1.00",
    total_tip_received: "2.00",
    line_items: [{ title: "Widget", quantity: 2, price: "10.00" }],
  },
  { includeTips: true }
);
assert.equal(configuredTip.matches, true);
assert.equal(configuredTip.actualTotal, "23.00");


const combinedAdjustments = reconcileShopifyOrder(
  {
    currency: "USD",
    total_price: "122.00",
    total_tax: "8.00",
    total_discounts: "5.00",
    total_shipping_price_set: { shop_money: { amount: "10.00" } },
    current_total_duties_set: { shop_money: { amount: "2.00" } },
    current_total_additional_fees_set: { shop_money: { amount: "3.00" } },
    total_tip_received: "4.00",
    line_items: [{ title: "Bundle", quantity: 2, price: "50.00" }],
  },
  {
    includeShipping: true,
    includeDiscounts: true,
    includeDuties: true,
    includeAdditionalFees: true,
    includeTips: true,
  }
);
assert.equal(combinedAdjustments.matches, true);
assert.equal(combinedAdjustments.actualTotal, "122.00");
assert.equal(combinedAdjustments.adjustments.shipping, "10.00");
assert.equal(combinedAdjustments.adjustments.discounts, "5.00");
assert.equal(combinedAdjustments.adjustments.duties, "2.00");
assert.equal(combinedAdjustments.adjustments.additionalFees, "3.00");
assert.equal(combinedAdjustments.adjustments.tips, "4.00");

const editedOrderCurrentTotals = reconcileShopifyOrder(
  {
    currency: "USD",
    total_price: "55.00",
    current_total_price: "45.00",
    total_tax: "5.00",
    current_total_tax: "4.00",
    total_discounts: "0.00",
    current_total_discounts: "9.00",
    line_items: [{ title: "Edited order item", quantity: 1, price: "50.00" }],
  },
  { includeDiscounts: true }
);
assert.equal(editedOrderCurrentTotals.matches, true);
assert.equal(editedOrderCurrentTotals.expectedTotal, "45.00");
assert.equal(editedOrderCurrentTotals.actualTotal, "45.00");
assert.equal(editedOrderCurrentTotals.taxTotal, "4.00");
assert.equal(editedOrderCurrentTotals.adjustments.discounts, "9.00");

const shippingLineFallback = reconcileShopifyOrder(
  {
    currency: "USD",
    total_price: "24.00",
    total_tax: "1.00",
    shipping_lines: [{ discounted_price: "3.00", price: "5.00" }],
    line_items: [{ title: "Fallback shipping item", quantity: 1, price: "20.00" }],
  },
  { includeShipping: true }
);
assert.equal(shippingLineFallback.matches, true);
assert.equal(shippingLineFallback.adjustments.shipping, "3.00");
assert.equal(shippingLineFallback.actualTotal, "24.00");

const unmappedExtendedAdjustments = reconcileShopifyOrder({
  currency: "USD",
  total_price: "26.00",
  total_tax: "1.00",
  current_total_duties_set: { shop_money: { amount: "2.00" } },
  current_total_additional_fees_set: { shop_money: { amount: "3.00" } },
  line_items: [{ title: "Extended adjustment item", quantity: 1, price: "20.00" }],
});
assert.equal(unmappedExtendedAdjustments.matches, false);
assert.deepEqual(unmappedExtendedAdjustments.unsupportedAdjustments, ["duties", "additional fees"]);
assert.match(unmappedExtendedAdjustments.message ?? "", /Missing accounting mappings: duties, additional fees/);

const withinTolerance = compareMoneyTotals("20.00", "20.009");
assert.equal(withinTolerance.matches, true);

const outsideTolerance = compareMoneyTotals("20.00", "20.02");
assert.equal(outsideTolerance.matches, false);
assert.equal(outsideTolerance.absoluteDifference, "0.02");

console.log("Reconciliation smoke tests passed.");
