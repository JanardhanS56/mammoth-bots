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

/**
 * 10 requests per hour per IP token bucket in KV
 */
export async function checkRateLimit(
  kv: KVNamespace | undefined,
  clientIp: string
): Promise<{ allowed: boolean; remaining: number }> {
  if (!kv || !clientIp) {
    return { allowed: true, remaining: 10 };
  }

  const hourWindow = Math.floor(Date.now() / 3600000);
  const key = `rate:${clientIp}:${hourWindow}`;

  try {
    const raw = await kv.get(key);
    const count = raw ? parseInt(raw, 10) : 0;

    if (count >= 10) {
      return { allowed: false, remaining: 0 };
    }

    const nextCount = count + 1;
    await kv.put(key, String(nextCount), { expirationTtl: 3600 });
    return { allowed: true, remaining: 10 - nextCount };
  } catch {
    return { allowed: true, remaining: 10 };
  }
}
