import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { isSubscriptionActive, priceForPlan } from "@/lib/plans";

export async function POST(req: NextRequest) {
  if (process.env.BILLING_PROVIDER !== "stripe_legacy") {
    return NextResponse.json(
      { error: "New SyncStock subscriptions are billed through Shopify. Open Billing and choose a Shopify plan." },
      { status: 410 }
    );
  }

  if (process.env.SYNCSTOCK_SANDBOX === "true") {
    return NextResponse.json({ error: "Paid checkout is disabled in the sandbox." }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { plan } = await req.json().catch(() => ({}));
  const priceId = priceForPlan(plan);
  if (!priceId) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  if (user.stripeSubscriptionId && isSubscriptionActive(user.subscriptionStatus)) {
    return NextResponse.json(
      { error: "You already have an active legacy subscription. Use Manage billing to change or cancel it." },
      { status: 409 }
    );
  }

  const [shopifyConnection, qboConnection, mappingCount] = await Promise.all([
    db.shopifyConnection.findUnique({ where: { userId: user.id }, select: { id: true, webhookId: true } }),
    db.qboConnection.findUnique({ where: { userId: user.id }, select: { id: true } }),
    db.productMapping.count({ where: { userId: user.id } }),
  ]);

  if (!shopifyConnection || !shopifyConnection.webhookId || !qboConnection || mappingCount < 1) {
    return NextResponse.json(
      { error: "Finish Shopify, QuickBooks, and at least one product mapping before choosing a paid plan. Your 20-order beta trial remains free." },
      { status: 409 }
    );
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Legacy Stripe billing is not configured." }, { status: 503 });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
