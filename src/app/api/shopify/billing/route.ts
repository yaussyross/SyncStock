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

  const shopifyConnection = await db.shopifyConnection.findUnique({
    where: { userId: user.id },
    select: { shopDomain: true },
  });

  // Plan approval is available immediately after install/reinstall. Accounting
  // setup and quota checks still gate order processing, not Shopify's pricing UI.
  if (!shopifyConnection) {
    return NextResponse.json(
      { error: "Connect Shopify before choosing a plan. Open SyncStock from Shopify Admin to continue." },
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
