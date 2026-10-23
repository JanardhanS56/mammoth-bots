/**
 * Mulberry32 seeded pseudo-random number generator
 */
export function createRNG(seed: number): () => number {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a random float between min (inclusive) and max (exclusive)
 */
export function randomRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}
