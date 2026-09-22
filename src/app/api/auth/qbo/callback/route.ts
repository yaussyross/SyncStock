import { NextRequest, NextResponse } from "next/server";
import OAuthClient from "intuit-oauth";
import jwt from "jsonwebtoken";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { getCurrentUser } from "@/lib/session";

type EmbeddedState = {
  userId: string;
  shopDomain: string;
  embedded: true;
};

function readEmbeddedState(state: string): EmbeddedState | null {
  if (!process.env.NEXTAUTH_SECRET) return null;
  try {
    const payload = jwt.verify(state, process.env.NEXTAUTH_SECRET, {
      issuer: "syncstock-qbo-embedded",
    }) as EmbeddedState;
    if (!payload.embedded || !payload.userId || !payload.shopDomain?.endsWith(".myshopify.com")) return null;
    return payload;
  } catch {
    return null;
  }
}

function embeddedReturnUrl(shopDomain: string) {
  const configuredHandle = process.env.SHOPIFY_APP_HANDLE?.trim();
  const handle =
    !configuredHandle || configuredHandle === "syncstock-production"
      ? "syncstock-productionn"
      : configuredHandle;
  const storeHandle = shopDomain.replace(/\.myshopify\.com$/i, "");
  if (handle && storeHandle) {
    return `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/apps/${encodeURIComponent(handle)}`;
  }
  return `${process.env.APP_URL}/shopify/app?connected=qbo`;
}

export async function GET(req: NextRequest) {
  const returnedState = req.nextUrl.searchParams.get("state");
  if (!returnedState) {
    return NextResponse.json({ error: "Invalid or expired OAuth state." }, { status: 400 });
  }

  const embeddedState = readEmbeddedState(returnedState);
  const expectedState = req.cookies.get("qbo_oauth_state")?.value;
  const mobileUserId = req.cookies.get("qbo_oauth_mobile_user")?.value;

  if (!embeddedState && returnedState !== expectedState) {
    return NextResponse.json({ error: "Invalid or expired OAuth state." }, { status: 400 });
  }

  const isEmbedded = Boolean(embeddedState);
  const isMobile = !isEmbedded && Boolean(mobileUserId);
  const user = embeddedState
    ? await db.user.findUnique({ where: { id: embeddedState.userId } })
    : isMobile
      ? await db.user.findUnique({ where: { id: mobileUserId! } })
      : await getCurrentUser();

  if (!user) {
    return isMobile
      ? NextResponse.json({ error: "Mobile session expired. Please log in again." }, { status: 401 })
      : NextResponse.redirect(`${process.env.APP_URL}/login?error=session_expired`);
  }

  if (embeddedState) {
    const shopify = await db.shopifyConnection.findUnique({ where: { userId: user.id }, select: { shopDomain: true } });
    if (!shopify || shopify.shopDomain !== embeddedState.shopDomain) {
      return NextResponse.json({ error: "Shopify session no longer matches this account." }, { status: 403 });
    }
  }

  if (process.env.SYNCSTOCK_SANDBOX === "true" && (process.env.QBO_ENVIRONMENT !== "sandbox" || !process.env.SANDBOX_QBO_REALM_ID || req.nextUrl.searchParams.get("realmId") !== process.env.SANDBOX_QBO_REALM_ID)) {
    return NextResponse.json({ error: "Only the approved QuickBooks sandbox company can connect." }, { status: 403 });
  }

  const oauthClient = new OAuthClient({
    clientId: process.env.QBO_CLIENT_ID!,
    clientSecret: process.env.QBO_CLIENT_SECRET!,
    environment: process.env.QBO_ENVIRONMENT as "sandbox" | "production",
    redirectUri: `${process.env.APP_URL}/api/auth/qbo/callback`,
  });

  const authResponse = await oauthClient.createToken(req.url);
  const token = authResponse.getJson();
  const realmId = req.nextUrl.searchParams.get("realmId");

  if (!realmId) {
    return NextResponse.json({ error: "Missing QuickBooks company (realmId)." }, { status: 400 });
  }

  const tokenExpiry = new Date(Date.now() + token.expires_in * 1000);

  await db.qboConnection.upsert({
    where: { userId: user.id },
    update: {
      realmId,
      accessToken: encrypt(token.access_token),
      refreshToken: encrypt(token.refresh_token),
      tokenExpiry,
    },
    create: {
      userId: user.id,
      realmId,
      accessToken: encrypt(token.access_token),
      refreshToken: encrypt(token.refresh_token),
      tokenExpiry,
    },
  });

  const destination = embeddedState
    ? embeddedReturnUrl(embeddedState.shopDomain)
    : isMobile
      ? "syncstock://dashboard"
      : `${process.env.APP_URL}/dashboard?connected=qbo`;

  const res = NextResponse.redirect(destination);
  res.cookies.delete("qbo_oauth_state");
  res.cookies.delete("qbo_oauth_mobile_user");
  return res;
}
