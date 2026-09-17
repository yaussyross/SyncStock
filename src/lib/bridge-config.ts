const PRODUCTION_BRIDGE_URL = "https://worker-production-d9af.up.railway.app";

export function bridgeConfig(env: Record<string, string | undefined> = process.env) {
  const sandbox = env.SYNCSTOCK_SANDBOX === "true";
  if (sandbox && env.QBO_ENVIRONMENT !== "sandbox") {
    throw new Error("Sandbox requires QBO_ENVIRONMENT=sandbox");
  }
  if ((sandbox || env.VERCEL_ENV === "preview") && !env.QUEUE_BRIDGE_URL) {
    throw new Error("Sandbox and preview deployments require their own QUEUE_BRIDGE_URL");
  }
  const url = (env.QUEUE_BRIDGE_URL || PRODUCTION_BRIDGE_URL).replace(/\/$/, "");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) {
    throw new Error("Queue bridge requires HTTPS outside localhost");
  }
  if ((sandbox || env.VERCEL_ENV === "preview") && parsed.origin === PRODUCTION_BRIDGE_URL) {
    throw new Error("Sandbox and preview deployments cannot use the production queue bridge");
  }
  if (sandbox && !env.QUEUE_BRIDGE_SECRET) {
    throw new Error("Sandbox requires its own QUEUE_BRIDGE_SECRET");
  }
  return { url, sandbox };
}
