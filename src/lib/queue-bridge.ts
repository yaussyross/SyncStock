type EnqueuePayload = {
  userId: string;
  order: any;
  jobId: string;
};

export async function enqueueOrderSync(payload: EnqueuePayload) {
  const bridgeUrl = process.env.QUEUE_BRIDGE_URL?.replace(/\/$/, "");
  const bridgeSecret = process.env.QUEUE_BRIDGE_SECRET;

  if (bridgeUrl && bridgeSecret) {
    const response = await fetch(`${bridgeUrl}/enqueue`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-syncstock-queue-secret": bridgeSecret,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Queue bridge rejected job (${response.status})${body ? `: ${body.slice(0, 300)}` : ""}`);
    }
    return;
  }

  // Local-development fallback: use Redis directly when no bridge is configured.
  if (process.env.REDIS_URL) {
    const { syncQueue } = await import("./queue");
    await syncQueue.add("sync-order", { userId: payload.userId, order: payload.order }, { jobId: payload.jobId });
    return;
  }

  throw new Error("Queue is not configured. Set QUEUE_BRIDGE_URL/QUEUE_BRIDGE_SECRET or REDIS_URL.");
}
