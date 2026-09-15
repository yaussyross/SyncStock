import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { getCurrentUser } from "@/lib/session";

const SHOPIFY_API_VERSION = "2026-07";
const DEV_SHOP = "test-wc9egg3y.myshopify.com";

type DesiredWebhook = {
  topic: "ORDERS_PAID" | "REFUNDS_CREATE" | "ORDERS_CANCELLED" | "APP_UNINSTALLED";
  uri: string;
  field: "webhookId" | "refundWebhookId" | "cancelledWebhookId" | "uninstallWebhookId";
};

async function shopifyGraphql(shop: string, token: string, query: string, variables: Record<string, unknown>) {
  const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const json = await response.json();
  if (!response.ok || json.errors?.length) {
    throw new Error(json.errors?.map((e: any) => e.message).join("; ") || `Shopify returned ${response.status}`);
  }
  return json.data;
}

async function registerWebhooks(shop: string, token: string, desired: DesiredWebhook[]) {
  let existing: Array<{ id: string; topic: string; uri: string }> = [];
  try {
    const listData = await shopifyGraphql(
      shop,
      token,
      `query SyncStockWebhooks($topics: [WebhookSubscriptionTopic!]) {
        webhookSubscriptions(first: 100, topics: $topics) { nodes { id topic uri } }
      }`,
      { topics: desired.map((item) => item.topic) }
    );
    existing = listData?.webhookSubscriptions?.nodes ?? [];
  } catch (error) {
    console.warn("[shopify dev-connect] Could not list existing subscriptions", error);
  }

  const ids: Partial<Record<DesiredWebhook["field"], string>> = {};
  for (const item of desired) {
    const match = existing.find((node) => node.topic === item.topic && node.uri === item.uri);
    if (match) {
      ids[item.field] = match.id;
      continue;
    }

    try {
      const data = await shopifyGraphql(
        shop,
        token,
        `mutation SyncStockWebhookCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription { id topic uri }
            userErrors { field message }
          }
        }`,
        {
          topic: item.topic,
          webhookSubscription: { uri: item.uri, format: "JSON" },
        }
      );
      const result = data?.webhookSubscriptionCreate;
      if (result?.userErrors?.length) throw new Error(result.userErrors.map((e: any) => e.message).join("; "));
      if (!result?.webhookSubscription?.id) throw new Error("Shopify returned no webhook subscription id");
      ids[item.field] = result.webhookSubscription.id;
    } catch (error) {
      console.error(`[shopify dev-connect] Failed to register ${item.topic}`, error);
    }
  }

  return ids;
}

// Temporary private-beta bridge for the SyncStock-owned Shopify dev store.
// Use a merchant-org Dev Dashboard app via SHOPIFY_DEV_CLIENT_ID/SHOPIFY_DEV_CLIENT_SECRET.
// The partner-distributed SyncStock app keeps SHOPIFY_API_KEY/SHOPIFY_API_SECRET for merchant OAuth.
export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${process.env.APP_URL}/login?error=session_expired`);

  const clientId = process.env.SHOPIFY_DEV_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_DEV_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("[shopify dev-connect] missing dedicated dev-store credentials");
    return NextResponse.redirect(`${process.env.APP_URL}/dashboard?shopify_dev_error=missing_dev_credentials`);
  }

  const tokenRes = await fetch(`https://${DEV_SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });

  const raw = await tokenRes.text();
  let tokenJson: any = {};
  try {
    tokenJson = raw ? JSON.parse(raw) : {};
  } catch {
    tokenJson = {};
  }
  if (!tokenRes.ok || !tokenJson.access_token) {
    const safeError = tokenJson?.error || tokenJson?.error_description || raw.slice(0, 240) || "token_exchange_failed";
    console.error("[shopify dev-connect] token exchange failed", tokenRes.status, safeError);
    const params = new URLSearchParams({ shopify_dev_error: tokenJson?.error || "token_exchange_failed" });
    return NextResponse.redirect(`${process.env.APP_URL}/dashboard?${params.toString()}`);
  }

  const accessToken = tokenJson.access_token as string;
  const scope = (tokenJson.scope as string | undefined) ?? "";

  await db.shopifyConnection.upsert({
    where: { userId: user.id },
    update: { shopDomain: DEV_SHOP, accessToken: encrypt(accessToken), scope },
    create: { userId: user.id, shopDomain: DEV_SHOP, accessToken: encrypt(accessToken), scope },
  });

  const desired: DesiredWebhook[] = [
    { topic: "ORDERS_PAID", uri: `${process.env.APP_URL}/api/webhooks/shopify/orders`, field: "webhookId" },
    { topic: "REFUNDS_CREATE", uri: `${process.env.APP_URL}/api/webhooks/shopify/lifecycle`, field: "refundWebhookId" },
    { topic: "ORDERS_CANCELLED", uri: `${process.env.APP_URL}/api/webhooks/shopify/lifecycle`, field: "cancelledWebhookId" },
    { topic: "APP_UNINSTALLED", uri: `${process.env.APP_URL}/api/webhooks/shopify/lifecycle`, field: "uninstallWebhookId" },
  ];
  const ids = await registerWebhooks(DEV_SHOP, accessToken, desired);

  await db.shopifyConnection.update({
    where: { userId: user.id },
    data: {
      webhookId: ids.webhookId ?? null,
      refundWebhookId: ids.refundWebhookId ?? null,
      cancelledWebhookId: ids.cancelledWebhookId ?? null,
      uninstallWebhookId: ids.uninstallWebhookId ?? null,
    },
  });

  const params = new URLSearchParams({ connected: "shopify_dev" });
  if (!ids.webhookId) params.set("webhook_error", "1");
  if (!ids.refundWebhookId || !ids.cancelledWebhookId || !ids.uninstallWebhookId) params.set("lifecycle_warning", "1");
  return NextResponse.redirect(`${process.env.APP_URL}/dashboard?${params.toString()}`);
}
