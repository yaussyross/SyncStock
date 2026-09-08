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
assert.match(shipping.adjustmentSummary ?? "", /shipping 5\.00/);

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
assert.match(discount.adjustmentSummary ?? "", /discounts -2\.00/);

const withinTolerance = compareMoneyTotals("20.00", "20.009");
assert.equal(withinTolerance.matches, true);

const outsideTolerance = compareMoneyTotals("20.00", "20.02");
assert.equal(outsideTolerance.matches, false);
assert.equal(outsideTolerance.absoluteDifference, "0.02");

console.log("Reconciliation smoke tests passed.");
