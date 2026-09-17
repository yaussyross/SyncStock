import { getVercelOidcToken } from "@vercel/oidc";
import { bridgeConfig } from "./bridge-config";

type EnqueuePayload = {
  userId: string;
  order: any;
  jobId: string;
};

async function deploymentIdentityToken() {
  try {
    return await getVercelOidcToken({ project: "sync-stock", team: "raus2" });
  } catch {
    return null;
  }
}

export async function queueBridgeRequestConfig() {
  const { url, sandbox } = bridgeConfig();
  const oidcToken = sandbox ? null : await deploymentIdentityToken();
  const bridgeSecret = process.env.QUEUE_BRIDGE_SECRET;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (oidcToken) headers.authorization = `Bearer ${oidcToken}`;
  else if (bridgeSecret) headers["x-syncstock-queue-secret"] = bridgeSecret;
  return { url, headers, authenticated: Boolean(oidcToken || bridgeSecret) };
}

export async function enqueueOrderSync(payload: EnqueuePayload) {
  const { url: bridgeUrl, headers, authenticated } = await queueBridgeRequestConfig();

  if (authenticated) {
    const response = await fetch(`${bridgeUrl}/enqueue`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Queue bridge rejected job (${response.status})${body ? `: ${body.slice(0, 300)}` : ""}`);
    }
    return;
  }

  if (process.env.REDIS_URL) {
    const { syncQueue } = await import("./queue");
    await syncQueue.add("sync-order", { userId: payload.userId, order: payload.order }, { jobId: payload.jobId });
    return;
  }

  throw new Error("Queue is not configured. Vercel OIDC, QUEUE_BRIDGE_SECRET, or REDIS_URL is required.");
}
