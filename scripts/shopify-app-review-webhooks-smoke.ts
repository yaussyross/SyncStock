import assert from "node:assert/strict";
import fs from "node:fs";

const toml = fs.readFileSync("shopify.app.toml", "utf8");
const compliance = fs.readFileSync("src/app/api/webhooks/shopify/compliance/route.ts", "utf8");
const lifecycle = fs.readFileSync("src/app/api/webhooks/shopify/lifecycle/route.ts", "utf8");
const orders = fs.readFileSync("src/app/api/webhooks/shopify/orders/route.ts", "utf8");

assert.match(toml, /compliance_topics\s*=\s*\["customers\/data_request",\s*"customers\/redact",\s*"shop\/redact"\]/);
assert.match(toml, /topics\s*=\s*\["app\/uninstalled"\]/);
assert.match(toml, /uri\s*=\s*"https:\/\/sync-stock-six\.vercel\.app\/api\/webhooks\/shopify\/compliance"/);
assert.match(toml, /uri\s*=\s*"https:\/\/sync-stock-six\.vercel\.app\/api\/webhooks\/shopify\/lifecycle"/);

assert.match(compliance, /Invalid signature"[\s\S]*status:\s*401/);
assert.match(lifecycle, /Invalid signature"[\s\S]*status:\s*400/);
assert.match(orders, /Invalid signature"[\s\S]*status:\s*400/);

console.log("Shopify App Store webhook status-code contract checks passed");
