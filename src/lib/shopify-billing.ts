import { db } from "./db";
import { fetchShopifyShopId } from "./shopify";

const PARTNER_API_VERSION = "2026-07";

export type ShopifyPlanTier = "starter" | "growth" | "unlimited";

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
  const organizationId = process.env.SHOPIFY_PARTNER_ORG_ID;
  const accessToken = process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN;
  const appId = process.env.SHOPIFY_APP_GID;
  if (!organizationId || !accessToken || !appId) return null;
  return { organizationId, accessToken, appId };
}

export function shopifyPricingUrl(shopDomain: string) {
  const appHandle = process.env.SHOPIFY_APP_HANDLE;
  if (!appHandle) throw new Error("SHOPIFY_APP_HANDLE is not configured");
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
  if (!flat?.price.amount) return null;
  const amount = Number(flat.price.amount);
  if (amount === 8) return "starter";
  if (amount === 29) return "growth";
  if (amount === 49) return "unlimited";
  return null;
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

  const [user, connection] = await Promise.all([
    db.user.findUnique({ where: { id: userId } }),
    db.shopifyConnection.findUnique({ where: { userId } }),
  ]);
  if (!user || !connection) return { configured: true as const, source: "shopify" as const, active: false as const };

  // Preserve any legacy Stripe subscription until it is explicitly migrated/cancelled.
  if (user.stripeSubscriptionId && (user.subscriptionStatus === "active" || user.subscriptionStatus === "trialing")) {
    return { configured: true as const, source: "stripe_legacy" as const, active: true as const, planTier: user.planTier };
  }

  const shopId = await fetchShopifyShopId(connection.shopDomain, connection.accessToken);
  const subscription = await fetchActiveShopifySubscription(shopId);

  if (!subscription) {
    if (user.planTier !== "trial") {
      await db.user.update({ where: { id: userId }, data: { subscriptionStatus: "inactive" } });
    }
    return { configured: true as const, source: "shopify" as const, active: false as const };
  }

  const planTier = planTierForShopifySubscription(subscription);
  if (!planTier) throw new Error("Active Shopify subscription does not match the SyncStock $8/$29/$49 monthly catalog");

  const periodStart = subscription.currentBillingCycle ? new Date(subscription.currentBillingCycle.startTime) : null;
  const periodEnd = subscription.currentBillingCycle ? new Date(subscription.currentBillingCycle.endTime) : null;
  const status = subscription.trialEndsAt ? "trialing" : "active";

  await db.$transaction(async (tx) => {
    const current = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const periodAdvanced = Boolean(
      periodStart && (!current.quotaPeriodStart || periodStart.getTime() > current.quotaPeriodStart.getTime())
    );
    await tx.user.update({
      where: { id: userId },
      data: {
        planTier,
        subscriptionStatus: status,
        quotaPeriodStart: periodStart ?? current.quotaPeriodStart,
        quotaPeriodEnd: periodEnd ?? current.quotaPeriodEnd,
        ...(periodAdvanced ? { orderQuotaUsed: 0 } : {}),
      },
    });
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
