import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/auth/qbo/callback/route.ts"), "utf8");
assert.match(source, /configuredHandle === "syncstock-production"/);
assert.match(source, /"syncstock-productionn"/);
assert.match(source, /admin\.shopify\.com\/store/);
console.log("QuickBooks embedded return handle regression passed.");
