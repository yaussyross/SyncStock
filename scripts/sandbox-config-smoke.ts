import assert from "node:assert/strict";
import { bridgeConfig } from "../src/lib/bridge-config";
const sandbox = {
  SYNCSTOCK_SANDBOX: "true", QBO_ENVIRONMENT: "sandbox",
  QUEUE_BRIDGE_URL: "https://isolated-worker.example.test",
  QUEUE_BRIDGE_SECRET: "test-only-secret",
};
assert.equal(bridgeConfig({}).sandbox, false);
assert.equal(bridgeConfig(sandbox).url, sandbox.QUEUE_BRIDGE_URL);
assert.throws(() => bridgeConfig({ VERCEL_ENV: "preview" }), /own QUEUE_BRIDGE_URL/);
assert.throws(() => bridgeConfig({ ...sandbox, QUEUE_BRIDGE_URL: undefined }), /own QUEUE_BRIDGE_URL/);
assert.throws(() => bridgeConfig({ ...sandbox, QBO_ENVIRONMENT: "production" }), /QBO_ENVIRONMENT/);
assert.throws(() => bridgeConfig({ ...sandbox, QUEUE_BRIDGE_SECRET: undefined }), /QUEUE_BRIDGE_SECRET/);
assert.throws(() => bridgeConfig({ ...sandbox, QUEUE_BRIDGE_URL: "https://worker-production-d9af.up.railway.app/" }), /production queue/);
assert.throws(() => bridgeConfig({ VERCEL_ENV: "preview", QUEUE_BRIDGE_URL: "https://worker-production-d9af.up.railway.app/path" }), /production queue/);
assert.throws(() => bridgeConfig({ ...sandbox, QUEUE_BRIDGE_URL: "http://public.example.test" }), /HTTPS/);
assert.equal(bridgeConfig({ ...sandbox, QUEUE_BRIDGE_URL: "http://localhost:4000" }).url, "http://localhost:4000");
console.log("Sandbox bridge configuration checks passed");
