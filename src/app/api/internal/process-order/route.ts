import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { processOrderSync } from "@/lib/sync";

function authorized(provided: string | null) {
  const expected = process.env.QUEUE_BRIDGE_SECRET;
  if (!expected || !provided) return false;

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorized(req.headers.get("x-syncstock-queue-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId, order } = await req.json().catch(() => ({}));
  if (!userId || !order?.id) {
    return NextResponse.json({ error: "Invalid job payload" }, { status: 400 });
  }

  await processOrderSync(String(userId), order);
  return NextResponse.json({ processed: true });
}
