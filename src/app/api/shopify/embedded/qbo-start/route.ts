import { NextResponse } from "next/server";
import OAuthClient from "intuit-oauth";
import jwt from "jsonwebtoken";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const shopify = await db.shopifyConnection.findUnique({ where: { userId: user.id } });
  if (!shopify) return NextResponse.json({ error: "Shopify connection is missing" }, { status: 409 });

  if (!process.env.NEXTAUTH_SECRET || !process.env.QBO_CLIENT_ID || !process.env.QBO_CLIENT_SECRET || !process.env.APP_URL) {
    return NextResponse.json({ error: "QuickBooks production configuration is incomplete" }, { status: 503 });
  }

  const state = jwt.sign(
    { userId: user.id, shopDomain: shopify.shopDomain, embedded: true },
    process.env.NEXTAUTH_SECRET,
    { expiresIn: "10m", issuer: "syncstock-qbo-embedded" }
  );

  const oauthClient = new OAuthClient({
    clientId: process.env.QBO_CLIENT_ID,
    clientSecret: process.env.QBO_CLIENT_SECRET,
    environment: process.env.QBO_ENVIRONMENT as "sandbox" | "production",
    redirectUri: `${process.env.APP_URL}/api/auth/qbo/callback`,
  });

  return NextResponse.json({
    url: oauthClient.authorizeUri({ scope: [OAuthClient.scopes.Accounting], state }),
  });
}
