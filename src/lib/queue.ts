import { Queue } from "bullmq";
import IORedis from "ioredis";

// Background job queue: webhook handlers enqueue work here instead of doing
// the QBO API call inline, so a slow/down QBO API can't cause Shopify to
// think our webhook endpoint is broken (Shopify disables webhooks after
// repeated failures/timeouts).

export const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

export const syncQueue = new Queue("order-sync", {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 30_000 }, // retry at 30s, 60s, 120s, 240s, 480s
    removeOnComplete: 500,
    removeOnFail: false, // keep failures visible for the sync log / debugging
  },
});
