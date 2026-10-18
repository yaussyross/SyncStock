// The database is authoritative for recoverable work. A retained failed BullMQ
// ID must be retried, not re-added: add() silently reuses the exhausted job.
export async function retryRetainedQueueJob(queue: {
  getJob: (id: string) => Promise<undefined | { getState: () => Promise<string>; retry: (state: "failed", options: { resetAttemptsMade: boolean }) => Promise<void> }>;
}, jobId: string): Promise<boolean> {
  const existing = await queue.getJob(jobId);
  if (!existing) return false;
  if (await existing.getState() === "failed") {
    await existing.retry("failed", { resetAttemptsMade: true });
  }
  return true;
}
