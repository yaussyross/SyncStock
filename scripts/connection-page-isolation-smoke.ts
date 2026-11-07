import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { NextRequest } from "next/server";
import { middleware, config } from "../src/middleware";

async function main() {
  const url = "https://example.test/settings/connections?connection=00000000-0000-4000-8000-000000000001";
  const first = await middleware(new NextRequest(url, { headers: { "Content-Security-Policy": "script-src *" } }));
  const second = await middleware(new NextRequest(url));
  const csp = first.headers.get("Content-Security-Policy")!;
  assert.match(csp, /script-src 'self' 'nonce-[^']+'/);
  assert.doesNotMatch(csp, /unsafe-inline.*script-src|https:|shopify|googleapis/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.notEqual(csp, second.headers.get("Content-Security-Policy"));
  assert.equal(first.headers.get("x-middleware-request-content-security-policy"), csp);
  assert.equal(first.headers.get("Referrer-Policy"), "no-referrer");
  assert.match(first.headers.get("Cache-Control")!, /no-store/);
  assert.equal(first.headers.get("X-Content-Type-Options"), "nosniff");
  const embedded = await middleware(new NextRequest("https://example.test/shopify/app?shop=synthetic.myshopify.com"));
  assert.equal(embedded.headers.get("Content-Security-Policy"), "frame-ancestors https://synthetic.myshopify.com https://admin.shopify.com;");
  assert.equal((await middleware(new NextRequest("https://example.test/"))).headers.get("Content-Security-Policy"), null);
  assert(config.matcher.includes("/((?!_next/static|_next/image|favicon.ico).*)"));
  for (const path of ["/%73ettings/connections", "/settings/%63onnections", "/settings/connections/"]) {
    const alias = await middleware(new NextRequest(`https://example.test${path}`));
    assert.equal(alias.headers.get("Referrer-Policy"), "no-referrer");
  }
  assert(!existsSync("src/app/layout.tsx"), "A shared root would destroy the document isolation boundary");
  const isolated = readFileSync("src/app/(connection-setup)/layout.tsx", "utf8");
  assert.match(isolated, /dynamic = "force-dynamic"/);
  assert.match(isolated, /<html.*<body>/);
  assert.doesNotMatch(isolated, /<script|<link|<FeedbackLink/);
  const standard = readFileSync("src/app/(standard)/layout.tsx", "utf8");
  assert.match(standard, /cdn.shopify.com\/shopifycloud\/app-bridge.js/);
  assert.match(standard, /fonts.googleapis.com/);
  assert.match(standard, /<FeedbackLink/);
  console.log("Connection document isolation: headers, nonce freshness/override, route roots, and ordinary/embedded resource preservation passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
