import { Worker } from "bullmq";
import { connection } from "../lib/queue";
import { processOrderSync } from "../lib/sync";

// This runs as a SEPARATE process from the Next.js web app (e.g. a Railway
// "worker" service, or `npm run worker` in a background dyno). It pulls jobs
// off the Redis queue that the webhook route enqueued, and does the actual
// (potentially slow) QBO API work outside the request/response cycle.

const worker = new Worker(
  "order-sync",
  async (job) => {
    const { userId, order } = job.data;
    console.log(`[sync] Processing order ${order.name} for user ${userId}`);
    await processOrderSync(userId, order);
  },
  { connection, concurrency: 5 }
);

worker.on("completed", (job) => {
  console.log(`[sync] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[sync] Job ${job?.id} failed after ${job?.attemptsMade} attempts:`, err.message);
});

console.log("Sync worker started, waiting for jobs...");
