import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { retryRetainedQueueJob } from "../src/lib/recover-queue-job";

const root = process.cwd();
const worker = fs.readFileSync(path.join(root, "src/worker/index.ts"), "utf8");
const recovery = fs.readFileSync(path.join(root, "src/app/api/internal/recover-pending/route.ts"), "utf8");

assert.match(recovery, /status: \{ in: \["pending", "queue_failed"\] \}/);
assert.match(recovery, /status: "failed", attempts: \{ lt: 5 \}/);
assert.match(recovery, /take: 500/);
assert.match(recovery, /x-syncstock-worker-signature/);
assert.match(recovery, /x-syncstock-worker-timestamp/);

assert.match(worker, /\/api\/internal\/recover-pending/);
assert.match(worker, /jobId: `sync-\$\{job\.syncLogId\}`/);
assert.match(worker, /remainingAttempts = Math\.max\(1, 5 - priorAttempts\)/);
assert.match(worker, /setInterval\(\(\) => \{/);
assert.match(worker, /5 \* 60 \* 1000/);
assert.match(worker, /clearInterval\(recoveryTimer\)/);

console.log("Durable queue recovery regression passed.");

async function retainedJobRegression() {
  let attemptsMade = 5;
  let state = "failed";
  let retries = 0;
  let creates = 0;
  let completed = false;
  const queue = { getJob: async () => ({
    getState: async () => state,
    retry: async (expected: "failed", options: { resetAttemptsMade: boolean }) => {
      assert.equal(expected, "failed"); assert.equal(state, "failed");
      assert.equal(options.resetAttemptsMade, true);
      attemptsMade = 0; state = "waiting"; retries++;
    },
  }) };
  // A temporary quota reservation exhausted all automatic tries, then released.
  assert.equal(await retryRetainedQueueJob(queue, "sync-log"), true);
  assert.equal(attemptsMade, 0); assert.equal(state, "waiting");
  if (!completed) { creates++; completed = true; state = "completed"; }
  await retryRetainedQueueJob(queue, "sync-log");
  assert.equal(retries, 1); assert.equal(creates, 1);
  assert.equal(await retryRetainedQueueJob({ getJob: async () => undefined }, "new-log"), false);
  assert.match(worker, /await retryRetainedQueueJob/);
  console.log("Retained failed queue IDs resume after temporary reservation saturation without duplicate creation.");
}
retainedJobRegression().catch(error => { console.error(error); process.exitCode = 1; });
