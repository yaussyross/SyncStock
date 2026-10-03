import assert from "node:assert/strict";

async function main() {
  process.env.ENCRYPTION_KEY = "billing-renewal-test-encryption-only";
  process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = "billing-renewal-test-token";
  const RealDate = Date;
  let clock = RealDate.parse("2026-10-03T00:00:00Z");
  class TestDate extends RealDate {
    constructor(value?: any) { super(value === undefined ? clock : value); }
    static now() { return clock; }
  }
  globalThis.Date = TestDate as DateConstructor;
  const now = new Date();
  const old = { id: "renewal-test", planTier: "solo_100", subscriptionStatus: "active", stripeSubscriptionId: null,
    orderQuotaUsed: 100, quotaPeriodStart: new Date("2026-09-01"), quotaPeriodEnd: new Date("2026-10-01") };
  let row: any = { ...old };
  let providerCalls = 0;
  let updates = 0;
  let locked = false;
  let tail = Promise.resolve();
  let providerUnavailable = false;
  let providerReply: null | ((snapshot: any) => Promise<Response>) = null;
  let subscription: any = { billingPeriod: "EVERY_30_DAYS", cancelAtEndOfCycle: false, trialEndsAt: null,
    currentBillingCycle: { startTime: "2026-10-01T00:00:00Z", endTime: "2026-10-31T00:00:00Z" },
    items: [{ handle: "solo-100", description: "Solo", price: { __typename: "FlatRatePrice", active: true, currency: "USD", amount: "9" } }] };
  const user = {
    findUnique: async () => ({ ...row }), findUniqueOrThrow: async () => ({ ...row }),
    update: async ({ data }: any) => { assert(locked, "billing writes must hold the quota row lock"); updates++; row = { ...row, ...data }; return { ...row }; },
  };
  let encryptedToken = "";
  (globalThis as any).prisma = {
    user,
    shopifyConnection: { findUnique: async () => ({ userId: row.id, shopDomain: "renewal-test.myshopify.com", accessToken: encryptedToken, accessTokenExpiresAt: null }) },
    $transaction: async (work: any) => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try { return await work({ user, $queryRaw: async (sql: any) => { assert.match(sql.join(""), /FOR UPDATE/); locked = true; return [{ id: row.id }]; } }); }
      finally { locked = false; release(); }
    },
  };
  globalThis.fetch = async (input) => {
    if (String(input).startsWith("https://partners.shopify.com/")) {
      providerCalls++;
      if (providerUnavailable) return new Response("Unavailable", { status: 503 });
      const snapshot = structuredClone(subscription);
      clock += 1;
      if (providerReply) return providerReply(snapshot);
      return Response.json({ data: { activeSubscription: snapshot } });
    }
    assert.match(String(input), /^https:\/\/renewal-test\.myshopify\.com\//);
    return Response.json({ data: { shop: { id: "gid://shopify/Shop/123" } } });
  };
  const { encrypt } = await import("../src/lib/crypto");
  encryptedToken = encrypt("test-only-token");
  const { ensureCurrentBillingPeriod, refreshShopifyBillingForUser } = await import("../src/lib/shopify-billing");
  const { getQuotaState } = await import("../src/lib/quota");

  const renewed = await ensureCurrentBillingPeriod(row, now);
  assert.equal(renewed.orderQuotaUsed, 0);
  assert.equal(getQuotaState(renewed, now).allowed, true, "unattended renewal unlocks the next confirmed cycle");
  assert.equal(providerCalls, 1);
  row.orderQuotaUsed = 13;
  await ensureCurrentBillingPeriod(row, new Date());
  assert.equal(providerCalls, 1, "current paid cycle needs no extra provider request");
  assert.equal(row.orderQuotaUsed, 13);

  // Two worker/webhook refreshes beginning with the same stale snapshot must reset once.
  const beforeUpdates = updates;
  row = { ...old };
  await Promise.all([ensureCurrentBillingPeriod({ ...old } as any, now), ensureCurrentBillingPeriod({ ...old } as any, now)]);
  assert.equal(row.orderQuotaUsed, 0);
  assert(updates >= beforeUpdates + 1 && updates <= beforeUpdates + 2);

  row = { ...old };
  providerUnavailable = true;
  await assert.rejects(() => ensureCurrentBillingPeriod(row, now), /request failed/);
  assert.equal(row.orderQuotaUsed, 100, "outage never grants free renewal");
  assert.equal(row.quotaPeriodEnd.toISOString(), old.quotaPeriodEnd.toISOString());
  providerUnavailable = false;
  subscription = null;
  await ensureCurrentBillingPeriod(row, now);
  assert.equal(row.subscriptionStatus, "inactive");
  assert.equal(row.planTier, "solo_100", "cancelled paid account does not receive a fresh trial");
  assert.equal(row.orderQuotaUsed, 100);

  // Provider cancellation is discovered within the freshness bound, not only at renewal.
  row = { ...old, orderQuotaUsed: 47, quotaPeriodStart: new Date("2026-10-01"), quotaPeriodEnd: new Date("2026-10-31"), shopifyBillingCheckedAt: new Date(clock - 60_001) };
  subscription = null;
  await ensureCurrentBillingPeriod(row, new Date());
  assert.equal(row.subscriptionStatus, "inactive");
  assert.equal(row.orderQuotaUsed, 47);

  // A future cache timestamp is stale and must not block a verified correction.
  subscription = { billingPeriod: "EVERY_30_DAYS", cancelAtEndOfCycle: false, trialEndsAt: null,
    currentBillingCycle: { startTime: "2026-10-01T00:00:00Z", endTime: "2026-10-31T00:00:00Z" },
    items: [{ handle: "solo-100", description: "Solo", price: { __typename: "FlatRatePrice", active: true, currency: "USD", amount: "9" } }] };
  row = { ...row, subscriptionStatus: "active", shopifyBillingCheckedAt: new Date(clock + 10_000) };
  const futureCalls = providerCalls;
  await ensureCurrentBillingPeriod(row, new Date());
  assert.equal(providerCalls, futureCalls + 1);
  assert(row.shopifyBillingCheckedAt.getTime() <= clock);

  // Delayed same-cycle reads cannot overwrite a later downgrade or cancellation.
  for (const change of ["downgrade", "cancel"]) {
    row = { ...old, planTier: "empire_1000", orderQuotaUsed: 47, quotaPeriodStart: new Date("2026-10-01"), quotaPeriodEnd: new Date("2026-10-31"), shopifyBillingCheckedAt: null };
    subscription = { ...subscription, items: [{ handle: "empire-1000", description: "Empire", price: { __typename: "FlatRatePrice", active: true, currency: "USD", amount: "29" } }] };
    let first = true;
    let started!: () => void;
    let release!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    providerReply = async snapshot => {
      if (first) { first = false; started(); await held; }
      return Response.json({ data: { activeSubscription: snapshot } });
    };
    const delayed = refreshShopifyBillingForUser(row.id);
    await ready;
    subscription = change === "cancel" ? null : { ...subscription, items: [{ handle: "solo-100", description: "Solo", price: { __typename: "FlatRatePrice", active: true, currency: "USD", amount: "9" } }] };
    await refreshShopifyBillingForUser(row.id);
    const appliedStamp = row.shopifyBillingCheckedAt.getTime();
    release(); await delayed;
    assert.equal(row.subscriptionStatus, change === "cancel" ? "inactive" : "active");
    assert.equal(row.planTier, change === "cancel" ? "empire_1000" : "solo_100");
    assert.equal(row.orderQuotaUsed, 47);
    assert.equal(row.shopifyBillingCheckedAt.getTime(), appliedStamp);
    providerReply = null;
    if (!subscription) subscription = { billingPeriod: "EVERY_30_DAYS", cancelAtEndOfCycle: false, trialEndsAt: null,
      currentBillingCycle: { startTime: "2026-10-01T00:00:00Z", endTime: "2026-10-31T00:00:00Z" }, items: [] };
  }

  const before = providerCalls;
  row = { ...old, planTier: "trial", subscriptionStatus: "trial", orderQuotaUsed: 20, quotaPeriodEnd: null };
  await ensureCurrentBillingPeriod(row, new Date("2030-01-01"));
  assert.equal(row.orderQuotaUsed, 20);
  assert.equal(providerCalls, before, "trial has no monthly renewal");
  row = { ...old, stripeSubscriptionId: "sub_test_legacy" };
  await ensureCurrentBillingPeriod(row, now);
  assert.equal(providerCalls, before, "legacy Stripe invoice-paid renewal remains authoritative");
  row = { ...old };
  delete process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN;
  await assert.rejects(() => ensureCurrentBillingPeriod(row, now), /verification is unavailable/);
  assert.equal(row.orderQuotaUsed, 100);
  console.log("Unattended renewal, 60-second freshness, future-clock rejection, delayed same-cycle downgrade/cancellation protection, outage, one-time trial, and Stripe compatibility passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
