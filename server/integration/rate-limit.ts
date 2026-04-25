import Redis from "ioredis";

type RateLimitResult = { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number };

let redis: Redis | null = null;
const fallbackState = new Map<string, { windowStart: number; count: number }>();

function getRedis(): Redis | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (redis) return redis;
  redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  return redis;
}

export async function integrationRateLimitCheck(args: {
  keyId: string;
  maxPerMinute: number;
}): Promise<RateLimitResult> {
  const windowSeconds = 60;
  const r = getRedis();
  const nowMs = Date.now();
  const fallback = () => {
    const cur = fallbackState.get(args.keyId);
    if (!cur || nowMs - cur.windowStart > windowSeconds * 1000) {
      fallbackState.set(args.keyId, { windowStart: nowMs, count: 1 });
      return { ok: true as const, remaining: Math.max(0, args.maxPerMinute - 1) };
    }
    cur.count += 1;
    if (cur.count > args.maxPerMinute) return { ok: false as const, retryAfterSeconds: windowSeconds };
    return { ok: true as const, remaining: Math.max(0, args.maxPerMinute - cur.count) };
  };
  if (!r) return fallback();

  const nowBucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const redisKey = `ehr:int:rl:${args.keyId}:${nowBucket}`;
  try {
    await r.connect().catch(() => undefined);
    const n = await r.incr(redisKey);
    if (n === 1) {
      await r.expire(redisKey, windowSeconds + 5);
    }
    if (n > args.maxPerMinute) {
      return { ok: false, retryAfterSeconds: windowSeconds };
    }
    return { ok: true, remaining: Math.max(0, args.maxPerMinute - n) };
  } catch {
    // Safe fallback when Redis is unavailable.
    return fallback();
  }
}

