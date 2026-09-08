import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createSessionToken, sessionCookieOptions } from "@/lib/session";
import { hashPassword, normalizeEmail } from "@/lib/password";
import { z } from "zod";

const schema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and a password of at least 12 characters." }, { status: 400 });
  }

  const email = normalizeEmail(parsed.data.email);
  const passwordHash = await hashPassword(parsed.data.password);

  let user;
  try {
    user = await db.user.create({ data: { email, passwordHash } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "An account already exists for this email. Log in instead." }, { status: 409 });
    }
    throw error;
  }

  const token = createSessionToken(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ ...sessionCookieOptions(), value: token });
  return res;
}
