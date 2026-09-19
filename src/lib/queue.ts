import { enqueueOrderSync } from "./queue-bridge";

// Web/API-side queue facade. In production this sends jobs over HTTPS to the
// Railway bridge so Vercel never needs direct access to the private Redis.
export const syncQueue = {
  async add(
    _name: string,
    data: { userId: string; syncLogId: string },
    options: { jobId?: string | number }
  ) {
    const jobId = String(options?.jobId || `sync-${data.userId}-${data.syncLogId}`);
    await enqueueOrderSync({ userId: data.userId, syncLogId: data.syncLogId, jobId });
    return { id: jobId };
  },
};
