import { describe, it, expect, vi, beforeEach } from "vitest";
import { decide, DecideResponse } from "../src/api";

const mockResponse: DecideResponse = {
  id: "abc123hash",
  state: "Deciding state",
  options: [
    { id: 0, slot: "no", label: "No", description: "Desc", p: 0.1 },
    { id: 1, slot: "yes", label: "Yes", description: "Desc", p: 0.6 },
    { id: 2, slot: "jester", label: "Jester", description: "Desc", p: 0.2 },
    { id: 3, slot: "prophet", label: "Prophet", description: "Desc", p: 0.1 },
  ],
  chosenId: 1,
  margin: 0.4,
  coinFlip: false,
  fallback: false,
  cached: false,
  timings: { groq: 50, mammoth: 100 },
};

describe("frontend/api", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("fetches from API and caches in sessionStorage", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const res = await decide("Should I go?");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.id).toBe("abc123hash");
      expect(res.data.cached).toBe(false);
    }

    // Second call should come from sessionStorage cache with cached: true
    const cachedRes = await decide("Should I go?");
    expect(cachedRes.ok).toBe(true);
    if (cachedRes.ok) {
      expect(cachedRes.data.cached).toBe(true);
    }
  });

  it("maps 400 status to BAD_INPUT", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { code: "BAD_INPUT", message: "that's a lot of words" } }),
    });

    const res = await decide("Too long");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("BAD_INPUT");
    }
  });

  it("maps 429 status to RATE_LIMIT", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: { code: "RATE_LIMIT", message: "the robots need a break" } }),
    });

    const res = await decide("Too fast");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("RATE_LIMIT");
    }
  });
});
