import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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
