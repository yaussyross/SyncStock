import { verifyShopifyWebhook } from "@/lib/shopify-signatures";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { syncQueue } from "@/lib/queue";
import { getQuotaState } from "@/lib/quota";


function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function quotaMessage(reason: ReturnType<typeof getQuotaState>["reason"]) {
  if (reason === "subscription_inactive") return "Your SyncStock subscription is not active. Update billing before retrying.";
  if (reason === "billing_period_expired") return "Sync is paused until the next paid billing period is confirmed.";
  return "Your SyncStock order quota for this billing period has been reached.";
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  const shopDomain = req.headers.get("x-shopify-shop-domain");
  const deliveryId = req.headers.get("x-shopify-webhook-id");
  const eventId = req.headers.get("x-shopify-event-id");
  const topic = req.headers.get("x-shopify-topic");

  if (!await verifyShopifyWebhook(rawBody, hmacHeader)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (!shopDomain || !shopDomain.endsWith(".myshopify.com") || !deliveryId) {
    return NextResponse.json({ error: "Missing Shopify delivery metadata" }, { status: 400 });
  }

  if (topic && topic !== "orders/paid") {
    return NextResponse.json({ received: true, ignored: "unexpected_topic" });
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

  if (delivery.status === "queued" || delivery.status === "ignored") {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const connection = await db.shopifyConnection.findUnique({ where: { shopDomain } });
  if (!connection) {
    await db.webhookDelivery.update({
      where: { deliveryId },
      data: { status: "ignored", processedAt: new Date(), error: "Shopify store is not connected" },
    });
    return NextResponse.json({ received: true });
  }

  let order: any;
  try {
    order = JSON.parse(rawBody);
  } catch {
    await db.webhookDelivery.update({
      where: { deliveryId },
      data: { status: "failed", processedAt: new Date(), error: "Invalid JSON payload" },
    });
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!order?.id) {
    await db.webhookDelivery.update({
      where: { deliveryId },
      data: { status: "failed", processedAt: new Date(), error: "Order payload is missing id" },
    });
    return NextResponse.json({ error: "Invalid order payload" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: connection.userId } });
  if (!user) {
    await db.webhookDelivery.update({
      where: { deliveryId },
      data: { status: "ignored", processedAt: new Date(), error: "Connected user no longer exists" },
    });
    return NextResponse.json({ received: true });
  }

  const existingLog = await db.syncLog.findUnique({
    where: { userId_shopifyOrderId: { userId: user.id, shopifyOrderId: String(order.id) } },
  });

  if (existingLog && existingLog.status !== "queue_failed") {
    await db.webhookDelivery.update({
      where: { deliveryId },
      data: { status: "ignored", processedAt: new Date() },
    });
    return NextResponse.json({ received: true, duplicate: true, orderStatus: existingLog.status });
  }


  const quota = getQuotaState(user);
  if (!quota.allowed) {
    const message = quotaMessage(quota.reason);
    await db.syncLog.upsert({
      where: { userId_shopifyOrderId: { userId: user.id, shopifyOrderId: String(order.id) } },
      update: { status: "skipped_quota_exceeded", errorMessage: message },
      create: {
        userId: user.id,
        shopifyOrderId: String(order.id),
        orderNumber: order.name,
        status: "skipped_quota_exceeded",
        errorMessage: message,
      },
    });
    await db.webhookDelivery.update({
      where: { deliveryId },
      data: { status: "ignored", processedAt: new Date(), error: message },
    });
    return NextResponse.json({ received: true, skipped: quota.reason });
  }


  if (existingLog) {
    await db.syncLog.update({
      where: { id: existingLog.id },
      data: { status: "pending", errorMessage: null, orderNumber: order.name },
    });
  } else {
    try {
      await db.syncLog.create({
        data: {
          userId: user.id,
          shopifyOrderId: String(order.id),
          orderNumber: order.name,
          status: "pending",
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      await db.webhookDelivery.update({
        where: { deliveryId },
        data: { status: "ignored", processedAt: new Date() },
      });
      return NextResponse.json({ received: true, duplicate: true });
    }
  }

  try {
    const queuedLog = await db.syncLog.findUniqueOrThrow({
      where: { userId_shopifyOrderId: { userId: user.id, shopifyOrderId: String(order.id) } },
      select: { id: true },
    });
    await syncQueue.add(
      "sync-order",
      { userId: user.id, syncLogId: queuedLog.id },
      { jobId: `sync-${queuedLog.id}` }
    );

    await db.webhookDelivery.update({
      where: { deliveryId },
      data: { status: "queued", processedAt: new Date(), error: null },
    });

    return NextResponse.json({ received: true, queued: true });
  } catch (error: any) {
    const message = error?.message || "Could not enqueue order sync";
    await Promise.all([
      db.syncLog.update({
        where: { userId_shopifyOrderId: { userId: user.id, shopifyOrderId: String(order.id) } },
        data: { status: "queue_failed", errorMessage: message },
      }),
      db.webhookDelivery.update({ where: { deliveryId }, data: { status: "received", error: message } }),
    ]);

    return NextResponse.json({ error: "Temporary queue failure" }, { status: 503 });
  }
}
