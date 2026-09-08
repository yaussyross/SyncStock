import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { syncQueue } from "@/lib/queue";
import { fetchShopifyOrderForRetry } from "@/lib/shopify";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { syncLogId } = await req.json();
  const log = await db.syncLog.findFirst({ where: { id: syncLogId, userId: user.id } });
  if (!log) return NextResponse.json({ error: "Sync log not found" }, { status: 404 });

  if (log.status === "success") {
    return NextResponse.json({ error: "This order has already synced successfully" }, { status: 409 });
  }

  if (log.qboInvoiceId || log.status === "reconciliation_failed_qbo") {
    return NextResponse.json(
      {
        error:
          "A QuickBooks transaction already exists for this order and requires manual review before SyncStock can retry it.",
      },
      { status: 409 }
    );
  }

  const connection = await db.shopifyConnection.findUnique({ where: { userId: user.id } });
  if (!connection) return NextResponse.json({ error: "Shopify not connected" }, { status: 400 });

  let order;
  try {
    order = await fetchShopifyOrderForRetry(connection.shopDomain, connection.accessToken, log.shopifyOrderId);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not re-fetch order from Shopify" }, { status: 502 });
  }

  await db.syncLog.update({
    where: { id: syncLogId },
    data: {
      status: "pending",
      errorMessage: null,
      qboActualTotal: null,
    },
  });

  await syncQueue.add("sync-order", { userId: user.id, order }, { jobId: `retry-${log.id}-${Date.now()}` });
  return NextResponse.json({ queued: true });
}
