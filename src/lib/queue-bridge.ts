type EnqueuePayload = {
  userId: string;
  order: any;
  jobId: string;
};

const DEFAULT_BRIDGE_URL = "https://worker-production-d9af.up.railway.app";

export async function enqueueOrderSync(payload: EnqueuePayload) {
  const bridgeUrl = (process.env.QUEUE_BRIDGE_URL || DEFAULT_BRIDGE_URL).replace(/\/$/, "");
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  const bridgeSecret = process.env.QUEUE_BRIDGE_SECRET;

  if (oidcToken || bridgeSecret) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (oidcToken) headers.authorization = `Bearer ${oidcToken}`;
    else if (bridgeSecret) headers["x-syncstock-queue-secret"] = bridgeSecret;

    const response = await fetch(`${bridgeUrl}/enqueue`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Queue bridge rejected job (${response.status})${body ? `: ${body.slice(0, 300)}` : ""}`);
    }
    return;
  }

  // Local-development fallback: use Redis directly when no deployment identity is available.
  if (process.env.REDIS_URL) {
    const { syncQueue } = await import("./queue");
    await syncQueue.add("sync-order", { userId: payload.userId, order: payload.order }, { jobId: payload.jobId });
    return;
  }

  throw new Error("Queue is not configured. Vercel OIDC, QUEUE_BRIDGE_SECRET, or REDIS_URL is required.");
}
