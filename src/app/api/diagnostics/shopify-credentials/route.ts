import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function fingerprint(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  return {
    sha256Prefix: createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 12),
    length: normalized.length,
  };
}

export async function GET() {
  if (process.env.SYNCSTOCK_SANDBOX !== "true") {
    return new NextResponse(null, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    sandbox: true,
    apiKey: fingerprint(process.env.SHOPIFY_API_KEY),
    currentSecret: fingerprint(process.env.SHOPIFY_API_SECRET),
    previousSecret: fingerprint(process.env.SHOPIFY_API_SECRET_PREVIOUS),
    shopDomain: process.env.SANDBOX_SHOP_DOMAIN || null,
  });
}
