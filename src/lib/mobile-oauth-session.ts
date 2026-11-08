import { db } from "./db";
import { signMobileOAuthHandoff, verifyMobileOAuthHandoff, sessionMatchesUser } from "./first-party-session.mjs";

type Provider = "qbo" | "shopify";
export function createMobileOAuthHandoff(identity: {userId: string; authVersion: number}, provider: Provider, state: string, shop: string | null = null) {
  return signMobileOAuthHandoff(identity, provider, state, shop, process.env.NEXTAUTH_SECRET!);
}
export async function userFromMobileOAuthHandoff(token: string, provider: Provider, state: string, shop: string | null = null) {
  try {
    const claims = verifyMobileOAuthHandoff(token, provider, state, shop, process.env.NEXTAUTH_SECRET!);
    const user = await db.user.findUnique({ where: { id: claims.userId } });
    return sessionMatchesUser(claims, user) ? user : null;
  } catch { return null; }
}
