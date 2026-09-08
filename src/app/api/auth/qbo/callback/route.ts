import { NextRequest, NextResponse } from "next/server";
import OAuthClient from "intuit-oauth";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { getCurrentUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  const returnedState = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get("qbo_oauth_state")?.value;
  const mobileUserId = req.cookies.get("qbo_oauth_mobile_user")?.value;

  if (!returnedState || returnedState !== expectedState) {
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

  const destination = isMobile
    ? "syncstock://dashboard"
    : `${process.env.APP_URL}/dashboard?connected=qbo`;

  const res = NextResponse.redirect(destination);
  res.cookies.delete("qbo_oauth_state");
  res.cookies.delete("qbo_oauth_mobile_user");
  return res;
}
