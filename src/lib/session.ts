import jwt from "jsonwebtoken";
import { cookies, headers } from "next/headers";
import { db } from "./db";
import { shopDomainFromIdToken } from "./shopify-id-token";

const SECRET = process.env.NEXTAUTH_SECRET!;
const COOKIE_NAME = "session";

export function createSessionToken(userId: string): string {
  return jwt.sign({ userId }, SECRET, { expiresIn: "30d", issuer: "syncstock" });
}

async function userFromSyncStockToken(token: string) {
  const payload = jwt.verify(token, SECRET, { issuer: "syncstock" }) as { userId: string };
  return db.user.findUnique({ where: { id: payload.userId } });
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
  const cookieToken = cookies().get(COOKIE_NAME)?.value;
  if (cookieToken) {
    try {
      return await userFromSyncStockToken(cookieToken);
    } catch {
      // Fall through so embedded/mobile bearer auth can still succeed.
    }
  }

  const authHeader = headers().get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!bearerToken) return null;

  try {
    return await userFromSyncStockToken(bearerToken);
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
