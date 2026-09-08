import { Queue } from "bullmq";
import { redis as connection } from "./redis";

// Background job queue: webhook handlers enqueue work here instead of doing
// the QBO API call inline, so a slow/down QBO API can't cause Shopify to
// think our webhook endpoint is broken.
export { connection };

export const syncQueue = new Queue("order-sync", {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: 500,
    removeOnFail: false,
  },
});
