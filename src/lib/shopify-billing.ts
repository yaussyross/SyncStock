import { db } from "./db";
import { ensureFreshShopifyConnection, fetchShopifyShopId } from "./shopify";
import { PUBLIC_PLANS, isSubscriptionActive, type PublicPlanTier } from "./plans";
import type { User } from "@prisma/client";

const PARTNER_API_VERSION = "2026-07";
const DEFAULT_SHOPIFY_APP_HANDLE = "syncstock-productionn";
const DEFAULT_SHOPIFY_PARTNER_ORG_ID = "511473";
const DEFAULT_SHOPIFY_APP_GID = "gid://shopify/App/424848261121";
export const SHOPIFY_BILLING_MAX_AGE_MS = 60_000;

function alreadyAppliedNewerSnapshot(checkedAt: Date | null, requestStartedAt: Date) {
  // Future timestamps are invalid cache entries, not permanent write barriers.
  return checkedAt && checkedAt.getTime() <= Date.now() && checkedAt >= requestStartedAt;
}

export type ShopifyPlanTier = "starter" | "growth" | "unlimited" | PublicPlanTier;

const PLAN_TIER_BY_HANDLE: Record<string, ShopifyPlanTier> = {
  ...Object.fromEntries(PUBLIC_PLANS.map(plan => [plan.handle, plan.tier])),
  solo: "starter",
  scale: "growth",
  empire: "unlimited",
};

export interface ActiveShopifySubscription {
  billingPeriod: string;
  cancelAtEndOfCycle: boolean;
  trialEndsAt: string | null;
  currentBillingCycle: null | {
    startTime: string;
    endTime: string;
  };
  items: Array<{
    handle: string;
    description: string | null;
    price: {
      __typename: string;
      active: boolean;
      currency: string;
      amount?: string;
    };
  }>;
}

function requiredPartnerConfig() {
  const organizationId = process.env.SHOPIFY_PARTNER_ORG_ID?.trim() || DEFAULT_SHOPIFY_PARTNER_ORG_ID;
  const accessToken = process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN?.trim();
  const appId = process.env.SHOPIFY_APP_GID?.trim() || DEFAULT_SHOPIFY_APP_GID;
  if (!accessToken) return null;
  return { organizationId, accessToken, appId };
}

export function shopifyPricingUrl(shopDomain: string) {
  const configuredHandle = process.env.SHOPIFY_APP_HANDLE?.trim();
  const appHandle =
    !configuredHandle || configuredHandle === "syncstock-production"
      ? DEFAULT_SHOPIFY_APP_HANDLE
      : configuredHandle;
  if (!shopDomain.endsWith(".myshopify.com")) throw new Error("Invalid Shopify shop domain");
  const storeHandle = shopDomain.slice(0, -".myshopify.com".length);
  if (!storeHandle) throw new Error("Invalid Shopify shop domain");
  return `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/charges/${encodeURIComponent(appHandle)}/pricing_plans`;
}

export function planTierForShopifySubscription(subscription: ActiveShopifySubscription): ShopifyPlanTier | null {
  if (subscription.billingPeriod !== "EVERY_30_DAYS") return null;
  const flat = subscription.items.find(
    (item) => item.price.__typename === "FlatRatePrice" && item.price.active && item.price.currency === "USD" && item.price.amount
  );
  if (!flat) return null;

  // Shopify creates no-charge development-store contracts with an effective
  // recurring amount of $0. The subscription item handle remains the plan
  // handle, so use it as the canonical mapping and keep amount matching as a
  // production/backward-compatible fallback.
  const handleTier = PLAN_TIER_BY_HANDLE[flat.handle.trim().toLowerCase()];
  if (handleTier) {
    const expected = PUBLIC_PLANS.find(plan => plan.tier === handleTier)?.monthlyPriceUsd
      ?? ({ starter: 8, growth: 29, unlimited: 49 } as Record<string, number>)[handleTier];
    // An accidental in-place catalog edit must not silently grant the old cap.
    const amount = Number(flat.price.amount);
    return amount === 0 || amount === expected ? handleTier : null;
  }

  if (!flat.price.amount) return null;
  const amount = Number(flat.price.amount);
  if (amount === 8) return "starter";
  if (amount === 29) return "growth";
  if (amount === 49) return "unlimited";
  return null;
}


export interface ShopifyBillingUserState {
  planTier: string;
  subscriptionStatus: string;
  quotaPeriodStart: Date | null;
  quotaPeriodEnd: Date | null;
  orderQuotaUsed: number;
}

export interface ShopifyBillingPatch {
  planTier?: ShopifyPlanTier;
  subscriptionStatus?: string;
  quotaPeriodStart?: Date | null;
  quotaPeriodEnd?: Date | null;
  orderQuotaUsed?: number;
}

export function shopifyBillingPatch(
  current: ShopifyBillingUserState,
  subscription: ActiveShopifySubscription | null,
): ShopifyBillingPatch | null {
  if (!subscription) {
    return current.planTier === "trial" ? null : { subscriptionStatus: "inactive" };
  }

  const planTier = planTierForShopifySubscription(subscription);
  if (!planTier) {
    throw new Error("Active Shopify subscription does not match a recognized SyncStock monthly plan");
  }

  const periodStart = subscription.currentBillingCycle ? new Date(subscription.currentBillingCycle.startTime) : null;
  const periodEnd = subscription.currentBillingCycle ? new Date(subscription.currentBillingCycle.endTime) : null;
  if (periodStart && (!Number.isFinite(periodStart.getTime()) || !periodEnd || !Number.isFinite(periodEnd.getTime()) || periodEnd <= periodStart)) {
    throw new Error("Shopify returned an invalid billing cycle");
  }
  // A slower previous refresh must never move usage back into an old cycle.
  if (periodStart && current.quotaPeriodStart && periodStart < current.quotaPeriodStart) return null;
  const periodAdvanced = Boolean(
    periodStart && (!current.quotaPeriodStart || periodStart.getTime() > current.quotaPeriodStart.getTime())
  );

  return {
    planTier,
    subscriptionStatus: subscription.trialEndsAt ? "trialing" : "active",
    quotaPeriodStart: periodStart ?? current.quotaPeriodStart,
    quotaPeriodEnd: periodEnd ?? current.quotaPeriodEnd,
    ...(periodAdvanced ? { orderQuotaUsed: 0 } : {}),
  };
}

