import IORedis from "ioredis";

export const redis = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
});

export async function ensureRedisConnected() {
  if (redis.status === "wait") await redis.connect();
}
