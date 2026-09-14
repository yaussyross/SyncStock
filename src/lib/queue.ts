import { enqueueOrderSync } from "./queue-bridge";

// Web/API-side queue facade. In production this sends jobs over HTTPS to the
// Railway bridge so Vercel never needs direct access to the private Redis.
export const syncQueue = {
  async add(
    _name: string,
    data: { userId: string; order: any },
    options: { jobId?: string | number }
  ) {
    const jobId = String(options?.jobId || `order-${data.userId}-${data.order?.id ?? Date.now()}`);
    await enqueueOrderSync({ userId: data.userId, order: data.order, jobId });
    return { id: jobId };
  },
};
