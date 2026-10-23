import { describe, it, expect, beforeEach } from "vitest";
import { getCachedDecide, setCachedDecide, checkRateLimit } from "../src/cache";
import type { DecideResponse } from "../src/normalize";

class MockKV {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
}

describe("worker/cache KV helpers", () => {
  let mockKv: MockKV;

  beforeEach(() => {
    mockKv = new MockKV();
  });

  it("handles cache miss and hit", async () => {
    const miss = await getCachedDecide(mockKv as any, "hash123");
    expect(miss).toBeNull();

    const sample: DecideResponse = {
      id: "hash123",
      state: "State",
      options: [
        { id: 0, slot: "no", label: "No", description: "", p: 0.25 },
        { id: 1, slot: "yes", label: "Yes", description: "", p: 0.25 },
        { id: 2, slot: "jester", label: "Jester", description: "", p: 0.25 },
        { id: 3, slot: "prophet", label: "Prophet", description: "", p: 0.25 },
      ],
      chosenId: 0,
      margin: 0,
      coinFlip: true,
      fallback: false,
      cached: false,
      timings: { groq: 10, mammoth: 10 },
    };

    await setCachedDecide(mockKv as any, "hash123", sample);
    const hit = await getCachedDecide(mockKv as any, "hash123");
    expect(hit).not.toBeNull();
    expect(hit?.id).toBe("hash123");
    expect(hit?.cached).toBe(true);
  });

  it("enforces 10 requests/hour rate limit per IP", async () => {
    const ip = "203.0.113.195";

    for (let i = 1; i <= 10; i++) {
      const res = await checkRateLimit(mockKv as any, ip);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(10 - i);
    }

    // 11th request should be blocked
    const blocked = await checkRateLimit(mockKv as any, ip);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });
});
