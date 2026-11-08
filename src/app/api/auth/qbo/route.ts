import { NextRequest, NextResponse } from "next/server";
import OAuthClient from "intuit-oauth";
import crypto from "crypto";
import { getMobileSessionIdentity } from "@/lib/session";
import { createMobileOAuthHandoff } from "@/lib/mobile-oauth-session";

export async function GET(req: NextRequest) {
  if (process.env.SYNCSTOCK_SANDBOX === "true" && (process.env.QBO_ENVIRONMENT !== "sandbox" || !process.env.QBO_CLIENT_ID || !process.env.QBO_CLIENT_SECRET)) {
    return NextResponse.json({ error: "Sandbox QuickBooks development credentials still need to be configured." }, { status: 503 });
  }
  const isMobile = req.nextUrl.searchParams.get("mobile") === "1";
  // Existing deferred mobile callers may still supply the query token. Prefer
  // Authorization; never forward either token into the provider redirect URL.
  const authorization = req.headers.get("authorization");
  const mobileToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : req.nextUrl.searchParams.get("token");

  const mobileIdentity = isMobile && mobileToken ? await getMobileSessionIdentity(mobileToken) : null;
  if (isMobile && !mobileIdentity) {
    return NextResponse.json({ error: "Invalid or expired mobile session." }, { status: 401 });
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
  res.cookies.set("qbo_oauth_state", state, { httpOnly: true, maxAge: 600, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  res.cookies.delete("qbo_oauth_mobile_user");
  if (mobileIdentity) {
    res.cookies.set("qbo_oauth_mobile_user", createMobileOAuthHandoff(mobileIdentity, "qbo", state), { httpOnly: true, maxAge: 600, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  }
  return res;
}