export async function fetchActiveShopifySubscription(shopId: string): Promise<ActiveShopifySubscription | null> {
  const config = requiredPartnerConfig();
  if (!config) throw new Error("Shopify Partner API billing credentials are not configured");

  const response = await fetch(
    `https://partners.shopify.com/${config.organizationId}/api/${PARTNER_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": config.accessToken,
      },
      body: JSON.stringify({
        query: `
          query SyncStockActiveSubscription($appId: ID!, $shopId: ID!) {
            activeSubscription(appId: $appId, shopId: $shopId) {
              billingPeriod
              cancelAtEndOfCycle
              trialEndsAt
              currentBillingCycle { startTime endTime }
              items {
                handle
                description
                price {
                  __typename
                  active
                  currency
                  ... on FlatRatePrice { amount }
                }
              }
            }
          }
        `,
        variables: { appId: config.appId, shopId },
      }),
      cache: "no-store",
    }
  );

  const payload = await response.json().catch(() => null) as null | {
    data?: { activeSubscription?: ActiveShopifySubscription | null };
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok || payload?.errors?.length) {
    const detail = payload?.errors?.map((error) => error.message).filter(Boolean).join("; ") || String(response.status);
    throw new Error(`Shopify Partner API request failed: ${detail}`);
  }
  return payload?.data?.activeSubscription ?? null;
}

export async function refreshShopifyBillingForUser(userId: string) {
  const config = requiredPartnerConfig();
  if (!config) return { configured: false as const, source: "shopify" as const };

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { configured: true as const, source: "shopify" as const, active: false as const };

  let connection;
  try {
    connection = await ensureFreshShopifyConnection(userId);
  } catch (error: any) {
    if (error?.message === "Shopify connection not found") {
      return { configured: true as const, source: "shopify" as const, active: false as const };
    }
    throw error;
  }

  // Preserve any legacy Stripe subscription until it is explicitly migrated/cancelled.
  if (user.stripeSubscriptionId && (user.subscriptionStatus === "active" || user.subscriptionStatus === "trialing")) {
    return { configured: true as const, source: "stripe_legacy" as const, active: true as const, planTier: user.planTier };
  }

  const shopId = await fetchShopifyShopId(connection.shopDomain, connection.accessToken);
  // Capture immediately before the entitlement query, after prerequisite I/O.
  // Equal-millisecond concurrent snapshots cannot overwrite an applied result.
  const refreshStartedAt = new Date();
  const subscription = await fetchActiveShopifySubscription(shopId);

  if (!subscription) {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (alreadyAppliedNewerSnapshot(current.shopifyBillingCheckedAt, refreshStartedAt)) return;
      const patch = shopifyBillingPatch(current, null);
      if (patch) await tx.user.update({ where: { id: userId }, data: { ...patch, shopifyBillingCheckedAt: refreshStartedAt } });
    });
    return { configured: true as const, source: "shopify" as const, active: false as const };
  }

  const planTier = planTierForShopifySubscription(subscription);
  if (!planTier) throw new Error("Active Shopify subscription does not match a recognized SyncStock monthly plan");
  const periodStart = subscription.currentBillingCycle ? new Date(subscription.currentBillingCycle.startTime) : null;
  const periodEnd = subscription.currentBillingCycle ? new Date(subscription.currentBillingCycle.endTime) : null;

  await db.$transaction(async (tx) => {
    // Serialize refreshes with quota admission/completion and legacy renewals.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const current = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (alreadyAppliedNewerSnapshot(current.shopifyBillingCheckedAt, refreshStartedAt)) return;
    const patch = shopifyBillingPatch(current, subscription);
    if (!patch) return;
    await tx.user.update({ where: { id: userId }, data: { ...patch, shopifyBillingCheckedAt: refreshStartedAt } });
  });

  return {
    configured: true as const,
    source: "shopify" as const,
    active: true as const,
    planTier,
    periodStart,
    periodEnd,
    cancelAtEndOfCycle: subscription.cancelAtEndOfCycle,
  };
}

/** Verify paid entitlement at least once a minute during active processing.
 * Provider failure propagates so webhook/worker retries can recover safely.
 * Trial usage never resets on a calendar boundary; Stripe renewals stay on
 * their existing invoice-paid path.
 */
export async function ensureCurrentBillingPeriod(user: User, now = new Date()): Promise<User> {
  if (user.planTier === "trial") return user;
  if (user.stripeSubscriptionId && isSubscriptionActive(user.subscriptionStatus)) return user;
  const age = user.shopifyBillingCheckedAt ? now.getTime() - user.shopifyBillingCheckedAt.getTime() : Infinity;
  const fresh = age >= 0 && age < SHOPIFY_BILLING_MAX_AGE_MS;
  if (fresh && isSubscriptionActive(user.subscriptionStatus) && user.quotaPeriodEnd && user.quotaPeriodEnd > now) return user;
  const result = await refreshShopifyBillingForUser(user.id);
  if (!result.configured) throw new Error("Shopify billing verification is unavailable; sync will retry safely");
  return db.user.findUniqueOrThrow({ where: { id: user.id } });
}
