import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { estimateBookkeeping } from "../src/lib/bookkeeping-estimate";
import { PUBLIC_PLANS } from "../src/lib/plans";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8").replace(/\s+/g, " ");
const inputs = { orders: "200", minutes: "2", hourlyRate: "35", automated: "75" };

assert.deepEqual(PUBLIC_PLANS.map(({ label, monthlyPriceUsd, orderLimit }) => ({ label, monthlyPriceUsd, orderLimit })), [
  { label: "Solo", monthlyPriceUsd: 9, orderLimit: 100 },
  { label: "Scale", monthlyPriceUsd: 19, orderLimit: 250 },
  { label: "Empire", monthlyPriceUsd: 29, orderLimit: 1000 },
]);

for (const [orders, tier, price] of [
  [0, "solo_100", 9],
  [100, "solo_100", 9],
  [101, "scale_250", 19],
  [250, "scale_250", 19],
  [251, "empire_1000", 29],
  [1000, "empire_1000", 29],
] as const) {
  const result = estimateBookkeeping({ ...inputs, orders: String(orders) });
  assert.ok(result);
  assert.ok(result.plan);
  assert.equal(result.plan.tier, tier, `${orders} orders selects the matching capped plan`);
  assert.equal(result.plan.monthlyPriceUsd, price);
  assert.equal(result.netTimeValue, result.timeValue - price);
}

for (const orders of [1001, 1000000]) {
  const result = estimateBookkeeping({ ...inputs, orders: String(orders) });
  assert.ok(result);
  assert.equal(result.plan, null, "above the largest cap must not recommend a plan");
  assert.equal(result.netTimeValue, null, "an unsupported volume must not produce subscription-adjusted savings");
}

for (const change of [
  { orders: "" }, { orders: " " }, { orders: "-1" }, { orders: "1.5" }, { orders: "NaN" },
  { orders: "Infinity" }, { orders: "1000001" }, { minutes: "-1" }, { minutes: "121" },
  { hourlyRate: "10001" }, { automated: "101" }, { automated: "-1" },
]) {
  assert.equal(estimateBookkeeping({ ...inputs, ...change }), null, `invalid input ${JSON.stringify(change)}`);
}

const zeroValue = estimateBookkeeping({ ...inputs, minutes: "0", hourlyRate: "0", automated: "0" });
assert.ok(zeroValue);
assert.equal(zeroValue.savedHours, 0);
assert.equal(zeroValue.netTimeValue, -19, "zero savings must not turn into a positive claim");

const landing = read("src/app/page.tsx");
const billing = read("src/app/dashboard/billing/page.tsx");
const calculator = read("src/components/BookkeepingCalculator.tsx");
const dashboard = read("src/app/dashboard/page.tsx");
const docs = read("src/app/docs/page.tsx");
const terms = read("src/app/terms/page.tsx");
const signup = read("src/app/signup/page.tsx");

for (const [name, source] of [["landing", landing], ["billing", billing]] as const) {
  assert.match(source, /PUBLIC_PLANS/);
  assert.match(source, /plan\.monthlyPriceUsd/);
  assert.match(source, /plan\.orderLimit/);
  assert.match(source, /Shopify 30-day billing cycle/);
  assert.doesNotMatch(source, /Unlimited|\$8(?:\D|$)|\$49(?:\D|$)|200 orders|1,000 orders \/ month/);
  assert.match(source, /no overage charges/, `${name} must disclose hard caps`);
  assert.match(source, /duplicate deliveries and retries do not count again/);
}
for (const source of [landing, billing, calculator, docs, terms, signup]) {
  assert.match(source, /once per account/);
}
assert.doesNotMatch(billing, /Your 20 free synced orders remain available/);
assert.match(billing, /cancellation does not reset it/);
assert.match(dashboard, /successful order syncs in your one-time trial/);
assert.match(calculator, /No available plan for this order volume/);
assert.match(calculator, /estimate\.plan && estimate\.netTimeValue !== null/);
assert.match(calculator, /Contact us about higher-volume needs/);
assert.doesNotMatch(calculator, /Unlimited|\$8(?:\D|$)|\$49(?:\D|$)/);

for (const source of [docs, terms]) {
  assert.match(source, /\$9/);
  assert.match(source, /100 orders/);
  assert.match(source, /\$19/);
  assert.match(source, /250 orders/);
  assert.match(source, /\$29/);
  assert.match(source, /1,000 orders/);
  assert.match(source, /Shopify 30-day billing cycle/);
  assert.match(source, /no overage charges/);
}

const submission = read("docs/APP_STORE_SUBMISSION.md");
assert.match(submission, /Not live yet/);
assert.match(submission, /Verified Partner pricing state on September 21/);
assert.match(submission, /Public plans: \*\*Solo \$8\/month\*\*, \*\*Scale \$29\/month\*\*, \*\*Empire \$49\/month\*\*/);
assert.match(read("README.md"), /draft work, not evidence of a production or billing-provider update/);
assert.match(read("docs/APP_STORE_SCREENCAST.md"), /Do not narrate the approved replacement catalog as live before rollout is verified/);

console.log("Pricing surfaces, calculator boundaries, and rollout-status safeguards passed.");
