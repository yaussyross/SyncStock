import type { User } from "@prisma/client";
import { isSubscriptionActive, PLAN_LIMITS } from "./plans";

export interface QuotaState {
  allowed: boolean;
  limit: number;
  reason: "ok" | "quota_exceeded" | "subscription_inactive" | "billing_period_expired";
}

export function getQuotaState(user: User, now = new Date()): QuotaState {
  const limit = PLAN_LIMITS[user.planTier] ?? PLAN_LIMITS.trial;

  if (user.planTier === "trial") {
    return {
      allowed: user.orderQuotaUsed < limit,
      limit,
      reason: user.orderQuotaUsed < limit ? "ok" : "quota_exceeded",
    };
  }

  if (!isSubscriptionActive(user.subscriptionStatus)) {
    return { allowed: false, limit, reason: "subscription_inactive" };
  }

  if (user.quotaPeriodEnd && now.getTime() >= user.quotaPeriodEnd.getTime()) {
    // Usage only resets after Stripe confirms the next invoice was paid.
    return { allowed: false, limit, reason: "billing_period_expired" };
  }

  if (user.orderQuotaUsed >= limit) {
    return { allowed: false, limit, reason: "quota_exceeded" };
  }

  return { allowed: true, limit, reason: "ok" };
}
