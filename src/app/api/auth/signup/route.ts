import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSessionToken, sessionCookieOptions } from "@/lib/session";
import { z } from "zod";

const schema = z.object({ email: z.string().email() });

// MVP SHORTCUT: this is email-only, no password/magic-link verification.
// Fine for a closed beta with people you're personally onboarding.
// Before any public launch, replace with real email verification
// (e.g. Resend + a verification token, or swap to Clerk/Auth.js).
export async function POST(req: NextRequest) {
  const { email } = schema.parse(await req.json());

  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email },
  });

  const token = createSessionToken(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ ...sessionCookieOptions(), value: token });
  return res;
}
