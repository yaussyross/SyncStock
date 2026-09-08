import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSessionToken, sessionCookieOptions } from "@/lib/session";
import { normalizeEmail, verifyPassword } from "@/lib/password";
import { z } from "zod";

const schema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const email = normalizeEmail(parsed.data.email);
  const user = await db.user.findUnique({ where: { email } });
  const valid = user?.passwordHash
    ? await verifyPassword(parsed.data.password, user.passwordHash)
    : false;

  if (!user || !valid) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({ ...sessionCookieOptions(), value: createSessionToken(user.id) });
  return res;
}
