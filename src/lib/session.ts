import jwt from "jsonwebtoken";
import { cookies, headers } from "next/headers";
import { db } from "./db";

const SECRET = process.env.NEXTAUTH_SECRET!;
const COOKIE_NAME = "session";

export function createSessionToken(userId: string): string {
  return jwt.sign({ userId }, SECRET, { expiresIn: "30d", issuer: "syncstock" });
}

// Supports secure web cookies and bearer tokens for the deferred mobile client.
export async function getCurrentUser() {
  const cookieToken = cookies().get(COOKIE_NAME)?.value;
  const authHeader = headers().get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const token = cookieToken || bearerToken;

  if (!token) return null;

  try {
    const payload = jwt.verify(token, SECRET, { issuer: "syncstock" }) as { userId: string };
    return db.user.findUnique({ where: { id: payload.userId } });
  } catch {
    return null;
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
