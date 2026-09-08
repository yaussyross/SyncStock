import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getQboClientForUser, listQboItems } from "@/lib/qbo";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const connection = await db.qboConnection.findUnique({ where: { userId: user.id } });
  if (!connection) {
    return NextResponse.json({ error: "Connect QuickBooks before mapping products" }, { status: 409 });
  }

  try {
    const qbo = await getQboClientForUser(user.id);
    const items = await listQboItems(qbo);
    return NextResponse.json({
      items,
      truncated: items.length >= 1000,
    });
  } catch (error: any) {
    const message = error?.Fault?.Error?.[0]?.Message || error?.message || "Could not load QuickBooks items";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
