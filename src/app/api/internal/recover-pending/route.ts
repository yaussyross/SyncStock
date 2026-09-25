import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const WORKER_SIGNING_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAG9flPogWlcoP1emNdR4o0KtjvuqQPONcUpYQqydWYag=
-----END PUBLIC KEY-----`;

function workerKey() {
  const configured = process.env.WORKER_SIGNING_PUBLIC_KEY_B64;
  if (process.env.SYNCSTOCK_SANDBOX === "true" && !configured) {
    throw new Error("Sandbox requires WORKER_SIGNING_PUBLIC_KEY_B64");
  }
  return crypto.createPublicKey(
    configured
      ? Buffer.from(configured, "base64").toString("utf8")
      : WORKER_SIGNING_PUBLIC_KEY_PEM
  );
}

const MAX_SKEW_MS = 5 * 60 * 1000;

function workerAuthorized(rawBody: string, timestampHeader: string | null, signatureHeader: string | null) {
  if (!timestampHeader || !signatureHeader) return false;

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_SKEW_MS) return false;

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

  const jobs = await db.syncLog.findMany({
    where: {
      OR: [
        { status: { in: ["pending", "queue_failed"] } },
        { status: "failed", attempts: { lt: 5 } },
      ],
    },
    select: {
      id: true,
      userId: true,
      attempts: true,
      status: true,
    },
    orderBy: { updatedAt: "asc" },
    take: 500,
  });

  return NextResponse.json({
    jobs: jobs.map((job) => ({
      userId: job.userId,
      syncLogId: job.id,
      attempts: job.attempts,
      status: job.status,
    })),
  });
}
