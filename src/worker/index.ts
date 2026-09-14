import crypto from "node:crypto";
import { createServer } from "node:http";
import { Worker } from "bullmq";
import { connection, syncQueue } from "../lib/queue";

const bridgeSecret = process.env.QUEUE_BRIDGE_SECRET;
const appUrl = process.env.APP_URL?.replace(/\/$/, "");
const port = Number(process.env.PORT || 3000);

if (!bridgeSecret) throw new Error("QUEUE_BRIDGE_SECRET is required");
if (!appUrl) throw new Error("APP_URL is required");

function authorized(provided: string | undefined) {
  if (!provided) return false;
  const a = Buffer.from(bridgeSecret, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
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

const worker = new Worker(
  "order-sync",
  async (job) => {
    const { userId, order } = job.data;
    console.log(`[sync] Processing order ${order?.name ?? order?.id} for user ${userId}`);

    const response = await fetch(`${appUrl}/api/internal/process-order`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-syncstock-queue-secret": bridgeSecret,
      },
      body: JSON.stringify({ userId, order }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Vercel processor returned ${response.status}${body ? `: ${body.slice(0, 500)}` : ""}`
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

  if (req.method !== "POST" || req.url !== "/enqueue") {
    return sendJson(res, 404, { error: "Not found" });
  }

  const provided = req.headers["x-syncstock-queue-secret"];
  const secret = Array.isArray(provided) ? provided[0] : provided;
  if (!authorized(secret)) return sendJson(res, 401, { error: "Unauthorized" });

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
