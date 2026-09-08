import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function validHmac(rawBody: string, provided: string | null) {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret || !provided) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest();
  let received: Buffer;
  try {
    received = Buffer.from(provided, "base64");
  } catch {
    return false;
  }
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const topic = req.headers.get("x-shopify-topic");
  const deliveryId = req.headers.get("x-shopify-webhook-id") || crypto.randomUUID();
  const shopDomain = req.headers.get("x-shopify-shop-domain");

  if (!validHmac(rawBody, req.headers.get("x-shopify-hmac-sha256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  if (!topic || !shopDomain) return NextResponse.json({ error: "Missing Shopify metadata" }, { status: 400 });

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const connection = await db.shopifyConnection.findUnique({ where: { shopDomain } });
  const tombstone = connection ? null : await db.shopTombstone.findUnique({ where: { shopDomain } });
  const userId = connection?.userId ?? tombstone?.userId ?? null;

  if (topic === "shop/redact") {
    if (userId) {
      await db.$transaction([
        db.productMapping.deleteMany({ where: { userId } }),
        db.syncLog.deleteMany({ where: { userId } }),
        db.orderAdjustment.deleteMany({ where: { userId } }),
        db.complianceRequest.deleteMany({ where: { userId } }),
        db.shopifyConnection.deleteMany({ where: { userId } }),
        db.shopTombstone.deleteMany({ where: { shopDomain } }),
        db.webhookDelivery.deleteMany({ where: { shopDomain } }),
      ]);
    }
    return NextResponse.json({ received: true, redacted: true });
  }

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
