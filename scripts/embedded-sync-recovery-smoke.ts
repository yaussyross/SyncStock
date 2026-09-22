import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const app = fs.readFileSync(path.join(root, "src/app/shopify/app/page.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");

assert.match(app, /syncStatusPresentation/);
assert.match(app, /Mapping needed/);
assert.match(app, /Map products/);
assert.match(app, /scrollIntoView/);
assert.match(app, /Retrying order sync/);
assert.match(app, /for \(let attempt = 0; attempt < 8/);
assert.match(app, /role="status"/);
assert.match(app, /role="alert"/);
assert.match(css, /\.embedded-app \.badge-failed/);

console.log("Embedded sync recovery UX regression passed.");
