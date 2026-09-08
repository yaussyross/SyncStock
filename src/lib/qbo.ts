import OAuthClient from "intuit-oauth";
import QuickBooks from "node-quickbooks";
import { db } from "./db";
import { encrypt, decrypt } from "./crypto";

export interface QboCatalogItem {
  id: string;
  name: string;
  sku: string | null;
  type: string | null;
}

export interface ReceiptAdjustmentLine {
  qboItemId: string;
  amount: number;
  description: string;
}

export interface SalesReceiptOptions {
  adjustmentLines?: ReceiptAdjustmentLine[];
  discountAmount?: number;
  taxesIncluded?: boolean;
}

export async function getQboClientForUser(userId: string): Promise<QuickBooks> {
  const conn = await db.qboConnection.findUniqueOrThrow({ where: { userId } });

  let accessToken = decrypt(conn.accessToken);
  let refreshToken = decrypt(conn.refreshToken);
  const expiringSoon = conn.tokenExpiry.getTime() - Date.now() < 5 * 60 * 1000;

  if (expiringSoon) {
    const oauthClient = new OAuthClient({
      clientId: process.env.QBO_CLIENT_ID!,
      clientSecret: process.env.QBO_CLIENT_SECRET!,
      environment: process.env.QBO_ENVIRONMENT as "sandbox" | "production",
      redirectUri: `${process.env.APP_URL}/api/auth/qbo/callback`,
    });
    oauthClient.setToken({ refresh_token: refreshToken } as any);

    const refreshed = await oauthClient.refresh();
    const newToken = refreshed.getJson();

    await db.qboConnection.update({
      where: { userId },
      data: {
        accessToken: encrypt(newToken.access_token),
        refreshToken: encrypt(newToken.refresh_token),
        tokenExpiry: new Date(Date.now() + newToken.expires_in * 1000),
      },
    });

    accessToken = newToken.access_token;
    refreshToken = newToken.refresh_token;
  }

  return new QuickBooks(
    process.env.QBO_CLIENT_ID!,
    process.env.QBO_CLIENT_SECRET!,
    accessToken,
    false,
    conn.realmId,
    process.env.QBO_ENVIRONMENT === "sandbox",
    false,
    null,
    "2.0",
    refreshToken
  );
}

export function listQboItems(qbo: QuickBooks): Promise<QboCatalogItem[]> {
  return new Promise((resolve, reject) => {
    // node-quickbooks transparently pages in 1,000-row batches when fetchAll is true.
    qbo.findItems({ Active: true, asc: "Name", fetchAll: true }, (err: any, result: any) => {
      if (err) return reject(err);

      const raw = result?.QueryResponse?.Item ?? result?.Item ?? result ?? [];
      const items = (Array.isArray(raw) ? raw : raw?.Id ? [raw] : [])
        .filter((item: any) => item?.Active !== false && item?.Type !== "Category")
        .map((item: any) => ({
          id: String(item.Id),
          name: String(item.Name ?? item.FullyQualifiedName ?? `Item ${item.Id}`),
          sku: item.Sku ? String(item.Sku).trim() : null,
          type: item.Type ? String(item.Type) : null,
        }))
        .sort((a: QboCatalogItem, b: QboCatalogItem) => a.name.localeCompare(b.name));

      resolve(items);
    });
  });
}

export function findSalesReceiptByDocNumber(qbo: QuickBooks, docNumber: string): Promise<any | null> {
  return new Promise((resolve, reject) => {
    qbo.findSalesReceipts({ DocNumber: docNumber }, (err: any, result: any) => {
      if (err) return reject(err);
      const receipts = result?.QueryResponse?.SalesReceipt ?? result?.SalesReceipt ?? result;
      if (Array.isArray(receipts)) return resolve(receipts[0] ?? null);
      resolve(receipts?.Id ? receipts : null);
    });
  });
}

export function getSalesReceiptById(qbo: QuickBooks, id: string): Promise<any> {
  return new Promise((resolve, reject) => {
    qbo.getSalesReceipt(id, (err: any, receipt: any) => {
      if (err) reject(err);
      else resolve(receipt);
    });
  });
}

export function deleteSalesReceipt(qbo: QuickBooks, receiptOrId: any): Promise<any> {
  return new Promise((resolve, reject) => {
    qbo.deleteSalesReceipt(receiptOrId, (err: any, result: any) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

/** Creates a QuickBooks Sales Receipt with a stable SyncStock document number. */
export function createSalesReceipt(
  qbo: QuickBooks,
  docNumber: string,
  lineItems: { qboItemId: string; quantity: number; unitPrice: number; description: string }[],
  totalTax: number,
  options: SalesReceiptOptions = {}
): Promise<any> {
  const productLines = lineItems.map((item) => ({
    DetailType: "SalesItemLineDetail",
    Amount: item.quantity * item.unitPrice,
    Description: item.description,
    SalesItemLineDetail: {
      ItemRef: { value: item.qboItemId },
      Qty: item.quantity,
      UnitPrice: item.unitPrice,
    },
  }));

  const adjustmentLines = (options.adjustmentLines ?? [])
    .filter((item) => item.amount !== 0)
    .map((item) => ({
      DetailType: "SalesItemLineDetail",
      Amount: item.amount,
      Description: item.description,
      SalesItemLineDetail: {
        ItemRef: { value: item.qboItemId },
        Qty: 1,
        UnitPrice: item.amount,
      },
    }));

  const discountAmount = Math.max(0, options.discountAmount ?? 0);
  const discountLine = discountAmount > 0
    ? [{
        DetailType: "DiscountLineDetail",
        Amount: discountAmount,
        Description: "Shopify order discounts",
        DiscountLineDetail: { PercentBased: false },
      }]
    : [];

  const payload = {
    DocNumber: docNumber.slice(0, 21),
    PrivateNote: `Created by SyncStock (${docNumber})`,
    GlobalTaxCalculation: options.taxesIncluded ? "TaxIncluded" : "TaxExcluded",
    Line: [...productLines, ...adjustmentLines, ...discountLine],
    TxnTaxDetail: totalTax > 0 ? { TotalTax: totalTax } : undefined,
  };

  return new Promise((resolve, reject) => {
    qbo.createSalesReceipt(payload, (err: any, receipt: any) => {
      if (err) reject(err);
      else resolve(receipt);
    });
  });
}
