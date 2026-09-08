import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { isSubscriptionActive, priceForPlan } from "@/lib/plans";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { plan } = await req.json().catch(() => ({}));
  const priceId = priceForPlan(plan);
  if (!priceId) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  if (user.stripeSubscriptionId && isSubscriptionActive(user.subscriptionStatus)) {
    return NextResponse.json(
      { error: "You already have an active subscription. Use Manage billing to change or cancel it." },
      { status: 409 }
    );
  }

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { syncstockUserId: user.id },
    });
    customerId = customer.id;
    await db.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: user.id,
    allow_promotion_codes: true,
    success_url: `${process.env.APP_URL}/dashboard?billing=success`,
    cancel_url: `${process.env.APP_URL}/dashboard/billing?billing=cancelled`,
    subscription_data: { metadata: { syncstockUserId: user.id } },
  });

  return NextResponse.json({ url: session.url });
}
