import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p: string) => fs.existsSync(path.join(root, p));

const landing = read("src/app/page.tsx");
const layout = read("src/app/layout.tsx");
const signup = read("src/app/signup/page.tsx");
const login = read("src/app/login/page.tsx");
const embedded = read("src/app/shopify/app/page.tsx");

for (const p of [
  "src/app/privacy/page.tsx",
  "src/app/terms/page.tsx",
  "src/app/support/page.tsx",
  "src/app/docs/page.tsx",
  "src/app/signup/page.tsx",
  "src/app/login/page.tsx",
  "src/app/app/page.tsx",
]) {
  assert.equal(exists(p), true, `required public surface missing: ${p}`);
}

assert.match(landing, /20 free/);
assert.doesNotMatch(landing, /Join the beta|illustrative beta workflow|Beta feedback queue|What is the beta focused on/);
assert.doesNotMatch(layout, /Founding beta/);
assert.match(signup, /Start with 20 free orders/);
assert.match(login, /AbortController/);
assert.match(embedded, /Ready to sync paid orders/);
assert.match(embedded, /Refresh/);

console.log("Public/embedded launch surfaces passed.");
