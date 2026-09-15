import crypto from "crypto";
import { ensureRedisConnected, redis } from "./redis";

type LocalBucket = { count: number; resetAt: number };

const localBuckets = new Map<string, LocalBucket>();

function digest(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export function clientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}

function allowLocalAttempt(key: string, limit: number, windowSeconds: number) {
  const now = Date.now();
  const existing = localBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    localBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }

  existing.count += 1;
  return existing.count <= limit;
}

function redisIsPrivateToRailway() {
  const redisUrl = process.env.REDIS_URL || "";
  return process.env.VERCEL === "1" && /(?:^|\.)railway\.internal(?::|\/|$)/i.test(redisUrl);
}

export async function allowAuthAttempt(scope: string, identity: string, limit = 10, windowSeconds = 15 * 60) {
  const key = `syncstock:ratelimit:${scope}:${digest(identity)}`;

  // Railway's *.railway.internal hostnames are only resolvable from Railway's
  // private network. Vercel must not attempt to connect to them or auth requests
  // can hang while DNS/Redis retries. Use a per-instance fallback limiter here;
  // password verification and the database remain the source of truth for auth.
  if (redisIsPrivateToRailway()) {
    return allowLocalAttempt(key, limit, windowSeconds);
  }

  try {
    await ensureRedisConnected();
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds);
    return count <= limit;
  } catch (error) {
    // Do not lock every merchant out if Redis has a transient outage. Auth still
    // uses password verification; rate limiting is a defense-in-depth layer.
    console.warn("[auth rate limit] Redis unavailable", error);
    return allowLocalAttempt(key, limit, windowSeconds);
  }
}
