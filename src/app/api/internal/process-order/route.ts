import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { processOrderSync } from "@/lib/sync";

const WORKER_SIGNING_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAG9flPogWlcoP1emNdR4o0KtjvuqQPONcUpYQqydWYag=
-----END PUBLIC KEY-----`;
// A sandbox must use its own key; never silently trust the production worker.
function workerKey() {
  const configured = process.env.WORKER_SIGNING_PUBLIC_KEY_B64;
  if (process.env.SYNCSTOCK_SANDBOX === "true" && !configured) {
    throw new Error("Sandbox requires WORKER_SIGNING_PUBLIC_KEY_B64");
  }
  return crypto.createPublicKey(configured
    ? Buffer.from(configured, "base64").toString("utf8")
    : WORKER_SIGNING_PUBLIC_KEY_PEM);
}
const MAX_SKEW_MS = 5 * 60 * 1000;

function workerAuthorized(rawBody: string, timestampHeader: string | null, signatureHeader: string | null) {
  if (!timestampHeader || !signatureHeader) return false;

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return false;

  const now = Date.now();
  if (Math.abs(now - timestamp) > MAX_SKEW_MS) return false;

  let signature: Buffer;
  try {
    signature = Buffer.from(signatureHeader, "base64url");
  } catch {
    return false;
  }

  return crypto.verify(
    null,
    Buffer.from(`${timestampHeader}.${rawBody}`, "utf8"),
    workerKey(),
    signature
  );
}

export async function POST(req: NextRequest) {
  if (process.env.SYNCSTOCK_SANDBOX === "true" && process.env.QBO_ENVIRONMENT !== "sandbox") {
    return NextResponse.json({ error: "Sandbox accounting configuration is invalid" }, { status: 503 });
  }
  const rawBody = await req.text();

  if (
    !workerAuthorized(
      rawBody,
      req.headers.get("x-syncstock-worker-timestamp"),
      req.headers.get("x-syncstock-worker-signature")
    )
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId, order } = (() => {
    try {
      return JSON.parse(rawBody);
    } catch {
      return {};
    }
  })();

  if (!userId || !order?.id) {
    return NextResponse.json({ error: "Invalid job payload" }, { status: 400 });
  }

  await processOrderSync(String(userId), order);
  return NextResponse.json({ processed: true });
}
