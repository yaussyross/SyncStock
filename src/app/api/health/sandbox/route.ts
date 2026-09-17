import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  if (process.env.SYNCSTOCK_SANDBOX !== "true") return new NextResponse(null, { status: 404 });
  let databaseReady = false;
  try { await db.$queryRaw`SELECT 1`; databaseReady = true; } catch {}
  const localDb = new URL(process.env.POSTGRES_PRISMA_URL || "postgresql://invalid").hostname === "127.0.0.1";
  return NextResponse.json({
    sandbox: true, databaseReady, isolatedLocalDatabase: localDb,
    checkoutDisabled: true, expiresAt: process.env.SANDBOX_EXPIRES_AT,
    shopifyCredentialsConfigured: Boolean(process.env.SHOPIFY_API_KEY && process.env.SHOPIFY_API_SECRET),
    quickbooksCredentialsConfigured: Boolean(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET),
    quickbooksEnvironment: process.env.QBO_ENVIRONMENT,
  }, { status: databaseReady && localDb ? 200 : 503 });
}
