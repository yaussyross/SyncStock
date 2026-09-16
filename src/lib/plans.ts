export const PLAN_LIMITS: Record<string, number> = {
  trial: 20,
  starter: 200,
  growth: 1000,
  unlimited: Infinity,
};

export const PLAN_LABELS: Record<string, string> = {
  trial: "Trial",
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
