import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { planForPrice } from "@/lib/plans";

import { applySubscription } from "@/lib/stripe-subscription";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);


function invoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const raw = invoice as any;
  const subscription = raw.subscription ?? raw.parent?.subscription_details?.subscription;
  return typeof subscription === "string" ? subscription : subscription?.id;
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
      await applySubscription(current);
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (subscriptionId) {
        const current = await stripe.subscriptions.retrieve(subscriptionId);
        await applySubscription(current, invoice.id);
      }
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (subscriptionId) {
        const current = await stripe.subscriptions.retrieve(subscriptionId);
        await applySubscription(current);
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      await db.user.updateMany({
        where: { stripeCustomerId: customerId, stripeSubscriptionId: sub.id },
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
