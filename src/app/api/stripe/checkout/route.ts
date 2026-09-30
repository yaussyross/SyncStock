import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "New SyncStock subscriptions are billed through Shopify. Open Billing and choose a Shopify plan." },
    { status: 410 }
  );
}
