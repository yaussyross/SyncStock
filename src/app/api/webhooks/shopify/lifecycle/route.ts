import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

function verifyShopifyHmac(rawBody: string, providedHmac: string | null) {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret || !providedHmac) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest();
  let received: Buffer;
  try {
    received = Buffer.from(providedHmac, "base64");
  } catch {
    return false;
  }
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function refundAmount(payload: any) {
  const successful = Array.isArray(payload?.transactions)
    ? payload.transactions.filter((txn: any) => txn?.status === "success" && txn?.kind === "refund")
    : [];
  if (!successful.length) return null;
  const total = successful.reduce((sum: number, txn: any) => sum + Number(txn.amount || 0), 0);
  return Number.isFinite(total) ? total.toFixed(2) : null;
}

function refundDetails(payload: any) {
  return {
    refundId: payload?.id ? String(payload.id) : null,
    note: payload?.note ? String(payload.note).slice(0, 500) : null,
    createdAt: payload?.created_at ?? null,
    transactions: Array.isArray(payload?.transactions)
      ? payload.transactions.map((txn: any) => ({
          id: txn?.id ? String(txn.id) : null,
          kind: txn?.kind ?? null,
          status: txn?.status ?? null,
          amount: txn?.amount ?? null,
          currency: txn?.currency ?? null,
          gateway: txn?.gateway ?? null,
        }))
      : [],
    lineItems: Array.isArray(payload?.refund_line_items)
      ? payload.refund_line_items.map((item: any) => ({
          lineItemId: item?.line_item_id ? String(item.line_item_id) : null,
          quantity: item?.quantity ?? null,
          subtotal: item?.subtotal ?? null,
          totalTax: item?.total_tax ?? null,
          restockType: item?.restock_type ?? null,
        }))
      : [],
  };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hmac = req.headers.get("x-shopify-hmac-sha256");
  const shopDomain = req.headers.get("x-shopify-shop-domain");
  const deliveryId = req.headers.get("x-shopify-webhook-id");
  const eventId = req.headers.get("x-shopify-event-id");
  const topic = req.headers.get("x-shopify-topic");

  if (!verifyShopifyHmac(rawBody, hmac)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  if (!shopDomain || !deliveryId || !topic) {
    return NextResponse.json({ error: "Missing Shopify delivery metadata" }, { status: 400 });
  }

  let delivery = await db.webhookDelivery.findUnique({ where: { deliveryId } });
  if (!delivery) {
    try {
      delivery = await db.webhookDelivery.create({
        data: { deliveryId, eventId, shopDomain, topic, status: "received" },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      delivery = await db.webhookDelivery.findUniqueOrThrow({ where: { deliveryId } });
    }
  }
  if (delivery.status === "ignored" || delivery.status === "queued") {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const connection = await db.shopifyConnection.findUnique({ where: { shopDomain } });
  if (!connection) {
    await db.webhookDelivery.update({
      where: { deliveryId },
      data: { status: "ignored", processedAt: new Date(), error: "Store is no longer connected" },
    });
    return NextResponse.json({ received: true });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    await db.webhookDelivery.update({
      where: { deliveryId },
      data: { status: "failed", processedAt: new Date(), error: "Invalid JSON payload" },
    });
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (topic === "app/uninstalled") {
    await db.$transaction([
      db.shopTombstone.upsert({
        where: { shopDomain },
        update: { userId: connection.userId, uninstalledAt: new Date() },
        create: { shopDomain, userId: connection.userId },
      }),
      db.productMapping.deleteMany({ where: { userId: connection.userId } }),
      db.shopifyConnection.delete({ where: { id: connection.id } }),
      db.webhookDelivery.update({
        where: { deliveryId },
        data: { status: "ignored", processedAt: new Date(), error: "Shopify app uninstalled; access token and mappings removed" },
      }),
    ]);
    return NextResponse.json({ received: true, disconnected: true });
  }

  const stableEventId = eventId || deliveryId;
  if (topic === "refunds/create") {
    const orderId = payload?.order_id ? String(payload.order_id) : "unknown";
    const currency = payload?.transactions?.find((txn: any) => txn?.currency)?.currency ?? null;
    await db.orderAdjustment.upsert({
      where: {
        userId_shopifyEventId_kind: {
          userId: connection.userId,
          shopifyEventId: stableEventId,
          kind: "refund",
        },
      },
      update: {},
      create: {
        userId: connection.userId,
        shopifyOrderId: orderId,
        shopifyEventId: stableEventId,
        kind: "refund",
        status: "needs_review",
        amount: refundAmount(payload),
        currency,
        details: refundDetails(payload),
      },
    });
  } else if (topic === "orders/cancelled") {
    await db.orderAdjustment.upsert({
      where: {
        userId_shopifyEventId_kind: {
          userId: connection.userId,
          shopifyEventId: stableEventId,
          kind: "cancellation",
        },
      },
      update: {},
      create: {
        userId: connection.userId,
        shopifyOrderId: String(payload?.id ?? "unknown"),
        orderNumber: payload?.name ?? null,
        shopifyEventId: stableEventId,
        kind: "cancellation",
        status: "needs_review",
        amount: payload?.total_price ? String(payload.total_price) : null,
        currency: payload?.currency ?? null,
        details: {
          cancelReason: payload?.cancel_reason ?? null,
          cancelledAt: payload?.cancelled_at ?? null,
          financialStatus: payload?.financial_status ?? null,
        },
      },
    });
  } else {
    await db.webhookDelivery.update({
      where: { deliveryId },
      data: { status: "ignored", processedAt: new Date(), error: `Unexpected lifecycle topic: ${topic}` },
    });
    return NextResponse.json({ received: true, ignored: true });
  }

  await db.webhookDelivery.update({
    where: { deliveryId },
    data: { status: "ignored", processedAt: new Date(), error: null },
  });
  return NextResponse.json({ received: true, reviewRequired: true });
}
