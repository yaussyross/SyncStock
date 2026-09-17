import crypto from "node:crypto";
import { createServer } from "node:http";
import { Worker } from "bullmq";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import { connection, syncQueue } from "../lib/worker-queue";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const appUrl = requireEnv("APP_URL").replace(/\/$/, "");
const signingPrivateKey = crypto.createPrivateKey(
  Buffer.from(requireEnv("WORKER_SIGNING_PRIVATE_KEY_B64"), "base64").toString("utf8")
);
const bridgeSecret = process.env.QUEUE_BRIDGE_SECRET;
const sandbox = process.env.SYNCSTOCK_SANDBOX === "true";
if (sandbox) {
  requireEnv("QUEUE_BRIDGE_SECRET");
  if (["sync-stock-six.vercel.app", "sync-stock-raus2.vercel.app", "sync-stock-git-main-raus2.vercel.app"].includes(new URL(appUrl).hostname)) {
    throw new Error("Sandbox worker cannot target the production app");
  }
}
const port = Number(process.env.PORT || 3000);

const VERCEL_OWNER = "raus2";
const VERCEL_PROJECT = "sync-stock";
const VERCEL_AUDIENCE = `https://vercel.com/${VERCEL_OWNER}`;
const ALLOWED_VERCEL_ISSUERS = new Set([
  "https://oidc.vercel.com",
  `https://oidc.vercel.com/${VERCEL_OWNER}`,
]);
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function sharedSecretAuthorized(provided: string | undefined) {
  if (!bridgeSecret || !provided) return false;
  const a = Buffer.from(bridgeSecret, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function vercelOidcAuthorized(token: string | undefined) {
  // Isolated sandbox workers accept only their own shared secret.
  if (sandbox) return false;
  if (!token) return false;

  try {
    const decoded = decodeJwt(token);
    const issuer = typeof decoded.iss === "string" ? decoded.iss : "";
    if (!ALLOWED_VERCEL_ISSUERS.has(issuer)) return false;

    let jwks = jwksCache.get(issuer);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`));
      jwksCache.set(issuer, jwks);
    }

    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: VERCEL_AUDIENCE,
    });

    return (
      payload.owner === VERCEL_OWNER &&
      payload.project === VERCEL_PROJECT &&
      payload.environment === "production"
    );
  } catch (error: any) {
    console.warn(`[worker] Rejected Vercel OIDC token: ${error?.code || error?.message || "invalid token"}`);
    return false;
  }
}

async function requestAuthorized(req: import("node:http").IncomingMessage) {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    if (await vercelOidcAuthorized(authorization.slice("Bearer ".length))) return true;
  }

  const provided = req.headers["x-syncstock-queue-secret"];
  const secret = Array.isArray(provided) ? provided[0] : provided;
  return sharedSecretAuthorized(secret);
}

async function readJson(req: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 2 * 1024 * 1024) throw new Error("Payload too large");
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res: import("node:http").ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function signWorkerRequest(body: string, timestamp: string) {
  return crypto
    .sign(null, Buffer.from(`${timestamp}.${body}`, "utf8"), signingPrivateKey)
    .toString("base64url");
}

const worker = new Worker(
  "order-sync",
  async (job) => {
    const { userId, order } = job.data;
    console.log(`[sync] Processing order ${order?.name ?? order?.id} for user ${userId}`);

    const body = JSON.stringify({ userId, order });
    const timestamp = Date.now().toString();
    const signature = signWorkerRequest(body, timestamp);

    const response = await fetch(`${appUrl}/api/internal/process-order`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-syncstock-worker-timestamp": timestamp,
        "x-syncstock-worker-signature": signature,
      },
      body,
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      throw new Error(
        `Vercel processor returned ${response.status}${responseBody ? `: ${responseBody.slice(0, 500)}` : ""}`
      );
    }
  },
  { connection, concurrency: 5 }
);

worker.on("completed", (job) => {
  console.log(`[sync] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[sync] Job ${job?.id} failed after ${job?.attemptsMade} attempts:`, err.message);
});

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && req.url === "/auth-check") {
    if (!(await requestAuthorized(req))) return sendJson(res, 401, { error: "Unauthorized" });
    return sendJson(res, 200, { ok: true });
  }

  if (req.method !== "POST" || req.url !== "/enqueue") {
    return sendJson(res, 404, { error: "Not found" });
  }

  if (!(await requestAuthorized(req))) return sendJson(res, 401, { error: "Unauthorized" });

  try {
    const { userId, order, jobId } = await readJson(req);
    if (!userId || !order?.id || !jobId) {
      return sendJson(res, 400, { error: "Invalid job payload" });
    }

    await syncQueue.add("sync-order", { userId: String(userId), order }, { jobId: String(jobId) });
    return sendJson(res, 202, { queued: true, jobId: String(jobId) });
  } catch (error: any) {
    const message = error?.message || "Could not enqueue job";
    const status = message === "Payload too large" ? 413 : 500;
    return sendJson(res, status, { error: message });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Sync worker started on port ${port}, waiting for jobs...`);
});

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} received, shutting down`);
  server.close();
  await worker.close();
  await syncQueue.close();
  if (connection.status !== "end") await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
