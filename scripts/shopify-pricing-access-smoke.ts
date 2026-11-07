import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";

// Execute the actual route/processor with isolated dependencies. No network,
// database, token refresh, or Shopify billing operation can run in this test.
function loadSource(path: string, dependencies: Record<string, unknown>, env: Record<string, string> = {}) {
  const source = fs.readFileSync(path, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports: Record<string, any> = {};
  vm.runInNewContext(code, {
    exports,
    require: (name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    process: { env },
    console,
  }, { filename: path });
  return exports;
}

async function main() {
  let user: { id: string } | null = { id: "reinstalled-user" };
  let connection: { shopDomain: string; webhookId: null } | null = {
    shopDomain: "reinstall-test.myshopify.com", webhookId: null,
  };
  let connectionReads = 0;
  const env: Record<string, string> = {};
  const route = loadSource("src/app/api/shopify/billing/route.ts", {
    "next/server": { NextResponse },
    "@/lib/session": { getCurrentUser: async () => user },
    "@/lib/db": { db: {
      shopifyConnection: { findUnique: async (query: any) => {
        connectionReads++;
        assert.equal(query.where.userId, "reinstalled-user");
        return connection;
      } },
      // Any QBO/mapping read or entitlement write is a regression.
      qboConnection: { findUnique: () => { throw new Error("Pricing must not require QBO"); } },
      productMapping: { count: () => { throw new Error("Pricing must not require mappings"); } },
      user: { update: () => { throw new Error("Opening pricing must not change entitlement"); } },
    } },
    "@/lib/shopify-billing": {
      refreshShopifyBillingForUser: () => { throw new Error("POST must not refresh billing"); },
      shopifyPricingUrl: (shop: string) => {
        assert.equal(shop, "reinstall-test.myshopify.com");
        return "https://admin.shopify.com/store/reinstall-test/charges/syncstock-productionn/pricing_plans";
      },
    },
  }, env);

  const response = await route.POST();
  assert.equal(response.status, 200, "A reinstalled merchant with no webhook/QBO/mappings can select a plan");
  assert.equal((await response.json()).url,
    "https://admin.shopify.com/store/reinstall-test/charges/syncstock-productionn/pricing_plans");

  connection = null;
  assert.equal((await route.POST()).status, 409, "Shopify connection remains required");
  user = null;
  const readsBeforeUnauthenticated = connectionReads;
  assert.equal((await route.POST()).status, 401);
  assert.equal(connectionReads, readsBeforeUnauthenticated, "Unauthenticated callers cannot inspect connections");
  env.SYNCSTOCK_SANDBOX = "true";
  assert.equal((await route.POST()).status, 403, "Isolated sandbox paid-plan restriction remains intact");

  let mappingRows: any[] = [];
  let qboLookups = 0;
  let receiptWrites = 0;
  let status: string | null = null;
  const processor = loadSource("src/lib/sync.ts", {
    "./quota": { getQuotaState: () => ({ allowed: true }) },
    "./db": { db: {
      syncLog: { findUnique: async () => ({ id: "sync-log", status: "pending" }),
        update: async ({ data }: any) => { status = data.status ?? status; } },
      user: { findUnique: async () => ({ id: "reinstalled-user" }) },
      productMapping: { findMany: async () => mappingRows },
      accountingSettings: { findUnique: async () => null },
    } },
    "./qbo": {
      getQboClientForUser: async () => { qboLookups++; throw new Error("QuickBooks not connected"); },
      createSalesReceipt: async () => { receiptWrites++; },
    },
    "./reconciliation": { reconcileShopifyOrder: () => ({
      matches: true, currency: "USD", expectedTotal: "10.00", actualTotal: "10.00", difference: "0.00",
      adjustments: { shipping: "0", duties: "0", additionalFees: "0", tips: "0", discounts: "0" },
    }) },
  });
  const order = { id: "order-1", name: "#1001", currency: "USD", total_tax: "0",
    line_items: [{ variant_id: "variant-1", title: "Test product", quantity: 1, price: "10.00" }] };
  await processor.processOrderSync("reinstalled-user", order);
  assert.equal(status, "skipped_no_mapping", "Plan selection must not bypass mapping requirements");
  assert.equal(qboLookups, 0);
  mappingRows = [{ shopifyVariantId: "variant-1", qboItemId: "item-1" }];
  await assert.rejects(() => processor.processOrderSync("reinstalled-user", order), /QuickBooks not connected/);
  assert.equal(status, "failed");
  assert.equal(qboLookups, 1);
  assert.equal(receiptWrites, 0, "Missing QBO connection must prevent receipt creation");
  console.log("Shopify pricing access passed: incomplete setup/reinstall, auth, sandbox, and sync readiness");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
