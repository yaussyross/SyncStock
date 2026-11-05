// New Shopify catalog. Distinct handles keep legacy contracts unambiguous,
// especially the old $29 Scale plan and the new $29 Empire plan.
// These handles must be verified in Partner Dashboard before publication.
export const PUBLIC_PLANS = [
  { tier: "solo_100", handle: "solo-100", label: "Solo", monthlyPriceUsd: 9, orderLimit: 100 },
  { tier: "scale_250", handle: "scale-250", label: "Scale", monthlyPriceUsd: 19, orderLimit: 250 },
  { tier: "empire_1000", handle: "empire-1000", label: "Empire", monthlyPriceUsd: 29, orderLimit: 1000 },
] as const;

export type PublicPlanTier = typeof PUBLIC_PLANS[number]["tier"];

export const PLAN_LIMITS: Record<string, number> = {
  trial: 20,
  ...Object.fromEntries(PUBLIC_PLANS.map(plan => [plan.tier, plan.orderLimit])),
  // Previously issued Shopify/Stripe contracts keep their original allowance.
  starter: 200,
  growth: 1000,
  unlimited: Infinity,
};

export const PLAN_LABELS: Record<string, string> = {
  trial: "Trial",
  ...Object.fromEntries(PUBLIC_PLANS.map(plan => [plan.tier, plan.label])),
  starter: "Solo",
  growth: "Scale",
  unlimited: "Empire",
};

// Public live Stripe price IDs for the connected SyncStock account.
// Keeping the launch catalog mapping in source prevents stale deployment
// environment variables from silently pointing checkout at nonexistent prices.
export const PLAN_PRICE_IDS: Record<string, string> = {
  starter: "price_1UDqtYDnfYoetMiVTKb5hyOK",
  growth: "price_1UDqueDnfYoetMiVg1wryzYZ",
  unlimited: "price_1UDquyDnfYoetMiVcRAa2lX2",
};

export function planForPrice(priceId?: string | null): string {
  if (!priceId) return "trial";
  if (priceId === PLAN_PRICE_IDS.starter) return "starter";
  if (priceId === PLAN_PRICE_IDS.growth) return "growth";
  if (priceId === PLAN_PRICE_IDS.unlimited) return "unlimited";
  return "trial";
}

export function priceForPlan(plan: string): string | null {
  return PLAN_PRICE_IDS[plan] || null;
}

export function isSubscriptionActive(status?: string | null) {
  return status === "active" || status === "trialing";
}
