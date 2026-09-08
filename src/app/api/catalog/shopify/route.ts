import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { fetchShopifyVariants } from "@/lib/shopify";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const connection = await db.shopifyConnection.findUnique({ where: { userId: user.id } });
  if (!connection) {
    return NextResponse.json({ error: "Connect Shopify before mapping products" }, { status: 409 });
  }

  try {
    const page = await fetchShopifyVariants(
      connection.shopDomain,
      connection.accessToken,
      req.nextUrl.searchParams.get("after")
    );
    return NextResponse.json(page);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not load Shopify variants" },
      { status: 502 }
    );
  }
}
