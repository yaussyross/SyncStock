import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function planForPrice(priceId: string): string {
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === process.env.STRIPE_PRICE_GROWTH) return "growth";
  if (priceId === process.env.STRIPE_PRICE_UNLIMITED) return "unlimited";
  return "trial";
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items.data[0].price.id;
      const plan = sub.status === "active" || sub.status === "trialing" ? planForPrice(priceId) : "trial";
      await db.user.updateMany({
        where: { stripeCustomerId: sub.customer as string },
        data: { planTier: plan, orderQuotaUsed: 0, quotaResetAt: new Date() },
      });
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await db.user.updateMany({
        where: { stripeCustomerId: sub.customer as string },
        data: { planTier: "trial" },
      });
      break;
    }
  }

  return NextResponse.json({ received: true });
}
