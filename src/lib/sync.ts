import { getQuotaState } from "./quota";
import { db } from "./db";
import {
  getQboClientForUser,
  createSalesReceipt,
  deleteSalesReceipt,
  findSalesReceiptByDocNumber,
  getSalesReceiptById,
  ReceiptAdjustmentLine,
} from "./qbo";
import { compareMoneyTotals, reconcileShopifyOrder, ShopifyOrderForReconciliation } from "./reconciliation";

interface ShopifyOrder extends ShopifyOrderForReconciliation {
  id: number | string;
  name: string;
  line_items: {
    variant_id?: number | string | null;
    sku?: string | null;
    title: string;
    quantity: number;
    price: string;
  }[];
}

function quickBooksDocNumber(orderId: string | number) {
  return `SS-${String(orderId)}`.slice(0, 21);
}

async function receiptWithTotal(qbo: any, receipt: any) {
  let hydrated = receipt;
  if (hydrated?.TotalAmt == null && hydrated?.Id) {
    hydrated = await getSalesReceiptById(qbo, String(hydrated.Id));
  }

  if (hydrated?.TotalAmt == null) {
    throw new Error("QuickBooks Sales Receipt did not return TotalAmt for reconciliation");
  }

  return {
    receipt: hydrated,
    total: String(hydrated.TotalAmt),
  };
}

function qboErrorMessage(error: any) {
  return error?.Fault?.Error?.[0]?.Message || error?.message || "Unknown QBO API error";
}

