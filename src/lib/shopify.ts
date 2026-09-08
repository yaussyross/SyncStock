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
      totalTaxSet?: { shopMoney?: { amount?: string } };
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
          totalTaxSet { shopMoney { amount } }
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

  return {
    id: String(order.legacyResourceId),
    name: order.name,
    total_tax: order.totalTaxSet?.shopMoney?.amount ?? "0",
    line_items: (order.lineItems?.nodes ?? []).map((item) => ({
      variant_id: item.variant?.legacyResourceId ? String(item.variant.legacyResourceId) : null,
      sku: item.sku?.trim() ?? "",
      title: item.title,
      quantity: item.quantity,
      price: item.originalUnitPriceSet?.shopMoney?.amount ?? "0",
    })),
  };
}
