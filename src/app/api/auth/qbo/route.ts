import { NextRequest, NextResponse } from "next/server";
import OAuthClient from "intuit-oauth";
import crypto from "crypto";
import jwt from "jsonwebtoken";

export async function GET(req: NextRequest) {
  const isMobile = req.nextUrl.searchParams.get("mobile") === "1";
  const mobileToken = req.nextUrl.searchParams.get("token");

  let mobileUserId: string | null = null;
  if (isMobile) {
    if (!mobileToken) {
      return NextResponse.json({ error: "Missing mobile session token." }, { status: 401 });
    }
    try {
      const payload = jwt.verify(mobileToken, process.env.NEXTAUTH_SECRET!) as { userId: string };
      mobileUserId = payload.userId;
    } catch {
      return NextResponse.json({ error: "Invalid or expired mobile session." }, { status: 401 });
    }
  }

  const oauthClient = new OAuthClient({
    clientId: process.env.QBO_CLIENT_ID!,
    clientSecret: process.env.QBO_CLIENT_SECRET!,
    environment: process.env.QBO_ENVIRONMENT as "sandbox" | "production",
    redirectUri: `${process.env.APP_URL}/api/auth/qbo/callback`,
  });

  const state = crypto.randomBytes(16).toString("hex");
  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state,
  });

  const res = NextResponse.redirect(authUri);
  res.cookies.set("qbo_oauth_state", state, { httpOnly: true, maxAge: 600 });
  if (mobileUserId) {
    res.cookies.set("qbo_oauth_mobile_user", mobileUserId, { httpOnly: true, maxAge: 600 });
  }
  return res;
}
