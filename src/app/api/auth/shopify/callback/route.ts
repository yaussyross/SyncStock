import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { getCurrentUser } from "@/lib/session";

// Step 2 of Shopify OAuth: Shopify redirects here with a temporary `code`.
// We exchange it for a permanent access token, then register the order
// webhook so new orders sync automatically going forward.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get("shopify_oauth_state")?.value;
  const shop = req.cookies.get("shopify_oauth_shop")?.value;
  const mobileUserId = req.cookies.get("shopify_oauth_mobile_user")?.value;

  if (!code || !shop || state !== cookieState) {
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

  await db.shopifyConnection.upsert({
    where: { userId: user.id },
    update: { shopDomain: shop, accessToken: encrypt(access_token), scope },
    create: { userId: user.id, shopDomain: shop, accessToken: encrypt(access_token), scope },
  });

  // Register orders/paid so revenue is recorded only after payment.
  const webhookRes = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": access_token,
    },
    body: JSON.stringify({
      query: `
        mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription { id }
            userErrors { field message }
          }
        }
      `,
      variables: {
        topic: "ORDERS_PAID",
        webhookSubscription: {
          callbackUrl: `${process.env.APP_URL}/api/webhooks/shopify/orders`,
          format: "JSON",
        },
      },
    }),
  });

  const webhookJson = await webhookRes.json();
  const webhookResult = webhookJson?.data?.webhookSubscriptionCreate;
  const webhookErrors = webhookResult?.userErrors;
  let webhookOk = false;

  if (webhookResult?.webhookSubscription?.id) {
    await db.shopifyConnection.update({
      where: { userId: user.id },
      data: { webhookId: webhookResult.webhookSubscription.id },
    });
    webhookOk = true;
  } else {
    console.error(
      "[shopify webhook] Failed to register orders/paid webhook:",
      JSON.stringify(webhookErrors || webhookJson)
    );
  }

  const destination = isMobile
    ? `syncstock://dashboard${webhookOk ? "" : "?webhook_error=1"}`
    : `${process.env.APP_URL}/dashboard?connected=shopify${webhookOk ? "" : "&webhook_error=1"}`;

  const res = NextResponse.redirect(destination);
  res.cookies.delete("shopify_oauth_state");
  res.cookies.delete("shopify_oauth_shop");
  res.cookies.delete("shopify_oauth_mobile_user");
  return res;
}
