import jwt from "jsonwebtoken";
import { cookies, headers } from "next/headers";
import { db } from "./db";

const SECRET = process.env.NEXTAUTH_SECRET!;
const COOKIE_NAME = "session";

// Minimal session system for v1. Not building full auth (password reset, social
// login, etc.) — just enough to know which User a request belongs to.
// Swap for Clerk/Auth.js later if you want social login without extra work.

export function createSessionToken(userId: string): string {
  return jwt.sign({ userId }, SECRET, { expiresIn: "30d" });
}

// Supports two auth methods:
// 1. Web: httpOnly session cookie (set by /api/auth/signup)
// 2. Mobile app: "Authorization: Bearer <token>" header (mobile has no
//    browser cookie jar, so it gets a raw token from /api/auth/mobile-login
//    and stores it in SecureStore, sending it on every request instead)
export async function getCurrentUser() {
  const cookieToken = cookies().get(COOKIE_NAME)?.value;
  const authHeader = headers().get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const token = cookieToken || bearerToken;

  if (!token) return null;

  try {
    const payload = jwt.verify(token, SECRET) as { userId: string };
    return db.user.findUnique({ where: { id: payload.userId } });
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  };
}
