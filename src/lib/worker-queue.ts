import { Queue } from "bullmq";
import { redis as connection } from "./redis";

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
