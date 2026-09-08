import { decrypt } from "./crypto";

const SHOPIFY_API_VERSION = "2026-07";

export async function fetchShopifyOrderForRetry(
  shopDomain: string,
  encryptedAccessToken: string,
  legacyOrderId: string
) {
  const response = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": decrypt(encryptedAccessToken),
    },
    body: JSON.stringify({
      query: `
        query SyncStockOrder($id: ID!) {
          order(id: $id) {
            legacyResourceId
            name
            totalTaxSet { shopMoney { amount } }
            lineItems(first: 250) {
              nodes {
                sku
                title
                quantity
                originalUnitPriceSet { shopMoney { amount } }
              }
            }
          }
        }
      `,
      variables: { id: `gid://shopify/Order/${legacyOrderId}` },
    }),
  });

  if (!response.ok) {
    throw new Error(`Shopify order fetch failed with ${response.status}`);
  }

  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((error: any) => error.message).join("; "));
  }

  const order = json?.data?.order;
  if (!order) throw new Error("Shopify order was not found");

  return {
    id: String(order.legacyResourceId),
    name: order.name,
    total_tax: order.totalTaxSet?.shopMoney?.amount ?? "0",
    line_items: (order.lineItems?.nodes ?? []).map((item: any) => ({
      sku: item.sku ?? "",
      title: item.title,
      quantity: item.quantity,
      price: item.originalUnitPriceSet?.shopMoney?.amount ?? "0",
    })),
  };
}
