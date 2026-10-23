import { describe, it, expect, vi, afterEach } from "vitest";
import { extractProbabilities, scoreOptions } from "../src/mammoth";
import type { GroqOption } from "../src/groq";

const dummyOptions: GroqOption[] = [
  { label: "Option 0", description: "Desc 0" },
  { label: "Option 1", description: "Desc 1" },
  { label: "Option 2", description: "Desc 2" },
  { label: "Option 3", description: "Desc 3" },
];

describe("worker/mammoth defensive extraction", () => {
  it("returns uniform probabilities on null or empty json", () => {
    const res = extractProbabilities(null, dummyOptions);
    expect(res.ok).toBe(false);
    expect(res.p).toEqual([0.25, 0.25, 0.25, 0.25]);
  });

  it("returns uniform probabilities on corrupt / stringly typed errors", () => {
    const res = extractProbabilities({ probabilities: ["invalid", "bad", 1, 2] }, dummyOptions);
    expect(res.p.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 2);
  });

  it("extracts from top-level probabilities array", () => {
    const json = { probabilities: [0.1, 0.6, 0.2, 0.1] };
    const res = extractProbabilities(json, dummyOptions);
    expect(res.ok).toBe(true);
    expect(res.chosenIndex).toBe(1);
    expect(res.p.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 3);
  });

  it("extracts from nested questions format", () => {
    const json = {
      questions: [
        {
          key: "verdict",
          options: [
            { label: "Option 0", probability: 0.15 },
            { label: "Option 1", probability: 0.25 },
            { label: "Option 2", probability: 0.45 },
            { label: "Option 3", probability: 0.15 },
          ],
        },
      ],
    };
    const res = extractProbabilities(json, dummyOptions);
    expect(res.ok).toBe(true);
    expect(res.chosenIndex).toBe(2);
    expect(res.p[2]).toBeCloseTo(0.45, 2);
  });

  it("extracts from label-keyed probability map", () => {
    const json = {
      result: [
        {
          probabilities: {
            "Option 0": 0.05,
            "Option 1": 0.15,
            "Option 2": 0.1,
            "Option 3": 0.7,
          },
        },
      ],
    };
    const res = extractProbabilities(json, dummyOptions);
    expect(res.ok).toBe(true);
    expect(res.chosenIndex).toBe(3);
    expect(res.p[3]).toBeCloseTo(0.7, 2);
  });
});

describe("worker/mammoth scoreOptions fail-safe behavior", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns uniform fallback without API key without throwing", async () => {
    const res = await scoreOptions(undefined, "some state", dummyOptions);
    expect(res.ok).toBe(false);
    expect(res.p).toEqual([0.25, 0.25, 0.25, 0.25]);
  });

  it("returns uniform fallback when network / upstream fails without throwing 500", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Baseten timeout"));
    const res = await scoreOptions("fake-baseten-key", "some state", dummyOptions);
    expect(res.ok).toBe(false);
    expect(res.p).toEqual([0.25, 0.25, 0.25, 0.25]);
  });
});
