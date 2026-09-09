import type Stripe from "stripe";
import { db } from "./db";
import { isSubscriptionActive, planForPrice } from "./plans";

function periodDates(sub: Stripe.Subscription) {
  const raw = sub as any;
  const start = Number(raw.current_period_start ?? raw.items?.data?.[0]?.current_period_start ?? 0);
  const end = Number(raw.current_period_end ?? raw.items?.data?.[0]?.current_period_end ?? 0);
  return {
    start: start ? new Date(start * 1000) : null,
    end: end ? new Date(end * 1000) : null,
  };
}

export async function applySubscription(sub: Stripe.Subscription, paidInvoiceId?: string) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const planTier = planForPrice(sub.items.data[0]?.price?.id);
  const { start, end } = periodDates(sub);
  const latestInvoiceId = typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;
  // A delayed old invoice must not grant the current, potentially unpaid period.
  const paidCurrentPeriod = !!paidInvoiceId && paidInvoiceId === latestInvoiceId && !!start && !!end;

  await db.$transaction(async (tx) => {
    // Serialize concurrent deliveries so duplicate invoice.paid events reset once.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "stripeCustomerId" = ${customerId} FOR UPDATE`;
    const user = await tx.user.findFirst({ where: { stripeCustomerId: customerId } });
    if (!user) return;
    const newerPaidPeriod = paidCurrentPeriod &&
      (!user.quotaPeriodStart || start!.getTime() > user.quotaPeriodStart.getTime());
    await tx.user.update({
      where: { id: user.id },
      data: {
        stripeSubscriptionId: sub.id,
        subscriptionStatus: sub.status,
        planTier,
        // Subscription updates never advance the paid-period marker. Otherwise
        // an update arriving before invoice.paid would swallow the quota reset.
        ...(newerPaidPeriod && isSubscriptionActive(sub.status) ? {
          quotaPeriodStart: start,
          quotaPeriodEnd: end,
          orderQuotaUsed: 0,
          quotaResetAt: start!,
        } : {}),
      },
    });
  });
}

