export const PLAN_LIMITS: Record<string, number> = {
  trial: 20,
  starter: 200,
  growth: 1000,
  unlimited: Infinity,
};

export const PLAN_LABELS: Record<string, string> = {
  trial: "Trial",
  starter: "Solo",
  growth: "Growth",
  unlimited: "Pro",
};

export function planForPrice(priceId?: string | null): string {
  if (!priceId) return "trial";
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === process.env.STRIPE_PRICE_GROWTH) return "growth";
  if (priceId === process.env.STRIPE_PRICE_UNLIMITED) return "unlimited";
  return "trial";
}

export function priceForPlan(plan: string): string | null {
  if (plan === "starter") return process.env.STRIPE_PRICE_STARTER || null;
  if (plan === "growth") return process.env.STRIPE_PRICE_GROWTH || null;
  if (plan === "unlimited") return process.env.STRIPE_PRICE_UNLIMITED || null;
  return null;
}

export function isSubscriptionActive(status?: string | null) {
  return status === "active" || status === "trialing";
}
