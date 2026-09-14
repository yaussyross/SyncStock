import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { processOrderSync } from "@/lib/sync";

const WORKER_SIGNING_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAxzF/ZUcRRntIrjOkl29U+hvQ1xJSrlCQnWav39XbEoI=
-----END PUBLIC KEY-----`;
const workerPublicKey = crypto.createPublicKey(WORKER_SIGNING_PUBLIC_KEY_PEM);
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
    workerPublicKey,
    signature
  );
}

export async function POST(req: NextRequest) {
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
