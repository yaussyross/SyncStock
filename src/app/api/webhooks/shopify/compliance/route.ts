import { verifyShopifyWebhook } from "@/lib/shopify-webhook-signatures";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redactShop, ShopRedactionOwnershipError } from "@/lib/shopify-shop-redaction";


export async function POST(req: NextRequest) {
  const rawBodyBytes = new Uint8Array(await req.arrayBuffer());
  const rawBody = new TextDecoder().decode(rawBodyBytes);
  const topic = req.headers.get("x-shopify-topic");
  const deliveryId = req.headers.get("x-shopify-webhook-id") || crypto.randomUUID();
  const shopDomain = req.headers.get("x-shopify-shop-domain");
  const hmac = req.headers.get("x-shopify-hmac-sha256");
  const hmacValid = verifyShopifyWebhook(rawBodyBytes, hmac);
  console.info("[shopify webhook diagnostic]", { route: "compliance", topic, shopDomain, hasHmac: Boolean(hmac), hmacValid });

  if (!hmacValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  if (!topic || !shopDomain) return NextResponse.json({ error: "Missing Shopify metadata" }, { status: 400 });

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (topic === "shop/redact") {
    // HMAC authenticates the body, not the routing headers. Bind destructive
    // cleanup to the signed shop domain before resolving any account.
    if (payload?.shop_domain !== shopDomain || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopDomain)) {
      return NextResponse.json({ error: "Invalid shop redaction domain" }, { status: 400 });
    }
    const triggeredAt = new Date(req.headers.get("x-shopify-triggered-at") ?? "");
    if (!Number.isFinite(triggeredAt.getTime())) {
      return NextResponse.json({ error: "Missing or invalid Shopify event timestamp" }, { status: 400 });
    }
    try {
      const redacted = await redactShop(db, shopDomain, triggeredAt);
      if (!redacted) {
        return NextResponse.json({ received: true, ignored: true, reason: "newer_shop_lifecycle" });
      }
    } catch (error) {
      console.error("[shopify shop redaction]", {
        reason: error instanceof ShopRedactionOwnershipError ? "ownership_review_required" : "transaction_failed",
      });
      return NextResponse.json({ error: "Shop redaction incomplete" }, { status: 500 });
    }
    return NextResponse.json({ received: true, redacted: true });
  }

  const connection = await db.shopifyConnection.findUnique({ where: { shopDomain } });
  const tombstone = connection ? null : await db.shopTombstone.findUnique({ where: { shopDomain } });
  const userId = connection?.userId ?? tombstone?.userId ?? null;

  // If Shopify requests customer data after the connection has already been
  // fully redacted, there is no Shopify-derived customer/order data left here.
  if (!userId) return NextResponse.json({ received: true, records: 0 });

  if (topic === "customers/data_request") {
    const requestedOrderIds = Array.isArray(payload?.orders_requested)
      ? payload.orders_requested.map((id: any) => String(id))
      : [];
    const records = requestedOrderIds.length
      ? await db.syncLog.findMany({
          where: { userId, shopifyOrderId: { in: requestedOrderIds } },
          select: {
            shopifyOrderId: true,
            orderNumber: true,
            qboInvoiceId: true,
            status: true,
            createdAt: true,
          },
        })
      : [];

    const requestId = `customers_data_request:${payload?.data_request?.id ?? deliveryId}`;
    await db.complianceRequest.upsert({
      where: { requestId },
      update: {},
      create: {
        userId,
        requestId,
        shopDomain,
        kind: "customers_data_request",
        orderIds: requestedOrderIds,
        status: "completed",
        completedAt: new Date(),
        response: {
          customerProfileDataStored: false,
          matchingOrderSyncRecords: records.map((record) => ({
            shopifyOrderId: record.shopifyOrderId,
            orderNumber: record.orderNumber,
            quickBooksTransactionId: record.qboInvoiceId,
            syncStatus: record.status,
            syncedAt: record.createdAt.toISOString(),
          })),
        },
      },
    });
    return NextResponse.json({ received: true, records: records.length });
  }

  if (topic === "customers/redact") {
    const orderIds = Array.isArray(payload?.orders_to_redact)
      ? payload.orders_to_redact.map((id: any) => String(id))
      : [];
    const [syncDelete, adjustmentDelete] = orderIds.length
      ? await db.$transaction([
          db.syncLog.deleteMany({ where: { userId, shopifyOrderId: { in: orderIds } } }),
          db.orderAdjustment.deleteMany({ where: { userId, shopifyOrderId: { in: orderIds } } }),
        ])
      : [{ count: 0 }, { count: 0 }];

    const requestId = `customers_redact:${deliveryId}`;
    await db.complianceRequest.upsert({
      where: { requestId },
      update: {},
      create: {
        userId,
        requestId,
        shopDomain,
        kind: "customers_redact",
        orderIds,
        status: "completed",
        completedAt: new Date(),
        response: {
          customerProfileDataStored: false,
          deletedSyncRecords: syncDelete.count,
          deletedAdjustmentRecords: adjustmentDelete.count,
        },
      },
    });
    return NextResponse.json({ received: true, redacted: true });
  }

  return NextResponse.json({ received: true, ignored: true });
}
