import { NextResponse } from "next/server";
import { queueBridgeRequestConfig } from "@/lib/queue-bridge";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { url, headers, authenticated } = await queueBridgeRequestConfig();
    if (!authenticated) {
      return NextResponse.json({ ok: false, error: "Queue bridge authentication is not configured" }, { status: 503 });
    }
    const response = await fetch(`${url}/auth-check`, {
      method: "POST", headers, cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return NextResponse.json({ ok: false, error: "Queue worker rejected deployment identity", workerStatus: response.status }, { status: 503 });
    }
    return NextResponse.json({ ok: true, queueBridge: "authenticated" });
  } catch {
    return NextResponse.json({ ok: false, error: "Queue bridge configuration or healthcheck failed" }, { status: 503 });
  }
}
