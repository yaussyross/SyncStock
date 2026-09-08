import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { isSubscriptionActive, planForPrice } from "@/lib/plans";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function periodDates(sub: Stripe.Subscription) {
  const raw = sub as any;
  const start = Number(raw.current_period_start ?? raw.items?.data?.[0]?.current_period_start ?? 0);
  const end = Number(raw.current_period_end ?? raw.items?.data?.[0]?.current_period_end ?? 0);
  return {
    start: start ? new Date(start * 1000) : null,
    end: end ? new Date(end * 1000) : null,
  };
}

async function applySubscription(sub: Stripe.Subscription, resetForPaidPeriod: boolean) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const priceId = sub.items.data[0]?.price?.id;
  const planTier = planForPrice(priceId);
  const { start, end } = periodDates(sub);

  const user = await db.user.findFirst({ where: { stripeCustomerId: customerId } });
  if (!user) return;

  const periodChanged = !!start && (!user.quotaPeriodStart || user.quotaPeriodStart.getTime() !== start.getTime());
  const firstPaidActivation = user.planTier === "trial" && planTier !== "trial" && isSubscriptionActive(sub.status);
  const shouldReset = isSubscriptionActive(sub.status) && (firstPaidActivation || (resetForPaidPeriod && periodChanged));

  await db.user.update({
    where: { id: user.id },
    data: {
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      planTier,
      quotaPeriodStart: start,
      quotaPeriodEnd: end,
      ...(shouldReset ? { orderQuotaUsed: 0, quotaResetAt: start ?? new Date() } : {}),
    },
  });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const eventSub = event.data.object as Stripe.Subscription;
      // Stripe does not guarantee webhook ordering. Retrieve current state before provisioning.
      const current = await stripe.subscriptions.retrieve(eventSub.id);
      await applySubscription(current, false);
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = typeof (invoice as any).subscription === "string"
        ? (invoice as any).subscription
        : (invoice as any).subscription?.id;
      if (subscriptionId) {
        const current = await stripe.subscriptions.retrieve(subscriptionId);
        await applySubscription(current, true);
      }
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = typeof (invoice as any).subscription === "string"
        ? (invoice as any).subscription
        : (invoice as any).subscription?.id;
      if (subscriptionId) {
        const current = await stripe.subscriptions.retrieve(subscriptionId);
        await applySubscription(current, false);
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      await db.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: {
          stripeSubscriptionId: sub.id,
          subscriptionStatus: "canceled",
          planTier: planForPrice(sub.items.data[0]?.price?.id),
          // A former subscriber does not receive a fresh free trial after cancellation.
          orderQuotaUsed: 20,
          quotaPeriodEnd: new Date(),
        },
      });
      break;
    }
  }

  return NextResponse.json({ received: true });
}
