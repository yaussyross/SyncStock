import { db } from "./db";
import { getQboClientForUser, createSalesReceipt, findSalesReceiptByDocNumber } from "./qbo";

interface ShopifyOrder {
  id: number | string;
  name: string;
  line_items: {
    variant_id?: number | string | null;
    sku?: string | null;
    title: string;
    quantity: number;
    price: string;
  }[];
  total_tax: string;
}

function quickBooksDocNumber(orderId: string | number) {
  return `SS-${String(orderId)}`.slice(0, 21);
}

/** Runs one order sync end-to-end with retry-safe QuickBooks creation. */
export async function processOrderSync(userId: string, order: ShopifyOrder) {
  const shopifyOrderId = String(order.id);
  const log = await db.syncLog.findUnique({
    where: { userId_shopifyOrderId: { userId, shopifyOrderId } },
  });

  // A duplicate BullMQ job must never recreate an already-synced receipt.
  if (log?.status === "success" && log.qboInvoiceId) return;

  const mappings = await db.productMapping.findMany({ where: { userId } });
  const mappingByVariantId = new Map(
    mappings
      .filter((mapping) => !mapping.shopifyVariantId.startsWith("legacy:"))
      .map((mapping) => [mapping.shopifyVariantId, mapping.qboItemId] as const)
  );
  const legacyMappingBySku = new Map(
    mappings
      .filter((mapping) => mapping.shopifySku)
      .map((mapping) => [mapping.shopifySku!, mapping.qboItemId] as const)
  );

  const unmapped: string[] = [];
  const lineItems = order.line_items.map((li) => {
    const variantId = li.variant_id == null ? null : String(li.variant_id);
    const sku = li.sku?.trim() || null;
    const qboItemId =
      (variantId ? mappingByVariantId.get(variantId) : undefined) ||
      (sku ? legacyMappingBySku.get(sku) : undefined);

    if (!qboItemId) {
      unmapped.push(sku ? `${li.title} (${sku})` : `${li.title} (no SKU)`);
    }

    return {
      qboItemId: qboItemId!,
      quantity: li.quantity,
      unitPrice: parseFloat(li.price),
      description: li.title,
    };
  });

  if (unmapped.length > 0) {
    await db.syncLog.update({
      where: { userId_shopifyOrderId: { userId, shopifyOrderId } },
      data: {
        status: "skipped_no_mapping",
        errorMessage: `Map these Shopify variants before retrying: ${unmapped.join(", ")}.`,
      },
    });
    return;
  }

  try {
    const qbo = await getQboClientForUser(userId);
    const docNumber = quickBooksDocNumber(order.id);

    // If QBO accepted the receipt but our DB write failed, BullMQ will retry.
    // Re-querying the stable DocNumber turns that retry into a recovery instead
    // of a second financial transaction.
    let receipt = await findSalesReceiptByDocNumber(qbo, docNumber);
    if (!receipt) {
      receipt = await createSalesReceipt(qbo, docNumber, lineItems, parseFloat(order.total_tax || "0"));
    }

    await db.syncLog.update({
      where: { userId_shopifyOrderId: { userId, shopifyOrderId } },
      data: { status: "success", qboInvoiceId: String(receipt.Id), errorMessage: null },
    });

    await db.user.update({ where: { id: userId }, data: { orderQuotaUsed: { increment: 1 } } });
  } catch (err: any) {
    const message = err?.Fault?.Error?.[0]?.Message || err?.message || "Unknown QBO API error";

    await db.syncLog.update({
      where: { userId_shopifyOrderId: { userId, shopifyOrderId } },
      data: { status: "failed", errorMessage: message, attempts: { increment: 1 } },
    });

    throw err;
  }
}
