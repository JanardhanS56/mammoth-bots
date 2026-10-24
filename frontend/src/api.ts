export type OptionSlot = "no" | "yes" | "jester" | "prophet";

export interface Option {
  id: 0 | 1 | 2 | 3;
  slot: OptionSlot;
  label: string;
  description: string;
  p: number;
}

export interface DecideResponse {
  id: string;
  state: string;
  options: [Option, Option, Option, Option];
  chosenId: 0 | 1 | 2 | 3;
  margin: number;
  coinFlip: boolean;
  fallback: boolean;
  cached: boolean;
  timings: { groq: number; mammoth: number };
}

export interface ApiError {
  code: "BAD_INPUT" | "UPSTREAM" | "RATE_LIMIT" | "NETWORK";
  message: string;
  retryAfter?: number;
}

const CACHE_KEY = "mammoth-cache-v1";

function getSessionCache(): Record<string, DecideResponse> {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setSessionCache(key: string, data: DecideResponse): void {
  try {
    const cache = getSessionCache();
    cache[key] = data;
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Safari private mode or quota exceeded
  }
}

export async function decide(
  question: string,
  apiBase: string = ""
): Promise<{ ok: true; data: DecideResponse } | { ok: false; error: ApiError }> {
  const normalized = question.trim().toLowerCase().replace(/\s+/g, " ");

  // Check client sessionStorage cache
  const cache = getSessionCache();
  if (cache[normalized]) {
    return {
      ok: true,
      data: {
        ...cache[normalized],
        cached: true,
      },
    };
  }

  // Safe timeout safeguard: abort after 14s so bots never lock in THINKING state indefinitely
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 14000);

  try {
    const url = `${apiBase}/api/decide`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      let code: ApiError["code"] = "UPSTREAM";
      let message = "the robots forgot how to decide";

      const retryAfterHeader = res.headers?.get ? res.headers.get("Retry-After") : null;
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

      if (res.status === 400) {
        code = "BAD_INPUT";
        message = "that's a lot of words";
      } else if (res.status === 429) {
        code = "RATE_LIMIT";
        message = retryAfter
          ? `Usage limit reached (10/hr). Please wait ${retryAfter}s.`
          : "the robots need a break";
      }

      try {
        const errJson: any = await res.json();
        if (errJson?.error?.message) {
          message = errJson.error.message;
        }
        if (errJson?.error?.code) {
          code = errJson.error.code;
        }
      } catch {
        // use status defaults
      }

      return { ok: false, error: { code, message, retryAfter } };
    }

    const data: DecideResponse = await res.json();
    setSessionCache(normalized, data);
    return { ok: true, data };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === "AbortError") {
      return {
        ok: false,
        error: { code: "UPSTREAM", message: "Deliberation timed out. Please try again." },
      };
    }
    return {
      ok: false,
      error: {
        code: "NETWORK",
        message: err?.message || "the robots forgot how to decide",
      },
    };
  }
}
