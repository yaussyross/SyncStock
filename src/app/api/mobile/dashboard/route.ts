import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [shopifyConn, qboConn, logs] = await Promise.all([
    db.shopifyConnection.findUnique({ where: { userId: user.id } }),
    db.qboConnection.findUnique({ where: { userId: user.id } }),
    db.syncLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  const quotaLimits: Record<string, number> = { trial: 20, starter: 200, growth: 1000, unlimited: Infinity };
  const limit = quotaLimits[user.planTier] ?? 20;

  return NextResponse.json({
    shopifyConnected: !!shopifyConn,
    shopifyDomain: shopifyConn?.shopDomain,
    qboConnected: !!qboConn,
    planTier: user.planTier,
    orderQuotaUsed: user.orderQuotaUsed,
    quotaLimit: limit === Infinity ? null : limit,
    logs: logs.map((l: { id: string; orderNumber: string | null; status: string; createdAt: Date }) => ({
      id: l.id,
      orderNumber: l.orderNumber,
      status: l.status,
      createdAt: l.createdAt,
    })),
  });
}
