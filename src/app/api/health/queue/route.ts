import { getVercelOidcToken } from "@vercel/oidc";
import { NextResponse } from "next/server";

const WORKER_URL = "https://worker-production-d9af.up.railway.app";

export const dynamic = "force-dynamic";

export async function GET() {
  let oidcToken: string | null = null;
  try {
    oidcToken = await getVercelOidcToken({ project: "sync-stock", team: "raus2" });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Vercel OIDC token is not available to this deployment" },
      { status: 503 }
    );
  }

  if (!oidcToken) {
    return NextResponse.json(
      { ok: false, error: "Vercel OIDC token is not available to this deployment" },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(`${WORKER_URL}/auth-check`, {
      method: "POST",
      headers: { authorization: `Bearer ${oidcToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: "Queue worker rejected deployment identity", workerStatus: response.status },
        { status: 503 }
      );
    }

    return NextResponse.json({ ok: true, queueBridge: "authenticated" });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Queue worker healthcheck failed" },
      { status: 503 }
    );
  }
}
