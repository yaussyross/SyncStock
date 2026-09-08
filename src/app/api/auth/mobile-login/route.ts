import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSessionToken } from "@/lib/session";
import { z } from "zod";

const schema = z.object({ email: z.string().email() });

// MVP SHORTCUT — same caveat as /api/auth/signup: no email verification yet.
// Fine for your own testing/beta, needs real verification before public launch.
export async function POST(req: NextRequest) {
  const { email } = schema.parse(await req.json());

  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email },
  });

  const token = createSessionToken(user.id);
  return NextResponse.json({ token });
}
