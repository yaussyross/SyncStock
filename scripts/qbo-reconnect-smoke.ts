import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const status = fs.readFileSync(path.join(root, "src/app/api/shopify/embedded/status/route.ts"), "utf8");
const app = fs.readFileSync(path.join(root, "src/app/shopify/app/page.tsx"), "utf8");

assert.match(status, /qboRequiresReconnect/);
assert.match(status, /getQboClientForUser/);
assert.match(status, /requiresReconnect: qboRequiresReconnect/);
assert.match(app, /Reconnect QuickBooks/);
assert.match(app, /status\.quickbooks\.requiresReconnect/);
assert.match(app, /try \{ await refreshStatus\(\); \} catch \{\}/);

console.log("QuickBooks reconnect-state regression passed.");
