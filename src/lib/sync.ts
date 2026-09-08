import { db } from "./db";
import { getQboClientForUser, createSalesReceipt, findSalesReceiptByDocNumber } from "./qbo";

interface ShopifyOrder {
  id: number | string;
  name: string;
  line_items: { sku: string; title: string; quantity: number; price: string }[];
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

  const mappings: { shopifySku: string; qboItemId: string }[] =
    await db.productMapping.findMany({ where: { userId } });
  const mappingBySku = new Map<string, string>(
    mappings.map((m): [string, string] => [m.shopifySku, m.qboItemId])
  );

  const unmapped: string[] = [];
  const lineItems = order.line_items.map((li) => {
    const qboItemId = mappingBySku.get(li.sku);
    if (!qboItemId) unmapped.push(li.sku || li.title);
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
        errorMessage: `No QBO item mapped for SKU(s): ${unmapped.join(", ")}. Add a mapping and retry.`,
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
