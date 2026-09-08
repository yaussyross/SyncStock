import crypto from "crypto";
import { ensureRedisConnected, redis } from "./redis";

function digest(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export function clientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}

export async function allowAuthAttempt(scope: string, identity: string, limit = 10, windowSeconds = 15 * 60) {
  const key = `syncstock:ratelimit:${scope}:${digest(identity)}`;
  try {
    await ensureRedisConnected();
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds);
    return count <= limit;
  } catch (error) {
    // Do not lock every merchant out if Redis has a transient outage. Auth still
    // uses password verification; rate limiting is a defense-in-depth layer.
    console.warn("[auth rate limit] Redis unavailable", error);
    return true;
  }
}
