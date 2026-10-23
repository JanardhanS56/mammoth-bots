import { describe, it, expect } from "vitest";
import { validateQuestion, sha256Hex } from "../src/validate";
import { buildDecideResponse, SLOTS } from "../src/normalize";
import worker from "../src/index";

describe("worker/validate", () => {
  it("rejects non-strings and empty input", () => {
    expect(validateQuestion(null).valid).toBe(false);
    expect(validateQuestion("").valid).toBe(false);
    expect(validateQuestion("   ").valid).toBe(false);
  });

  it("rejects strings > 100 characters", () => {
    expect(validateQuestion("a".repeat(101)).valid).toBe(false);
  });

  it("normalizes and accepts valid questions", () => {
    const res = validateQuestion("  Should I   Eat Pizza? ");
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe("should i eat pizza?");
  });

  it("sha256Hex generates consistent 64-char hex", async () => {
    const hash = await sha256Hex("hello world");
    expect(hash).toHaveLength(64);
    expect(hash).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
  });
});

describe("worker/normalize", () => {
  it("preserves fixed slot order and normalizes probabilities to 1.0", () => {
    const resp = buildDecideResponse({
      id: "test-id",
      state: "Testing state",
      rawOptions: [
        { label: "No way", description: "Reject" },
        { label: "Yes sure", description: "Endorse" },
        { label: "Banana", description: "Absurd" },
        { label: "Soon", description: "Ominous" },
      ],
      probabilities: [0.1, 0.4, 0.3, 0.2],
      fallback: false,
      cached: false,
      timings: { groq: 100, mammoth: 150 },
    });

    expect(resp.options.map((o) => o.slot)).toEqual(SLOTS);
    const sum = resp.options.reduce((acc, o) => acc + o.p, 0);
    expect(sum).toBeCloseTo(1.0, 3);
    expect(resp.chosenId).toBe(1);
    expect(resp.margin).toBeCloseTo(0.1, 3);
    expect(resp.coinFlip).toBe(false);
  });

  it("flags coinFlip when margin < 0.05", () => {
    const resp = buildDecideResponse({
      id: "coin-id",
      state: "Near tie",
      rawOptions: [
        { label: "A", description: "" },
        { label: "B", description: "" },
        { label: "C", description: "" },
        { label: "D", description: "" },
      ],
      probabilities: [0.36, 0.35, 0.15, 0.14],
      fallback: false,
      cached: false,
      timings: { groq: 100, mammoth: 150 },
    });

    expect(resp.margin).toBeLessThan(0.05);
    expect(resp.coinFlip).toBe(true);
  });
});

describe("worker endpoint M4", () => {
  it("handles OPTIONS with 204 CORS", async () => {
    const req = new Request("http://localhost/api/decide", { method: "OPTIONS" });
    const res = await worker.fetch(req, {});
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns 400 BAD_INPUT on invalid question", async () => {
    const req = new Request("http://localhost/api/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "" }),
    });
    const res = await worker.fetch(req, {});
    expect(res.status).toBe(400);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe("BAD_INPUT");
  });

  it("returns 200 DecideResponse with sum p === 1.0", async () => {
    const req = new Request("http://localhost/api/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Is this M4 working?" }),
    });
    const res = await worker.fetch(req, {});
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.id).toHaveLength(64);
    expect(data.options).toHaveLength(4);
    const sum = data.options.reduce((acc: number, o: any) => acc + o.p, 0);
    expect(sum).toBeCloseTo(1.0, 3);
  });
});
