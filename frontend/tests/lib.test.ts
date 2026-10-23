import { describe, it, expect } from "vitest";
import { easeOutCubic, lerp } from "../src/lib/ease";
import { hexA } from "../src/lib/color";
import { createRNG, randomRange } from "../src/lib/rand";

describe("lib/ease", () => {
  it("easeOutCubic starts at 0 and ends at 1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 4);
  });

  it("lerp works as expected", () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
    expect(lerp(10, 20, 0.5)).toBe(15);
  });
});

describe("lib/color", () => {
  it("hexA parses 6-digit hex and applies alpha", () => {
    expect(hexA("#FF5D5D", 0.5)).toBe("rgba(255, 93, 93, 0.5)");
    expect(hexA("4ADE80", 1)).toBe("rgba(74, 222, 128, 1)");
  });

  it("hexA parses 3-digit hex", () => {
    expect(hexA("#FFF", 0.2)).toBe("rgba(255, 255, 255, 0.2)");
  });

  it("hexA falls back on invalid input", () => {
    expect(hexA("invalid", 0.8)).toBe("rgba(255, 255, 255, 0.8)");
  });
});

describe("lib/rand", () => {
  it("produces deterministic numbers with same seed", () => {
    const rng1 = createRNG(12345);
    const rng2 = createRNG(12345);
    const val1 = [rng1(), rng1(), rng1()];
    const val2 = [rng2(), rng2(), rng2()];
    expect(val1).toEqual(val2);
  });

  it("produces numbers in [0, 1) range", () => {
    const rng = createRNG(42);
    for (let i = 0; i < 50; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it("randomRange works as expected", () => {
    const rng = createRNG(99);
    const val = randomRange(rng, 10, 20);
    expect(val).toBeGreaterThanOrEqual(10);
    expect(val).toBeLessThan(20);
  });
});
