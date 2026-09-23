import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { refreshShopifyBillingForUser, shopifyPricingUrl } from "@/lib/shopify-billing";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const billing = await refreshShopifyBillingForUser(user.id);
    return NextResponse.json(billing);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not refresh Shopify billing" }, { status: 502 });
  }
}

export async function POST() {
  if (process.env.SYNCSTOCK_SANDBOX === "true") {
    return NextResponse.json({ error: "Paid plan selection is disabled in the isolated sandbox." }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [shopifyConnection, qboConnection, mappingCount] = await Promise.all([
    db.shopifyConnection.findUnique({ where: { userId: user.id }, select: { shopDomain: true, webhookId: true } }),
    db.qboConnection.findUnique({ where: { userId: user.id }, select: { id: true } }),
    db.productMapping.count({ where: { userId: user.id } }),
  ]);

  if (!shopifyConnection || !shopifyConnection.webhookId || !qboConnection || mappingCount < 1) {
    return NextResponse.json(
      { error: "Finish Shopify, QuickBooks, and at least one product mapping before choosing a paid plan. Your 20-order trial remains free." },
      { status: 409 }
    );
  }

  try {
    return NextResponse.json({ url: shopifyPricingUrl(shopifyConnection.shopDomain) });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Shopify App Pricing is not configured yet." },
      { status: 503 }
    );
  }
}
