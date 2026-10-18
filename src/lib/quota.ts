import type { User } from "@prisma/client";
import { isSubscriptionActive, PLAN_LIMITS } from "./plans";

export interface QuotaState {
  allowed: boolean;
  limit: number;
  reason: "ok" | "quota_exceeded" | "subscription_inactive" | "billing_period_expired";
}

// Reconcile an already-attempted external write even after cancellation or a
// downgrade. This is not permission to create a new receipt; sync-quota fences
// that action separately and sync.ts queries the existing DocNumber only.
export function isReservedRecovery(log: { quotaReserved: boolean; qboWriteState: string | null }) {
  return log.quotaReserved && log.qboWriteState === "creating";
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

  if (!user.quotaPeriodEnd || now.getTime() >= user.quotaPeriodEnd.getTime()) {
    // Reset only after the billing provider confirms the next paid cycle.
    return { allowed: false, limit, reason: "billing_period_expired" };
  }

  if (user.orderQuotaUsed >= limit) {
    return { allowed: false, limit, reason: "quota_exceeded" };
  }

  return { allowed: true, limit, reason: "ok" };
}
