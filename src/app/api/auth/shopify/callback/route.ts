import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { getCurrentUser } from "@/lib/session";

const SHOPIFY_API_VERSION = "2026-07";

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
    console.warn("[shopify webhook] Could not list existing subscriptions; continuing with registration", error);
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
      if (result?.userErrors?.length) {
        throw new Error(result.userErrors.map((e: any) => e.message).join("; "));
      }
      if (!result?.webhookSubscription?.id) throw new Error("Shopify did not return a webhook subscription id");
      ids[item.field] = result.webhookSubscription.id;
    } catch (error) {
      console.error(`[shopify webhook] Failed to register ${item.topic}`, error);
    }
  }

  return ids;
}

// Step 2 of Shopify OAuth: exchange the temporary code, persist the encrypted
// access token, then ensure all required SyncStock webhook subscriptions exist.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get("shopify_oauth_state")?.value;
  const shop = req.cookies.get("shopify_oauth_shop")?.value;
  const mobileUserId = req.cookies.get("shopify_oauth_mobile_user")?.value;

  if (!code || !shop || !cookieState || state !== cookieState) {
    return NextResponse.json({ error: "Invalid or expired OAuth state." }, { status: 400 });
  }

  const isMobile = !!mobileUserId;
  const user = isMobile
    ? await db.user.findUnique({ where: { id: mobileUserId } })
    : await getCurrentUser();

  if (!user) {
    return isMobile
      ? NextResponse.json({ error: "Mobile session expired. Please log in again." }, { status: 401 })
      : NextResponse.redirect(`${process.env.APP_URL}/login?error=session_expired`);
  }

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.json({ error: "Failed to exchange Shopify OAuth code." }, { status: 502 });
  }

  const { access_token, scope } = await tokenRes.json();
  if (!access_token) return NextResponse.json({ error: "Shopify returned no access token." }, { status: 502 });

  await db.shopifyConnection.upsert({
    where: { userId: user.id },
    update: { shopDomain: shop, accessToken: encrypt(access_token), scope: scope ?? "" },
    create: { userId: user.id, shopDomain: shop, accessToken: encrypt(access_token), scope: scope ?? "" },
  });

  const desired: DesiredWebhook[] = [
    { topic: "ORDERS_PAID", uri: `${process.env.APP_URL}/api/webhooks/shopify/orders`, field: "webhookId" },
    { topic: "REFUNDS_CREATE", uri: `${process.env.APP_URL}/api/webhooks/shopify/lifecycle`, field: "refundWebhookId" },
    { topic: "ORDERS_CANCELLED", uri: `${process.env.APP_URL}/api/webhooks/shopify/lifecycle`, field: "cancelledWebhookId" },
    { topic: "APP_UNINSTALLED", uri: `${process.env.APP_URL}/api/webhooks/shopify/lifecycle`, field: "uninstallWebhookId" },
  ];
  const ids = await registerWebhooks(shop, access_token, desired);

  await db.shopifyConnection.update({
    where: { userId: user.id },
    data: {
      webhookId: ids.webhookId ?? null,
      refundWebhookId: ids.refundWebhookId ?? null,
      cancelledWebhookId: ids.cancelledWebhookId ?? null,
      uninstallWebhookId: ids.uninstallWebhookId ?? null,
    },
  });

  const orderWebhookOk = !!ids.webhookId;
  const lifecycleOk = !!ids.refundWebhookId && !!ids.cancelledWebhookId && !!ids.uninstallWebhookId;
  const params = new URLSearchParams({ connected: "shopify" });
  if (!orderWebhookOk) params.set("webhook_error", "1");
  if (!lifecycleOk) params.set("lifecycle_warning", "1");

  const destination = isMobile
    ? `syncstock://dashboard${orderWebhookOk && lifecycleOk ? "" : "?webhook_warning=1"}`
    : `${process.env.APP_URL}/dashboard?${params.toString()}`;

  const res = NextResponse.redirect(destination);
  res.cookies.delete("shopify_oauth_state");
  res.cookies.delete("shopify_oauth_shop");
  res.cookies.delete("shopify_oauth_mobile_user");
  return res;
}