function positiveAmount(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** Runs one order sync end-to-end with mapping, reconciliation, and retry-safe QBO creation. */
export async function processOrderSync(userId: string, order: ShopifyOrder) {
  const shopifyOrderId = String(order.id);
  const log = await db.syncLog.findUnique({
    where: { userId_shopifyOrderId: { userId, shopifyOrderId } },
  });

  // A duplicate BullMQ job must never recreate an already-synced receipt.
  if (log?.status === "success" && log.qboInvoiceId) return;

  // Jobs can wait past cancellation or period expiry. Recheck at execution time.
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !getQuotaState(user).allowed) {
    if (log) await db.syncLog.update({ where: { id: log.id }, data: {
      status: "skipped_quota_exceeded", errorMessage: "Sync paused: subscription or order allowance is unavailable.",
    } });
    return;
  }

  const [mappings, accountingSettings] = await Promise.all([
    db.productMapping.findMany({ where: { userId } }),
    db.accountingSettings.findUnique({ where: { userId } }),
  ]);

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

  const reconciliationOptions = {
    includeShipping: Boolean(accountingSettings?.shippingQboItemId),
    // QuickBooks supports a native transaction-level discount line, so discounts
    // do not require a merchant-selected accounting item.
    includeDiscounts: true,
    includeDuties: Boolean(accountingSettings?.dutiesQboItemId),
    includeAdditionalFees: Boolean(accountingSettings?.additionalFeeQboItemId),
    includeTips: Boolean(accountingSettings?.tipsQboItemId),
  };

  let preflight;
  try {
    preflight = reconcileShopifyOrder(order, reconciliationOptions);
  } catch (error: any) {
    await db.syncLog.update({
      where: { userId_shopifyOrderId: { userId, shopifyOrderId } },
      data: {
        status: "blocked_reconciliation",
        currency: order.currency?.trim() || null,
        errorMessage: `Reconciliation blocked before QuickBooks creation: ${error?.message || "Shopify totals could not be validated"}.`,
      },
    });
    return;
  }

  await db.syncLog.update({
    where: { userId_shopifyOrderId: { userId, shopifyOrderId } },
    data: {
      currency: preflight.currency === "shop currency" ? null : preflight.currency,
      shopifyTotal: preflight.expectedTotal,
      qboDraftTotal: preflight.actualTotal,
      qboActualTotal: null,
      reconciliationDifference: preflight.difference,
    },
  });

  if (!preflight.matches) {
    await db.syncLog.update({
      where: { userId_shopifyOrderId: { userId, shopifyOrderId } },
      data: {
        status: "blocked_reconciliation",
        qboInvoiceId: null,
        errorMessage: preflight.message,
      },
    });
    return;
  }

  const adjustmentLines: ReceiptAdjustmentLine[] = [];
  const addAdjustment = (qboItemId: string | null | undefined, amount: string, description: string) => {
    const numericAmount = positiveAmount(amount);
    if (qboItemId && numericAmount > 0) {
      adjustmentLines.push({ qboItemId, amount: numericAmount, description });
    }
  };

  addAdjustment(accountingSettings?.shippingQboItemId, preflight.adjustments.shipping, "Shopify shipping");
  addAdjustment(accountingSettings?.dutiesQboItemId, preflight.adjustments.duties, "Shopify duties");
  addAdjustment(accountingSettings?.additionalFeeQboItemId, preflight.adjustments.additionalFees, "Shopify additional fees");
  addAdjustment(accountingSettings?.tipsQboItemId, preflight.adjustments.tips, "Shopify tips");

  try {
    const qbo = await getQboClientForUser(userId);
    const docNumber = quickBooksDocNumber(order.id);
    let receipt = await findSalesReceiptByDocNumber(qbo, docNumber);

    if (receipt) {
      // Recovery path: never delete a receipt that existed before this attempt.
      const verified = await receiptWithTotal(qbo, receipt);
      const comparison = compareMoneyTotals(preflight.expectedTotal, verified.total);

      if (!comparison.matches) {
        await db.syncLog.update({
          where: { userId_shopifyOrderId: { userId, shopifyOrderId } },
          data: {
            status: "reconciliation_failed_qbo",
            qboInvoiceId: String(verified.receipt.Id),
            qboActualTotal: comparison.actualTotal,
            reconciliationDifference: comparison.difference,
            errorMessage: `QuickBooks already contains ${docNumber} with total ${comparison.actualTotal}, but Shopify total is ${comparison.expectedTotal}. SyncStock did not modify or delete the existing QuickBooks transaction. Manual review is required.`,
          },
        });
        return;
      }

      receipt = verified.receipt;
      await db.syncLog.update({
        where: { userId_shopifyOrderId: { userId, shopifyOrderId } },
        data: {
          qboActualTotal: comparison.actualTotal,
          reconciliationDifference: comparison.difference,
        },
      });
    } else {
      const created = await createSalesReceipt(
        qbo,
        docNumber,
        lineItems,
        parseFloat(order.current_total_tax ?? order.total_tax ?? "0"),
        {
          adjustmentLines,
          discountAmount: positiveAmount(preflight.adjustments.discounts),
          taxesIncluded: preflight.taxesIncluded,
        }
      );
      const verified = await receiptWithTotal(qbo, created);
      const comparison = compareMoneyTotals(preflight.expectedTotal, verified.total);

      if (!comparison.matches) {
        const createdId = verified.receipt?.Id ? String(verified.receipt.Id) : null;

        try {
          // This receipt was created by the current attempt and has already failed
          // reconciliation, so remove it immediately instead of leaving bad books.
          await deleteSalesReceipt(qbo, verified.receipt);
          await db.syncLog.update({
            where: { userId_shopifyOrderId: { userId, shopifyOrderId } },
            data: {
              status: "blocked_reconciliation",
              qboInvoiceId: null,
              qboActualTotal: comparison.actualTotal,
              reconciliationDifference: comparison.difference,
              errorMessage: `QuickBooks recalculated ${docNumber} to ${comparison.actualTotal}, but Shopify total is ${comparison.expectedTotal}. SyncStock rolled back the newly created QuickBooks Sales Receipt and stopped the sync.`,
            },
          });
        } catch (rollbackError: any) {
          await db.syncLog.update({
            where: { userId_shopifyOrderId: { userId, shopifyOrderId } },
            data: {
              status: "reconciliation_failed_qbo",
              qboInvoiceId: createdId,
              qboActualTotal: comparison.actualTotal,
              reconciliationDifference: comparison.difference,
              errorMessage: `QuickBooks recalculated ${docNumber} to ${comparison.actualTotal}, but Shopify total is ${comparison.expectedTotal}. Automatic rollback failed: ${qboErrorMessage(rollbackError)}. Do not retry until the QuickBooks transaction is reviewed.`,
            },
          });
        }

        return;
      }

      receipt = verified.receipt;
      await db.syncLog.update({
        where: { userId_shopifyOrderId: { userId, shopifyOrderId } },
        data: {
          qboActualTotal: comparison.actualTotal,
          reconciliationDifference: comparison.difference,
        },
      });
    }

    await db.syncLog.update({
      where: { userId_shopifyOrderId: { userId, shopifyOrderId } },
      data: {
        status: "success",
        qboInvoiceId: String(receipt.Id),
        errorMessage: null,
      },
    });

    await db.user.update({ where: { id: userId }, data: { orderQuotaUsed: { increment: 1 } } });
  } catch (err: any) {
    const message = qboErrorMessage(err);

    await db.syncLog.update({
      where: { userId_shopifyOrderId: { userId, shopifyOrderId } },
      data: { status: "failed", errorMessage: message, attempts: { increment: 1 } },
    });

    throw err;
  }
}
