import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const route = fs.readFileSync(path.join(root, "src/app/api/shopify/embedded/retry/route.ts"), "utf8");
const app = fs.readFileSync(path.join(root, "src/app/shopify/app/page.tsx"), "utf8");

assert.match(route, /skipped_no_mapping/);
assert.match(route, /syncQueue\.add/);
assert.match(route, /qboInvoiceId/);
assert.match(app, /retrySync/);
assert.match(app, /Could not retry order sync/);
assert.match(app, /log\.errorMessage/);
assert.match(app, />Retry</);

console.log("Embedded retry regression passed.");
