import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { PLAN_LABELS, PLAN_LIMITS } from "@/lib/plans";
import { refreshShopifyBillingForUser } from "@/lib/shopify-billing";
import { getQboClientForUser } from "@/lib/qbo";

export const dynamic = "force-dynamic";

export async function GET() {
  let user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    await refreshShopifyBillingForUser(user.id);
    user = (await db.user.findUnique({ where: { id: user.id } })) ?? user;
  } catch (error) {
    console.warn("[embedded billing] Could not refresh Shopify billing state", error);
  }

  const [shopify, qbo, mappingCount, logs, adjustments] = await Promise.all([
    db.shopifyConnection.findUnique({ where: { userId: user.id } }),
    db.qboConnection.findUnique({ where: { userId: user.id }, select: { id: true, realmId: true } }),
    db.productMapping.count({ where: { userId: user.id } }),
    db.syncLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, orderNumber: true, status: true, errorMessage: true, shopifyTotal: true, qboActualTotal: true, createdAt: true },
    }),
    db.orderAdjustment.count({ where: { userId: user.id, status: "needs_review" } }),
  ]);

  let qboRequiresReconnect = false;
  if (qbo) {
    try {
      // This does not query QuickBooks. It only refreshes the OAuth access token
      // when the stored token is near expiry. A rejected refresh token means the
      // merchant must explicitly authorize QuickBooks again.
      await getQboClientForUser(user.id);
    } catch (error) {
      qboRequiresReconnect = true;
      console.warn("[embedded qbo] QuickBooks authorization requires reconnect", error);
    }
  }

  const limit = PLAN_LIMITS[user.planTier] ?? PLAN_LIMITS.trial;
  return NextResponse.json({
    shopify: {
      connected: Boolean(shopify),
      domain: shopify?.shopDomain ?? null,
      webhookReady: Boolean(shopify?.webhookId),
      lifecycleReady: Boolean(shopify?.refundWebhookId && shopify?.cancelledWebhookId && shopify?.uninstallWebhookId),
    },
    quickbooks: {
      connected: Boolean(qbo) && !qboRequiresReconnect,
      requiresReconnect: qboRequiresReconnect,
      realmId: qbo?.realmId ?? null,
    },
    mappings: { count: mappingCount },
    plan: {
      tier: user.planTier,
      label: PLAN_LABELS[user.planTier] ?? user.planTier,
      status: user.subscriptionStatus,
      used: user.orderQuotaUsed,
      limit: limit === Infinity ? null : limit,
    },
    adjustmentsNeedingReview: adjustments,
    logs,
  });
}
