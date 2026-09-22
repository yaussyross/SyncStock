import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getQuotaState } from "@/lib/quota";
import { db } from "@/lib/db";
import { syncQueue } from "@/lib/queue";

const RETRYABLE = [
  "failed",
  "queue_failed",
  "skipped_no_mapping",
  "blocked_reconciliation",
  "skipped_quota_exceeded",
];

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { syncLogId } = await req.json().catch(() => ({}));
  if (typeof syncLogId !== "string") {
    return NextResponse.json({ error: "A sync log ID is required" }, { status: 400 });
  }

  if (!getQuotaState(user).allowed) {
    return NextResponse.json(
      { error: "Update your subscription or wait for your next billing period before retrying." },
      { status: 403 }
    );
  }

  const log = await db.syncLog.findFirst({ where: { id: syncLogId, userId: user.id } });
  if (!log) return NextResponse.json({ error: "Sync log not found" }, { status: 404 });

  if (log.status === "success") {
    return NextResponse.json({ error: "This order has already synced successfully" }, { status: 409 });
  }

  if (log.qboInvoiceId || log.status === "reconciliation_failed_qbo") {
    return NextResponse.json(
      { error: "A QuickBooks transaction already exists and requires manual review before retrying." },
      { status: 409 }
    );
  }

  if (!RETRYABLE.includes(log.status)) {
    return NextResponse.json({ error: "This order is already queued or requires review." }, { status: 409 });
  }

  const claim = await db.syncLog.updateMany({
    where: { id: log.id, userId: user.id, status: { in: RETRYABLE }, qboInvoiceId: null },
    data: { status: "pending", errorMessage: null, qboActualTotal: null },
  });
  if (!claim.count) {
    return NextResponse.json({ error: "This order is already queued or requires review." }, { status: 409 });
  }

  try {
    await syncQueue.add(
      "sync-order",
      { userId: user.id, syncLogId: log.id },
      { jobId: `embedded-retry-${log.id}-${Date.now()}` }
    );
  } catch {
    await db.syncLog.updateMany({
      where: { id: log.id, status: "pending" },
      data: { status: "queue_failed", errorMessage: "Could not queue retry. Please try again." },
    });
    return NextResponse.json({ error: "Temporary queue failure. Please retry." }, { status: 503 });
  }

  return NextResponse.json({ queued: true });
}
