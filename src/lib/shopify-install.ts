import crypto from "crypto";
import { db } from "./db";
import { encrypt } from "./crypto";
import { shopDomainFromIdToken } from "./shopify-id-token";

const SHOPIFY_API_VERSION = "2026-07";

type DesiredWebhook = {
  topic: "ORDERS_PAID" | "REFUNDS_CREATE" | "ORDERS_CANCELLED" | "APP_UNINSTALLED";
  uri: string;
  field: "webhookId" | "refundWebhookId" | "cancelledWebhookId" | "uninstallWebhookId";
};

function shopifyErrorMessage(payload: any, status: number) {
  const errors = payload?.errors;
  if (Array.isArray(errors)) {
    const messages = errors
      .map((error: any) => typeof error === "string" ? error : error?.message)
      .filter(Boolean);
    if (messages.length) return messages.join("; ");
  }
  if (typeof errors === "string" && errors.trim()) return errors.trim();
  if (errors && typeof errors === "object") {
    const messages = Object.entries(errors).flatMap(([field, value]) => {
      if (Array.isArray(value)) return value.map((item) => `${field}: ${String(item)}`);
      if (value != null) return [`${field}: ${String(value)}`];
      return [];
    });
    if (messages.length) return messages.join("; ");
  }
  if (typeof payload?.error === "string" && payload.error.trim()) return payload.error.trim();
  return `Shopify returned ${status}`;
}

async function graphql(shop: string, token: string, query: string, variables: Record<string, unknown> = {}) {
  const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as any;
  const hasErrors = Array.isArray(payload?.errors)
    ? payload.errors.length > 0
    : Boolean(payload?.errors);
  if (!response.ok || hasErrors) {
    throw new Error(shopifyErrorMessage(payload, response.status));
  }
  return payload?.data;
}

async function exchangeIdToken(shop: string, idToken: string) {
  const clientId = process.env.SHOPIFY_API_KEY;
  const clientSecret = process.env.SHOPIFY_API_SECRET;
  if (!clientId || !clientSecret) throw new Error("Shopify app credentials are not configured");

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: idToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
    }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null) as null | { access_token?: string; scope?: string; errors?: unknown; error?: string };
  if (!response.ok || !payload?.access_token) {
    const message = shopifyErrorMessage(payload, response.status);
    throw new Error(response.status === 400 && message === `Shopify returned ${response.status}` ? "Shopify ID token is no longer valid" : message);
  }
  return { accessToken: payload.access_token, scope: payload.scope ?? "" };
}

async function ensureWebhooks(shop: string, accessToken: string) {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL is not configured");

  const desired: DesiredWebhook[] = [
    { topic: "ORDERS_PAID", uri: `${appUrl}/api/webhooks/shopify/orders`, field: "webhookId" },
    { topic: "REFUNDS_CREATE", uri: `${appUrl}/api/webhooks/shopify/lifecycle`, field: "refundWebhookId" },
    { topic: "ORDERS_CANCELLED", uri: `${appUrl}/api/webhooks/shopify/lifecycle`, field: "cancelledWebhookId" },
    { topic: "APP_UNINSTALLED", uri: `${appUrl}/api/webhooks/shopify/lifecycle`, field: "uninstallWebhookId" },
  ];

  const list = await graphql(
    shop,
    accessToken,
    `query SyncStockWebhooks($topics: [WebhookSubscriptionTopic!]) {
      webhookSubscriptions(first: 100, topics: $topics) { nodes { id topic uri } }
    }`,
    { topics: desired.map((item) => item.topic) }
  );
  const existing: Array<{ id: string; topic: string; uri: string }> = list?.webhookSubscriptions?.nodes ?? [];
  const ids: Partial<Record<DesiredWebhook["field"], string>> = {};

  for (const item of desired) {
    const current = existing.find((node) => node.topic === item.topic && node.uri === item.uri);
    if (current) {
      ids[item.field] = current.id;
      continue;
    }

    const data = await graphql(
      shop,
      accessToken,
      `mutation SyncStockWebhookCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
          webhookSubscription { id topic uri }
          userErrors { field message }
        }
      }`,
      { topic: item.topic, webhookSubscription: { uri: item.uri, format: "JSON" } }
    );
    const result = data?.webhookSubscriptionCreate;
    if (result?.userErrors?.length) throw new Error(result.userErrors.map((error: any) => error.message).join("; "));
    if (!result?.webhookSubscription?.id) throw new Error(`Shopify did not create ${item.topic} webhook`);
    ids[item.field] = result.webhookSubscription.id;
  }

  return ids;
}

function syntheticShopEmail(shop: string) {
  const key = crypto.createHash("sha256").update(shop).digest("hex").slice(0, 24);
  return `shopify-${key}@shops.syncstock.invalid`;
}

export async function bootstrapEmbeddedShopifyInstall(idToken: string) {
  const shopDomain = shopDomainFromIdToken(idToken);
  const { accessToken, scope } = await exchangeIdToken(shopDomain, idToken);

  const existingConnection = await db.shopifyConnection.findUnique({ where: { shopDomain } });
  let userId = existingConnection?.userId;

  if (!userId) {
    const user = await db.user.create({
      data: {
        email: syntheticShopEmail(shopDomain),
        passwordHash: null,
      },
    });
    userId = user.id;
  }

  await db.shopifyConnection.upsert({
    where: { userId },
    update: { shopDomain, accessToken: encrypt(accessToken), scope },
    create: { userId, shopDomain, accessToken: encrypt(accessToken), scope },
  });

  const ids = await ensureWebhooks(shopDomain, accessToken);
  await db.shopifyConnection.update({
    where: { userId },
    data: {
      webhookId: ids.webhookId ?? null,
      refundWebhookId: ids.refundWebhookId ?? null,
      cancelledWebhookId: ids.cancelledWebhookId ?? null,
      uninstallWebhookId: ids.uninstallWebhookId ?? null,
    },
  });

  return {
    userId,
    shopDomain,
    webhookReady: Boolean(ids.webhookId),
    lifecycleReady: Boolean(ids.refundWebhookId && ids.cancelledWebhookId && ids.uninstallWebhookId),
  };
}
