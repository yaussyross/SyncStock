import { decrypt } from "./crypto";

const SHOPIFY_API_VERSION = "2026-07";

interface ShopifyGraphqlResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function shopifyGraphql<T>(
  shopDomain: string,
  encryptedAccessToken: string,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": decrypt(encryptedAccessToken),
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Shopify Admin API request failed with ${response.status}`);
  }

  const json = (await response.json()) as ShopifyGraphqlResponse<T>;
  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join("; "));
  }
  if (!json.data) throw new Error("Shopify Admin API returned no data");
  return json.data;
}

export interface ShopifyCatalogVariant {
  id: string;
  legacyResourceId: string;
  title: string;
  sku: string | null;
  price: string;
  productId: string;
  productTitle: string;
  productStatus: string;
}

export interface ShopifyVariantPage {
  variants: ShopifyCatalogVariant[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
}

export async function fetchShopifyVariants(
  shopDomain: string,
  encryptedAccessToken: string,
  after?: string | null
): Promise<ShopifyVariantPage> {
  const data = await shopifyGraphql<{
    productVariants: {
      nodes: Array<{
        id: string;
        legacyResourceId: string;
        title: string;
        sku: string | null;
        price: string;
        product: { id: string; title: string; status: string };
      }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  }>(
    shopDomain,
    encryptedAccessToken,
    `
      query SyncStockVariants($after: String) {
        productVariants(first: 100, after: $after, sortKey: TITLE) {
          nodes {
            id
            legacyResourceId
            title
            sku
            price
            product { id title status }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `,
    { after: after || null }
  );

  return {
    variants: data.productVariants.nodes
      .filter((variant) => variant.product?.status !== "ARCHIVED")
      .map((variant) => ({
        id: variant.id,
        legacyResourceId: String(variant.legacyResourceId),
        title: variant.title,
        sku: variant.sku?.trim() || null,
        price: variant.price,
        productId: variant.product.id,
        productTitle: variant.product.title,
        productStatus: variant.product.status,
      })),
    pageInfo: data.productVariants.pageInfo,
  };
}

export async function fetchShopifyOrderForRetry(
  shopDomain: string,
  encryptedAccessToken: string,
  legacyOrderId: string
) {
  const data = await shopifyGraphql<{
    order: null | {
      legacyResourceId: string;
      name: string;
      currencyCode?: string;
      totalPriceSet?: { shopMoney?: { amount?: string } };
      totalTaxSet?: { shopMoney?: { amount?: string } };
      totalDiscountsSet?: { shopMoney?: { amount?: string } };
      totalShippingPriceSet?: { shopMoney?: { amount?: string } };
      totalTipReceivedSet?: { shopMoney?: { amount?: string } };
      currentTotalDutiesSet?: { shopMoney?: { amount?: string } } | null;
      currentTotalAdditionalFeesSet?: { shopMoney?: { amount?: string } } | null;
      lineItems?: {
        nodes?: Array<{
          sku?: string | null;
          title: string;
          quantity: number;
          variant?: { legacyResourceId?: string | null } | null;
          originalUnitPriceSet?: { shopMoney?: { amount?: string } };
        }>;
      };
    };
  }>(
    shopDomain,
    encryptedAccessToken,
    `
      query SyncStockOrder($id: ID!) {
        order(id: $id) {
          legacyResourceId
          name
          currencyCode
          totalPriceSet { shopMoney { amount } }
          totalTaxSet { shopMoney { amount } }
          totalDiscountsSet { shopMoney { amount } }
          totalShippingPriceSet { shopMoney { amount } }
          totalTipReceivedSet { shopMoney { amount } }
          currentTotalDutiesSet { shopMoney { amount } }
          currentTotalAdditionalFeesSet { shopMoney { amount } }
          lineItems(first: 250) {
            nodes {
              sku
              title
              quantity
              variant { legacyResourceId }
              originalUnitPriceSet { shopMoney { amount } }
            }
          }
        }
      }
    `,
    { id: `gid://shopify/Order/${legacyOrderId}` }
  );

  const order = data.order;
  if (!order) throw new Error("Shopify order was not found");

  const moneySet = (value?: { shopMoney?: { amount?: string } } | null) => value?.shopMoney?.amount ?? "0";

  return {
    id: String(order.legacyResourceId),
    name: order.name,
    currency: order.currencyCode ?? null,
    total_price: moneySet(order.totalPriceSet),
    total_tax: moneySet(order.totalTaxSet),
    total_discounts: moneySet(order.totalDiscountsSet),
    total_shipping_price_set: { shop_money: { amount: moneySet(order.totalShippingPriceSet) } },
    total_tip_received: moneySet(order.totalTipReceivedSet),
    current_total_duties_set: order.currentTotalDutiesSet
      ? { shop_money: { amount: moneySet(order.currentTotalDutiesSet) } }
      : null,
    current_total_additional_fees_set: order.currentTotalAdditionalFeesSet
      ? { shop_money: { amount: moneySet(order.currentTotalAdditionalFeesSet) } }
      : null,
    line_items: (order.lineItems?.nodes ?? []).map((item) => ({
      variant_id: item.variant?.legacyResourceId ? String(item.variant.legacyResourceId) : null,
      sku: item.sku?.trim() ?? "",
      title: item.title,
      quantity: item.quantity,
      price: item.originalUnitPriceSet?.shopMoney?.amount ?? "0",
    })),
  };
}
