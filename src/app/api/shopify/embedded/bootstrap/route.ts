import { NextRequest, NextResponse } from "next/server";
import { bootstrapEmbeddedShopifyInstall } from "@/lib/shopify-install";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const idToken = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: "Missing Shopify ID token" }, { status: 401 });

  try {
    const result = await bootstrapEmbeddedShopifyInstall(idToken);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    const message = error?.message || "Could not initialize SyncStock for this Shopify store";
    const status = /token|origin|audience|expired|valid/i.test(message) ? 401 : 502;
    console.error("[shopify embedded bootstrap]", { status, message });
    if (status === 401) {
      return NextResponse.json(
        { error: message },
        { status, headers: { "X-Shopify-Retry-Invalid-Session-Request": "1" } }
      );
    }
    return NextResponse.json({ error: message }, { status });
  }
}
