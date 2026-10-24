import type { DecideResponse } from "./normalize";

const DECIDE_CACHE_PREFIX = "decide:";
const CACHE_TTL_SECONDS = 86400; // 24 hours

export async function getCachedDecide(
  kv: KVNamespace | undefined,
  hash: string
): Promise<DecideResponse | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(`${DECIDE_CACHE_PREFIX}${hash}`);
    if (!raw) return null;
    const parsed: DecideResponse = JSON.parse(raw);
    parsed.cached = true;
    return parsed;
  } catch {
    return null;
  }
}

export async function setCachedDecide(
  kv: KVNamespace | undefined,
  hash: string,
  data: DecideResponse
): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(`${DECIDE_CACHE_PREFIX}${hash}`, JSON.stringify(data), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  } catch {
    // ignore KV write errors
  }
}

const MAX_REQUESTS_PER_HOUR = 10;
const WINDOW_MS = 3600 * 1000; // 1 hour

// In-memory sliding-window token bucket fallback when Cloudflare KV is unavailable
interface MemoryBucket {
  timestamps: number[];
}
const memoryRateLimits = new Map<string, MemoryBucket>();

export async function checkRateLimit(
  kv: KVNamespace | undefined,
  clientIp: string
): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  const ip = clientIp || "127.0.0.1";
  const now = Date.now();

  if (kv) {
    const hourWindow = Math.floor(now / WINDOW_MS);
    const key = `rate:${ip}:${hourWindow}`;

    try {
      const raw = await kv.get(key);
      const count = raw ? parseInt(raw, 10) : 0;

      // Seconds remaining until the next hour window
      const nextWindowTime = (hourWindow + 1) * WINDOW_MS;
      const retryAfterSeconds = Math.max(1, Math.ceil((nextWindowTime - now) / 1000));

      if (count >= MAX_REQUESTS_PER_HOUR) {
        return { allowed: false, remaining: 0, retryAfterSeconds };
      }

      const nextCount = count + 1;
      await kv.put(key, String(nextCount), { expirationTtl: 3600 });
      return { allowed: true, remaining: MAX_REQUESTS_PER_HOUR - nextCount, retryAfterSeconds: 0 };
    } catch {
      // Fall through to memoryStore on KV error
    }
  }

  // Memory-backed sliding window rate limiter
  let record = memoryRateLimits.get(ip);
  if (!record) {
    record = { timestamps: [] };
    memoryRateLimits.set(ip, record);
  }

  // Evict timestamps older than 1 hour
  record.timestamps = record.timestamps.filter((ts) => now - ts < WINDOW_MS);

  // Clean memory leaks if table gets large
  if (memoryRateLimits.size > 5000) {
    for (const [keyIp, bucket] of memoryRateLimits.entries()) {
      bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < WINDOW_MS);
      if (bucket.timestamps.length === 0) {
        memoryRateLimits.delete(keyIp);
      }
    }
  }

  if (record.timestamps.length >= MAX_REQUESTS_PER_HOUR) {
    const oldest = record.timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  record.timestamps.push(now);
  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_HOUR - record.timestamps.length,
    retryAfterSeconds: 0,
  };
}
