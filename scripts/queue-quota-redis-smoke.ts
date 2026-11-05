import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { retryRetainedQueueJob } from "../src/lib/recover-queue-job";
import { QuotaReservationBusyError } from "../src/lib/sync-quota";

const connectionUrl = process.env.QUOTA_TEST_REDIS_URL;
if (!connectionUrl) throw new Error("Set QUOTA_TEST_REDIS_URL to an isolated local/CI Redis server.");
const url = new URL(connectionUrl);
if (!["localhost", "127.0.0.1", "::1", "[::1]", "redis"].includes(url.hostname)) throw new Error("Redis quota smoke refuses non-local hosts.");
const connection = new IORedis(connectionUrl, { maxRetriesPerRequest: null });
const queueName = `quota-smoke-${randomUUID()}`;
const queue = new Queue(queueName, { connection });
let capacityReserved = true;
let requests = 0;
let created = 0;
const worker = new Worker(queueName, async () => {
  requests++;
  if (capacityReserved) throw new QuotaReservationBusyError();
  created++;
}, { connection, concurrency: 1 });
async function awaitState(job: any, expected: string) {
  const end = Date.now() + 15_000;
  while (Date.now() < end) {
    if (await job.getState() === expected) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Job did not reach ${expected}`);
}
async function main() {
  await worker.waitUntilReady();
  const job = await queue.add("sync-order", {}, { jobId: "sync-recover", attempts: 5, backoff: { type: "fixed", delay: 10 }, removeOnFail: false, removeOnComplete: false });
  await awaitState(job, "failed");
  assert.equal(requests, 5);
  assert.equal(created, 0);
  assert(await queue.getJob("sync-recover"), "exhausted job remains retained in Redis");
  capacityReserved = false;
  await retryRetainedQueueJob(queue, "sync-recover");
  await awaitState(job, "completed");
  await retryRetainedQueueJob(queue, "sync-recover");
  assert.equal(requests, 6);
  assert.equal(created, 1, "released slot progresses exactly once after all automatic attempts exhaust");
  console.log("Real Redis/BullMQ quota recovery passed: five busy attempts, retained failed ID, released capacity, one successful retry.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await worker.close();
  await queue.obliterate({ force: true }); // Only the random queue created by this test.
  await queue.close();
  await connection.quit();
});
