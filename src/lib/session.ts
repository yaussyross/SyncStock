import { signFirstPartySession, verifyFirstPartySession, sessionMatchesUser, firstPartyTokenFromCookieHeader } from "./first-party-session.mjs";
import { revokeSessionsWithPrisma } from "./prisma-session-revocation";
import { headers } from "next/headers";
import { db } from "./db";
import { shopDomainFromIdToken } from "./shopify-id-token";

const SECRET = process.env.NEXTAUTH_SECRET!;
const COOKIE_NAME = "session";

export function createSessionToken(userId: string, authVersion: number, sessionKind: "web" | "mobile"): string {
  return signFirstPartySession(userId, authVersion, sessionKind, SECRET);
}

async function userFromSyncStockToken(token: string, source: "web" | "mobile") {
  const claims = verifyFirstPartySession(token, SECRET);
  if (claims.sessionKind !== "legacy" && claims.sessionKind !== source) return null;
  const user = await db.user.findUnique({ where: { id: claims.userId } });
  return sessionMatchesUser(claims, user) ? user : null;
}

// Cookie-only identity for account security mutations. Never accepts a mobile
// bearer or Shopify embedded token, even when getCurrentUser could resolve one.
export async function getCurrentFirstPartyWebSession(): Promise<{ userId: string; authVersion: number } | null> {
  const token = firstPartyTokenFromCookieHeader((await headers()).get("cookie"));
  if (!token) return null;
  try {
    const user = await userFromSyncStockToken(token, "web");
    return user ? { userId: user.id, authVersion: user.authVersion } : null;
  } catch {
    return null;
  }
}

export async function revokeAllFirstPartySessions(userId: string, expectedAuthVersion: number): Promise<boolean> {
  return revokeSessionsWithPrisma(db, userId, expectedAuthVersion);
}

async function userFromShopifyIdToken(token: string) {
  const shopDomain = shopDomainFromIdToken(token);
  const connection = await db.shopifyConnection.findUnique({
    where: { shopDomain },
    include: { user: true },
  });
  return connection?.user ?? null;
}

// Supports secure web cookies, bearer tokens for the deferred mobile client,
// and Shopify App Bridge ID tokens for the embedded public app.
export async function getCurrentUser() {
  const cookieToken = firstPartyTokenFromCookieHeader((await headers()).get("cookie"));
  if (cookieToken) {
    try {
      const user = await userFromSyncStockToken(cookieToken, "web");
      if (user) return user;
    } catch {
      // Fall through so embedded/mobile bearer auth can still succeed.
    }
  }

  const authHeader = (await headers()).get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!bearerToken) return null;

  try {
    const user = await userFromSyncStockToken(bearerToken, "mobile");
    if (user) return user;
    return null;
  } catch {
    try {
      return await userFromShopifyIdToken(bearerToken);
    } catch {
      return null;
    }
  }
}

export function sessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  };
}

// Only genuine App Bridge identity may originate an embedded handoff. A web
// cookie must not become a new bearer proof that escapes its revocation epoch.
export async function getCurrentShopifyUser() {
  const auth = (await headers()).get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try { return await userFromShopifyIdToken(auth.slice(7)); } catch { return null; }
}

export async function getMobileSessionIdentity(token: string) {
  try {
    const user = await userFromSyncStockToken(token, "mobile");
    return user ? { userId: user.id, authVersion: user.authVersion } : null;
  } catch { return null; }
}
